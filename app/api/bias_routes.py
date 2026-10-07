"""
EasyRecruit ATS 3.0 — Bias-Free Hiring Module
Anonymizes candidate PII (name, gender markers, age, photo references, religion)
before scoring. Returns a bias-free score alongside the original for comparison.

Endpoints:
  POST /api/v1/bias/anonymize         — anonymize resume text
  POST /api/v1/bias/blind-score       — score resume without PII
  POST /api/v1/bias/compare           — side-by-side: biased vs blind score
"""
import logging
import os
import re
import tempfile
from typing import Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool

from app.api.auth_routes import get_optional_user
from app.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/bias", tags=["Bias-Free Hiring"])

_pdf_parser  = None
_docx_parser = None
_extractor   = None
_scorer      = None

def _get_pdf():
    global _pdf_parser
    if _pdf_parser is None:
        from app.parsers.pdf_parser import PDFParser
        _pdf_parser = PDFParser()
    return _pdf_parser

def _get_docx():
    global _docx_parser
    if _docx_parser is None:
        from app.parsers.docx_parser import DOCXParser
        _docx_parser = DOCXParser()
    return _docx_parser

def _get_extractor():
    global _extractor
    if _extractor is None:
        from app.nlp.keyword_extractor import KeywordExtractor
        _extractor = KeywordExtractor()
    return _extractor

def _get_scorer():
    global _scorer
    if _scorer is None:
        from app.nlp.enhanced_scorer import EnhancedScorer
        _scorer = EnhancedScorer()
    return _scorer

def _cleanup(path: str):
    try:
        if path and os.path.exists(path):
            os.remove(path)
    except Exception:
        pass


# ── Anonymization patterns ────────────────────────────────────────────────────

# Indian & global name patterns (honorifics + common first names)
HONORIFICS = re.compile(
    r'\b(Mr\.?|Mrs\.?|Ms\.?|Dr\.?|Prof\.?|Er\.?|Shri\.?|Smt\.?|Kumari\.?|Sri\.?)\s+',
    re.IGNORECASE
)

# Email — replace with placeholder
EMAIL_PATTERN = re.compile(
    r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'
)

# Phone numbers
PHONE_PATTERN = re.compile(
    r'[\+]?[\d\s\-().]{10,15}'
)

# LinkedIn / GitHub / personal URLs
URL_PATTERN = re.compile(
    r'(?:https?://)?(?:www\.)?(?:linkedin\.com|github\.com|gitlab\.com|twitter\.com|instagram\.com)'
    r'[^\s\n,<>]*',
    re.IGNORECASE
)

# Gender markers
GENDER_PATTERN = re.compile(
    r'\b(male|female|man|woman|he/him|she/her|they/them|gender\s*:\s*\w+|m/f|f/m)\b',
    re.IGNORECASE
)

# Age / DOB patterns
AGE_PATTERN = re.compile(
    r'\b(?:age|dob|date\s+of\s+birth|born|d\.o\.b)[:\s]*[\d/.\-,\s]{4,20}',
    re.IGNORECASE
)
DOB_PATTERN = re.compile(
    r'\b\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}\b'  # DD/MM/YYYY style
)

# Religion / caste (Indian context)
RELIGION_PATTERN = re.compile(
    r'\b(hindu|muslim|christian|sikh|jain|buddhist|parsi|brahmin|kshatriya|'
    r'sc|st|obc|general category|caste\s*:\s*\w+|religion\s*:\s*\w+)\b',
    re.IGNORECASE
)

# Marital status
MARITAL_PATTERN = re.compile(
    r'\b(?:marital\s+status|married|unmarried|single|divorced|widowed)\b',
    re.IGNORECASE
)

# Photo / passport / address indicators
PERSONAL_INFO_PATTERN = re.compile(
    r'\b(?:photo|photograph|passport size|father\'?s?\s+name|mother\'?s?\s+name|'
    r'nationality|permanent\s+address|residential\s+address|'
    r'home\s+address|current\s+address|place\s+of\s+birth)\b[^\n]*',
    re.IGNORECASE
)

