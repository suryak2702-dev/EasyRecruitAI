"""
EasyRecruit ATS 3.0 — Public API Routes
Quick-analysis endpoint (no auth required), batch analysis, health check.
"""
import json
import logging
import os
import tempfile
from typing import List, Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.config import settings
from app.parsers.pdf_parser import PDFParser
from app.parsers.docx_parser import DOCXParser

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1", tags=["Public"])

# Eager-init parsers (lightweight)
_pdf_parser  = PDFParser()
_docx_parser = DOCXParser()

# Lazy NLP
_extractor = None
_scorer    = None


def _get_extractor():
    global _extractor
    if _extractor is None:
        from app.nlp.keyword_extractor import KeywordExtractor
        _extractor = KeywordExtractor()
    return _extractor


def _get_scorer():
    global _scorer
    if _scorer is None:
        from app.nlp.resume_scorer import ResumeScorer
        _scorer = ResumeScorer()
    return _scorer


def _cleanup(path: str):
    try:
        if path and os.path.exists(path):
            os.remove(path)
    except Exception as exc:
        logger.debug(f"Temp-file cleanup failed for '{path}': {exc}")


def _validate_file(file: UploadFile):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided. Please attach a file.")
    filename_lower = file.filename.lower()
    is_pdf  = filename_lower.endswith(".pdf") or "pdf" in (file.content_type or "")
    is_docx = filename_lower.endswith((".docx", ".doc")) or "word" in (file.content_type or "") or "msword" in (file.content_type or "")
    if not is_pdf and not is_docx:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type '{file.content_type}' for '{file.filename}'. Only PDF and DOCX files are accepted.",
        )


async def _extract_text(file: UploadFile) -> tuple[str, str]:
    """Return (text, temp_path). Caller must clean up temp_path."""
    filename_lower = (file.filename or "").lower()
    suffix = ".pdf" if filename_lower.endswith(".pdf") else ".docx"
    use_pdf = filename_lower.endswith(".pdf") or (
        not filename_lower.endswith((".docx", ".doc")) and "pdf" in (file.content_type or "")
    )
    content = await file.read()

    if len(content) == 0:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")

    if len(content) > settings.MAX_FILE_SIZE:
        size_mb = len(content) / (1024 * 1024)
        max_mb  = settings.MAX_FILE_SIZE / (1024 * 1024)
        raise HTTPException(
            status_code=413,
            detail=f"File too large ({size_mb:.1f} MB). Maximum allowed size is {max_mb:.0f} MB.",
        )

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(content)
        temp_path = tmp.name

    try:
        if use_pdf:
            text = _pdf_parser.extract_text(temp_path)
        else:
            text = _docx_parser.extract_text(temp_path)
    except Exception as e:
        _cleanup(temp_path)
        raise HTTPException(
            status_code=422,
            detail=(
                f"Could not extract text from '{file.filename}'. "
                f"The file may be corrupt, password-protected, or scanned-only. "
                f"({str(e)[:120]})"
            ),
        )

    return text, temp_path