# Name extraction heuristic: first line or "Name: ..." pattern
NAME_LABEL_PATTERN = re.compile(
    r'(?:name\s*[:\-]\s*)([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})',
    re.IGNORECASE
)


def _anonymize_text(text: str) -> Tuple[str, Dict]:
    """
    Remove / replace all PII from resume text.
    Returns (anonymized_text, report_of_what_was_removed).
    """
    removed = {
        "emails": [],
        "phones": [],
        "urls": [],
        "gender_markers": [],
        "age_dob": [],
        "religion_caste": [],
        "marital_status": [],
        "personal_info_lines": [],
        "honorifics": 0,
        "name_detected": None,
    }

    anonymized = text

    # 1. Extract name for report (don't replace — needed for ID)
    name_match = NAME_LABEL_PATTERN.search(anonymized)
    if name_match:
        removed["name_detected"] = name_match.group(1)

    # Try first non-empty line as candidate name
    first_lines = [l.strip() for l in text.splitlines() if l.strip()]
    if first_lines and re.match(r'^[A-Z][a-z]+(?: [A-Z][a-z]+)+$', first_lines[0]):
        removed["name_detected"] = first_lines[0]

    # 2. Emails
    emails = EMAIL_PATTERN.findall(anonymized)
    removed["emails"] = emails
    anonymized = EMAIL_PATTERN.sub("[EMAIL REDACTED]", anonymized)

    # 3. Phone numbers (be conservative — avoid removing years)
    phones = PHONE_PATTERN.findall(anonymized)
    # Filter: must have at least 7 consecutive digits
    real_phones = [p for p in phones if len(re.sub(r'\D', '', p)) >= 7]
    removed["phones"] = [p.strip() for p in real_phones]
    for ph in real_phones:
        anonymized = anonymized.replace(ph, " [PHONE REDACTED] ", 1)

    # 4. Social URLs
    urls = URL_PATTERN.findall(anonymized)
    removed["urls"] = urls
    anonymized = URL_PATTERN.sub("[PROFILE REDACTED]", anonymized)

    # 5. Honorifics (Mr, Mrs, Dr, Shri, etc.)
    removed["honorifics"] = len(HONORIFICS.findall(anonymized))
    anonymized = HONORIFICS.sub("", anonymized)

    # 6. Gender markers
    gender = GENDER_PATTERN.findall(anonymized)
    removed["gender_markers"] = list(set(gender))
    anonymized = GENDER_PATTERN.sub("[GENDER REDACTED]", anonymized)

    # 7. Age / DOB
    age_matches = AGE_PATTERN.findall(anonymized)
    dob_matches = DOB_PATTERN.findall(anonymized)
    removed["age_dob"] = age_matches + dob_matches
    anonymized = AGE_PATTERN.sub("[AGE REDACTED]", anonymized)
    anonymized = DOB_PATTERN.sub("[DOB REDACTED]", anonymized)

    # 8. Religion / caste
    religion = RELIGION_PATTERN.findall(anonymized)
    removed["religion_caste"] = list(set(religion))
    anonymized = RELIGION_PATTERN.sub("[RELIGION/CASTE REDACTED]", anonymized)

    # 9. Marital status
    marital = MARITAL_PATTERN.findall(anonymized)
    removed["marital_status"] = list(set(marital))
    anonymized = MARITAL_PATTERN.sub("[MARITAL STATUS REDACTED]", anonymized)

    # 10. Personal info lines (photo, address, father's name, etc.)
    personal = PERSONAL_INFO_PATTERN.findall(anonymized)
    removed["personal_info_lines"] = [p.strip()[:60] for p in personal]
    anonymized = PERSONAL_INFO_PATTERN.sub("[PERSONAL INFO REDACTED]", anonymized)

    total_removed = (
        len(removed["emails"]) + len(removed["phones"]) +
        len(removed["gender_markers"]) + len(removed["age_dob"]) +
        len(removed["religion_caste"]) + len(removed["marital_status"]) +
        len(removed["personal_info_lines"]) + removed["honorifics"]
    )

    return anonymized, {**removed, "total_items_removed": total_removed}