@router.post("/analyze", tags=["Public"])
async def analyze_resume(
    file:            UploadFile    = File(...),
    job_description: Optional[str] = Form(None),
    required_skills: Optional[str] = Form(None),
):
    """
    Quick resume analysis — no login required.
    Results are NOT saved to the database.
    """
    _validate_file(file)
    temp_path = None

    try:
        text, temp_path = await _extract_text(file)

        if not text or len(text.strip()) < 50:
            raise HTTPException(status_code=400, detail="Could not extract sufficient text.")

        skills_dict = None
        if required_skills:
            try:
                skills_dict = json.loads(required_skills)
            except json.JSONDecodeError:
                pass

        extractor    = _get_extractor()
        scorer       = _get_scorer()
        # v9 extractor: full_analysis may not exist; use modular fallback
        try:
            nlp_analysis = extractor.full_analysis(text)
        except AttributeError:
            try:
                _si = extractor.extract_skills(text)
                _ci = extractor.extract_contact_info(text)
                nlp_analysis = {
                    "contact_info": _ci,
                    "skills": _si,
                    "keywords": extractor.extract_keywords(text, top_k=20),
                    "candidate_name": _ci.get("name"),
                    "indian_context": _si.get("indian_context", {}),
                }
            except Exception as _e:
                logger.error(f"NLP fallback failed: {_e}")
                nlp_analysis = {"contact_info": {}, "keywords": [], "skills": [], "indian_context": {}}
        except Exception as _e:
            logger.error(f"NLP analysis error: {_e}")
            nlp_analysis = {"contact_info": {}, "keywords": [], "skills": [], "indian_context": {}}

        score_result = scorer.calculate_ats_score(text, job_description, skills_dict)

        return {
            "analysis_id":         None,
            "filename":            file.filename,
            "file_type":           "pdf" if (file.filename or "").lower().endswith(".pdf") else "docx",
            "extracted_text_length": len(text),
            "overall_score":       score_result.get("overall_score", 0),
            "keyword_match_score": score_result.get("keyword_match_score", 0),
            "skill_match_score":   score_result.get("skill_match_score", 0),
            "structure_score":     score_result.get("structure_score", 0),
            "semantic_similarity": score_result.get("semantic_similarity"),
            "keywords":            nlp_analysis.get("keywords", []),
            "skills":              nlp_analysis.get("skills", []),
            "recommendations":     score_result.get("breakdown", {}).get("recommendations", []),
            "breakdown":           score_result.get("breakdown", {}),
            "detected_domain":     score_result.get("detected_domain", "general"),
            "india_context_bonus": score_result.get("india_context_bonus", 0.0),
            "indian_context":      score_result.get("indian_context", {}),
            "nlp_analysis":        nlp_analysis,
            "status":              "completed",
        }

    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Public analyze error: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail="Analysis failed unexpectedly. Please try again.")
    finally:
        _cleanup(temp_path)


@router.post("/analyze/batch")
async def analyze_batch(
    files:           List[UploadFile] = File(...),
    job_description: Optional[str]   = Form(None),
):
    """Analyze up to 10 resumes at once."""
    if len(files) > 10:
        raise HTTPException(status_code=400, detail="Maximum 10 files per request.")

    results, errors = [], []
    for f in files:
        temp_path = None
        try:
            _validate_file(f)
            text, temp_path = await _extract_text(f)
            if text and len(text.strip()) >= 50:
                scorer = _get_scorer()
                score  = scorer.calculate_ats_score(text, job_description)
                results.append({"filename": f.filename, **score})
            else:
                errors.append({"filename": f.filename, "error": "Insufficient text extracted from file"})
        except HTTPException as exc:
            errors.append({"filename": f.filename, "error": exc.detail})
        except MemoryError:
            logger.error(f"MemoryError processing batch file: {f.filename}")
            errors.append({"filename": f.filename, "error": "File too large to process in memory"})
        except Exception as exc:
            logger.error(f"Batch analysis error for {f.filename}: {exc}")
            errors.append({"filename": f.filename, "error": "Unexpected error during analysis"})
        finally:
            _cleanup(temp_path)

    return {
        "total":      len(files),
        "successful": len(results),
        "failed":     len(errors),
        "results":    results,
        "errors":     errors,
    }


@router.post("/extract-text")
async def extract_text_only(file: UploadFile = File(...)):
    """Extract raw text from a resume without scoring."""
    _validate_file(file)
    temp_path = None
    try:
        text, temp_path = await _extract_text(file)
        return {
            "filename":       file.filename,
            "extracted_text": text,
            "text_length":    len(text) if text else 0,
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        _cleanup(temp_path)


@router.get("/health")
async def health_check():
    """Service health check."""
    from datetime import datetime
    from app.config import settings as cfg
    from app.db.database import db as _db

    db_ok = "ok"
    try:
        _db.fetch_one("SELECT 1")
    except Exception:
        db_ok = "error"

    return {
        "status":   "healthy",
        "version":  cfg.API_VERSION,
        "database": db_ok,
        "services": {
            "pdf_parser":        "ready",
            "docx_parser":       "ready",
            "keyword_extractor": "ready" if _extractor else "lazy",
            "scorer":            "ready" if _scorer else "lazy",
        },
        "timestamp": datetime.utcnow().isoformat(),
    }


@router.get("/skills-database")
async def get_skills_database():
    """Return the full skill taxonomy used for analysis."""
    extractor = _get_extractor()
    db_map    = extractor.SKILL_DATABASE
    return {
        "categories":   list(db_map.keys()),
        "total_skills": sum(len(v) for v in db_map.values()),
        "skills":       db_map,
    }