def _bias_score_comparison(
    original_text: str,
    anonymized_text: str,
    job_description: Optional[str],
) -> Dict:
    """Run ATS scoring on both original and anonymized text."""
    scorer = _get_scorer()

    try:
        original_score = scorer.calculate_ats_score(original_text, job_description)
    except Exception as e:
        logger.warning(f"Original scoring failed: {e}")
        original_score = {"overall_score": 0}

    try:
        blind_score = scorer.calculate_ats_score(anonymized_text, job_description)
    except Exception as e:
        logger.warning(f"Blind scoring failed: {e}")
        blind_score = {"overall_score": 0}

    orig = original_score.get("overall_score", 0)
    blind = blind_score.get("overall_score", 0)
    diff = round(orig - blind, 2)

    bias_detected = abs(diff) > 3  # more than 3 point difference suggests bias impact

    return {
        "original_score": orig,
        "blind_score": blind,
        "score_difference": diff,
        "bias_detected": bias_detected,
        "bias_interpretation": (
            f"Score dropped by {abs(diff)} points after removing PII — "
            "suggests the original score may have been influenced by identity markers."
            if diff > 3 else
            f"Score increased by {abs(diff)} points after removing PII — "
            "identity markers may have been penalizing this candidate."
            if diff < -3 else
            "Score difference is minimal — bias impact appears low."
        ),
        "recommendation": (
            "Use the blind score for shortlisting to ensure fair evaluation."
            if bias_detected else
            "Both scores are similar. Bias impact is minimal for this resume."
        ),
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/anonymize")
async def anonymize_resume(
    file: UploadFile = File(...),
    current_user: Optional[dict] = Depends(get_optional_user),
):
    """Upload a resume and get back an anonymized version with a report of what was removed."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided.")

    filename_lower = file.filename.lower()
    is_pdf  = filename_lower.endswith(".pdf")
    is_docx = filename_lower.endswith((".docx", ".doc"))
    if not is_pdf and not is_docx:
        raise HTTPException(status_code=415, detail="Only PDF and DOCX supported.")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="File is empty.")

    suffix = ".pdf" if is_pdf else ".docx"
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(content)
            temp_path = tmp.name

        resume_text = _get_pdf().extract_text(temp_path) if is_pdf else _get_docx().extract_text(temp_path)

        if not resume_text or len(resume_text.strip()) < 50:
            raise HTTPException(status_code=400, detail="Could not extract text.")

        anonymized_text, removal_report = _anonymize_text(resume_text)

        return {
            "filename": file.filename,
            "original_length": len(resume_text),
            "anonymized_length": len(anonymized_text),
            "anonymized_text": anonymized_text,
            "removal_report": removal_report,
            "candidate_id": removal_report.get("name_detected", "Candidate"),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Anonymize error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Anonymization failed.")
    finally:
        _cleanup(temp_path)


async def _blind_score_core(resume_text: str, job_description: Optional[str]) -> dict:
    if not resume_text or len(resume_text.strip()) < 50:
        raise HTTPException(status_code=400, detail="Could not extract enough text.")

    anonymized_text, removal_report = _anonymize_text(resume_text)

    scorer = await run_in_threadpool(_get_scorer)
    score_result = await run_in_threadpool(scorer.calculate_ats_score, anonymized_text, job_description)

    return {
        "mode": "blind_scoring",
        "pii_removed": removal_report["total_items_removed"],
        "overall_score": score_result.get("overall_score", 0),
        "keyword_match_score": score_result.get("keyword_match_score", 0),
        "skill_match_score": score_result.get("skill_match_score", 0),
        "structure_score": score_result.get("structure_score", 0),
        "breakdown": score_result.get("breakdown", {}),
        "removal_report": removal_report,
    }


@router.post("/blind-score")
async def blind_score(
    file: UploadFile = File(...),
    job_description: Optional[str] = Form(None),
    current_user: Optional[dict] = Depends(get_optional_user),
):
    """Score a resume with all PII removed — for unbiased candidate ranking."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided.")

    filename_lower = file.filename.lower()
    is_pdf  = filename_lower.endswith(".pdf")
    is_docx = filename_lower.endswith((".docx", ".doc"))
    if not is_pdf and not is_docx:
        raise HTTPException(status_code=415, detail="Only PDF and DOCX supported.")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="File is empty.")

    suffix = ".pdf" if is_pdf else ".docx"
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(content)
            temp_path = tmp.name

        resume_text = _get_pdf().extract_text(temp_path) if is_pdf else _get_docx().extract_text(temp_path)
        if not resume_text or len(resume_text.strip()) < 50:
            raise HTTPException(status_code=400, detail="Could not extract text.")

        result = await _blind_score_core(resume_text, job_description)
        result["filename"] = file.filename
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Blind score error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Blind scoring failed.")
    finally:
        _cleanup(temp_path)


@router.post("/blind-score-text")
async def blind_score_text(
    resume_text: str = Form(...),
    job_description: Optional[str] = Form(None),
    current_user: Optional[dict] = Depends(get_optional_user),
):
    """Score pasted resume text with all PII removed — text-input twin of /blind-score."""
    try:
        result = await _blind_score_core(resume_text, job_description)
        result["filename"] = None
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Blind score (text) error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Blind scoring failed.")


async def _compare_core(resume_text: str, job_description: Optional[str]) -> dict:
    if not resume_text or len(resume_text.strip()) < 50:
        raise HTTPException(status_code=400, detail="Could not extract enough text.")

    anonymized_text, removal_report = _anonymize_text(resume_text)
    comparison = await run_in_threadpool(_bias_score_comparison, resume_text, anonymized_text, job_description)

    return {
        "pii_removed": removal_report["total_items_removed"],
        "removal_report": removal_report,
        **comparison,
    }


@router.post("/compare")
async def compare_biased_vs_blind(
    file: UploadFile = File(...),
    job_description: Optional[str] = Form(None),
    current_user: Optional[dict] = Depends(get_optional_user),
):
    """Compare original score vs blind score to detect potential bias."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided.")

    filename_lower = file.filename.lower()
    is_pdf  = filename_lower.endswith(".pdf")
    is_docx = filename_lower.endswith((".docx", ".doc"))
    if not is_pdf and not is_docx:
        raise HTTPException(status_code=415, detail="Only PDF and DOCX supported.")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="File is empty.")

    suffix = ".pdf" if is_pdf else ".docx"
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(content)
            temp_path = tmp.name

        resume_text = _get_pdf().extract_text(temp_path) if is_pdf else _get_docx().extract_text(temp_path)
        if not resume_text or len(resume_text.strip()) < 50:
            raise HTTPException(status_code=400, detail="Could not extract text.")

        result = await _compare_core(resume_text, job_description)
        result["filename"] = file.filename
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Bias compare error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Bias comparison failed.")
    finally:
        _cleanup(temp_path)


@router.post("/compare-text")
async def compare_biased_vs_blind_text(
    resume_text: str = Form(...),
    job_description: Optional[str] = Form(None),
    current_user: Optional[dict] = Depends(get_optional_user),
):
    """
    Compare original vs blind score for pasted resume text — text-input twin
    of /compare. This is what the frontend's "Paste Text" tab on the
    Bias-Free Score page actually calls; without it, every submission from
    that tab failed with a missing-required-field error, since /compare
    only ever accepted a file upload.
    """
    try:
        result = await _compare_core(resume_text, job_description)
        result["filename"] = None
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Bias compare (text) error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Bias comparison failed.")
