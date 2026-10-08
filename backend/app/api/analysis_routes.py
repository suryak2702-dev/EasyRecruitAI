"""
EasyRecruit ATS 3.0 — Analysis Routes
Improvements:
  • File-size validation before reading into memory
  • Candidate contact info saved to DB
  • Richer stats (highest/lowest score, top skills)
  • Proper delete endpoint for analyses
  • Consistent Depends() for auth
"""
import asyncio
import json
import logging
import os
import tempfile
from typing import List, Optional

from fastapi import (
    APIRouter, Depends, File, Form, Header, HTTPException, Query,
    UploadFile, status,
)
from fastapi.concurrency import run_in_threadpool

from app.api.auth_routes import get_current_user, get_optional_user
from app.config import settings
from app.db.database import db
from app.models.schemas import (
    APIResponse, CustomDatasetCreate, CustomDatasetResponse,
    PaginatedResponse, ResumeAnalysisFullResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/analysis", tags=["Resume Analysis"])


# ────────────────────────────────────────────────────────────────────────────
# Lazy-loaded NLP singletons
# ────────────────────────────────────────────────────────────────────────────

_pdf_parser       = None
_docx_parser      = None
_keyword_extractor = None
_enhanced_scorer  = None


def _get_pdf_parser():
    global _pdf_parser
    if _pdf_parser is None:
        from app.parsers.pdf_parser import PDFParser
        _pdf_parser = PDFParser()
    return _pdf_parser


def _get_docx_parser():
    global _docx_parser
    if _docx_parser is None:
        from app.parsers.docx_parser import DOCXParser
        _docx_parser = DOCXParser()
    return _docx_parser


def _get_extractor():
    global _keyword_extractor
    if _keyword_extractor is None:
        from app.nlp.keyword_extractor import KeywordExtractor
        _keyword_extractor = KeywordExtractor()
    return _keyword_extractor


def _get_scorer():
    global _enhanced_scorer
    if _enhanced_scorer is None:
        from app.nlp.enhanced_scorer import EnhancedScorer
        _enhanced_scorer = EnhancedScorer()
    return _enhanced_scorer


def _extract_text_sync(temp_path: str, use_pdf: bool) -> str:
    """Blocking file parsing — always call via run_in_threadpool."""
    if use_pdf:
        return _get_pdf_parser().extract_text(temp_path)
    return _get_docx_parser().extract_text(temp_path)


def _run_nlp_pipeline_sync(text: str, job_description: Optional[str], skills_dict: Optional[dict]):
    """
    Runs extraction + scoring. This is where the (first-call-only) sentence-
    transformer model load can happen, which may block for a while on a slow
    or unreachable network. Always call via run_in_threadpool so a single
    slow request can't freeze the server for every other user.
    """
    extractor = _get_extractor()
    scorer    = _get_scorer()

    # v9 extractor uses modular methods; fall back gracefully if full_analysis absent
    try:
        nlp_analysis = extractor.full_analysis(text)
    except (AttributeError, Exception) as _attr_exc:
        # full_analysis not present — build equivalent structure from modular methods
        logger.warning(f"full_analysis unavailable ({type(_attr_exc).__name__}), using modular fallback")
        try:
            _skills_info   = extractor.extract_skills(text)
            _keywords_info = extractor.extract_keywords(text, top_k=20)
            _contact_info  = extractor.extract_contact_info(text)
            # Build a flat list of skill names for frontend consumption
            _flat_skills = []
            for _cat_skills in _skills_info.get("categorized_skills", {}).values():
                if isinstance(_cat_skills, list):
                    for _s in _cat_skills:
                        if isinstance(_s, dict):
                            _flat_skills.append(_s.get("skill", ""))
                        elif isinstance(_s, str):
                            _flat_skills.append(_s)
            _flat_skills = [s for s in _flat_skills if s]

            nlp_analysis = {
                "contact_info":   _contact_info,
                "skills":         _flat_skills,          # flat list — safe for frontend spread
                "skills_detail":  _skills_info,          # full dict for advanced use
                "keywords":       [k["keyword"] for k in _keywords_info if isinstance(k, dict)],
                "candidate_name": _contact_info.get("name"),
                "indian_context": _skills_info.get("indian_context", {}),
            }
        except Exception as _nlp_exc:
            logger.error(f"NLP modular fallback failed: {_nlp_exc}")
            nlp_analysis = {
                "contact_info": {}, "candidate_name": None,
                "skills": [], "keywords": [], "indian_context": {},
            }

    score_result = scorer.calculate_ats_score(text, job_description, skills_dict)
    return nlp_analysis, score_result


# ────────────────────────────────────────────────────────────────────────────
# Helpers
# ────────────────────────────────────────────────────────────────────────────

def _cleanup(path: str):
    try:
        if path and os.path.exists(path):
            os.remove(path)
    except Exception as exc:
        logger.debug(f"Temp-file cleanup: {exc}")


def _get_analysis(analysis_id: int) -> Optional[dict]:
    return db.fetch_one(
        "SELECT * FROM resume_analyses WHERE id = ?", (analysis_id,)
    )


def _paginate(user_id: int, page: int, per_page: int) -> dict:
    total_row = db.fetch_one(
        "SELECT COUNT(*) as total FROM resume_analyses WHERE user_id = ?", (user_id,)
    )
    total = total_row["total"] if total_row else 0
    offset = (page - 1) * per_page
    rows = db.fetch_all(
        """SELECT id, filename, overall_score, keyword_score, skill_score,
                  structure_score, semantic_score, candidate_name, candidate_email,
                  detected_domain, status, created_at, job_id
           FROM resume_analyses
           WHERE user_id = ?
           ORDER BY created_at DESC
           LIMIT ? OFFSET ?""",
        (user_id, per_page, offset),
    )
    total_pages = max(1, (total + per_page - 1) // per_page)
    return {
        "items":       rows,
        "total":       total,
        "page":        page,
        "page_size":   per_page,
        "total_pages": total_pages,
        "has_next":    page < total_pages,
        "has_prev":    page > 1,
    }


# ────────────────────────────────────────────────────────────────────────────
# SPECIFIC routes BEFORE dynamic
# ────────────────────────────────────────────────────────────────────────────

@router.get("/history", response_model=List[dict])
async def get_history(
    limit: int = Query(20, ge=1, le=100),
    current_user: Optional[dict] = Depends(get_optional_user),
):
    if not current_user:
        return []
    return db.fetch_all(
        """SELECT * FROM analysis_history
           WHERE user_id = ?
           ORDER BY created_at DESC
           LIMIT ?""",
        (current_user["id"], limit),
    )


@router.get("/stats/summary")
async def get_stats(current_user: Optional[dict] = Depends(get_optional_user)):
    empty = {
        "total_analyses": 0, "average_score": 0,
        "highest_score": 0, "lowest_score": 0,
        "score_distribution": {"0-20": 0, "20-40": 0, "40-60": 0, "60-80": 0, "80-100": 0},
        "recent_activity_7_days": 0,
        "total_jobs": 0, "total_datasets": 0, "top_skills_found": [],
    }
    if not current_user:
        return empty

    uid = current_user["id"]

    agg = db.fetch_one(
        """SELECT COUNT(*) as cnt,
                  AVG(overall_score)  as avg_score,
                  MAX(overall_score)  as max_score,
                  MIN(overall_score)  as min_score
           FROM resume_analyses WHERE user_id = ?""",
        (uid,),
    )

    total     = agg["cnt"]       if agg else 0
    avg_score = round(agg["avg_score"] or 0, 2) if agg else 0
    max_score = round(agg["max_score"] or 0, 2) if agg else 0
    min_score = round(agg["min_score"] or 0, 2) if agg else 0

    dist = {}
    for label, lo, hi in [
        ("0-20",   0,  20),
        ("20-40",  20, 40),
        ("40-60",  40, 60),
        ("60-80",  60, 80),
        ("80-100", 80, 101),
    ]:
        row = db.fetch_one(
            """SELECT COUNT(*) as cnt FROM resume_analyses
               WHERE user_id = ? AND overall_score >= ? AND overall_score < ?""",
            (uid, lo, hi),
        )
        dist[label] = row["cnt"] if row else 0

    recent = db.fetch_one(
        """SELECT COUNT(*) as cnt FROM analysis_history
           WHERE user_id = ? AND created_at > datetime('now','-7 days')""",
        (uid,),
    )

    total_jobs = db.fetch_one(
        "SELECT COUNT(*) as cnt FROM job_descriptions WHERE user_id = ? AND is_active = 1",
        (uid,),
    )
    total_ds = db.fetch_one(
        "SELECT COUNT(*) as cnt FROM custom_datasets WHERE user_id = ? AND is_active = 1",
        (uid,),
    )

    return {
        "total_analyses":         total,
        "average_score":          avg_score,
        "highest_score":          max_score,
        "lowest_score":           min_score,
        "score_distribution":     dist,
        "recent_activity_7_days": recent["cnt"] if recent else 0,
        "total_jobs":             total_jobs["cnt"] if total_jobs else 0,
        "total_datasets":         total_ds["cnt"]   if total_ds   else 0,
        "top_skills_found":       [],  # populated from NLP if needed
    }


@router.get("/datasets", response_model=List[dict])
async def list_datasets(current_user: Optional[dict] = Depends(get_optional_user)):
    if not current_user:
        return []
    return db.fetch_all(
        "SELECT * FROM custom_datasets WHERE user_id = ? AND is_active = 1",
        (current_user["id"],),
    )


@router.post("/datasets", response_model=CustomDatasetResponse, status_code=status.HTTP_201_CREATED)
async def create_dataset(
    dataset: CustomDatasetCreate,
    current_user: dict = Depends(get_current_user),
):
    ds_id = db.insert(
        """INSERT INTO custom_datasets (user_id, name, description, category, skills, keywords)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (
            current_user["id"],
            dataset.name,
            dataset.description,
            dataset.category.value,
            json.dumps(dataset.skills)    if dataset.skills    else None,
            json.dumps(dataset.keywords)  if dataset.keywords  else None,
        ),
    )
    logger.info(f"Dataset created: '{dataset.name}' by user {current_user['id']}")
    return db.fetch_one("SELECT * FROM custom_datasets WHERE id = ?", (ds_id,))


# ────────────────────────────────────────────────────────────────────────────
# List / delete individual analyses
# ────────────────────────────────────────────────────────────────────────────

@router.get("/", response_model=PaginatedResponse)
async def list_analyses(
    page:     int = Query(1, ge=1),
    per_page: int = Query(10, ge=1, le=100),
    current_user: Optional[dict] = Depends(get_optional_user),
):
    if not current_user:
        return {"items": [], "total": 0, "page": 1, "page_size": per_page,
                "total_pages": 0, "has_next": False, "has_prev": False}
    return _paginate(current_user["id"], page, per_page)


@router.get("/{analysis_id}", response_model=dict)
async def get_analysis(
    analysis_id: int,
    current_user: dict = Depends(get_current_user),
):
    row = _get_analysis(analysis_id)
    if not row:
        raise HTTPException(status_code=404, detail="Analysis not found.")
    if row.get("user_id") and row["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Not authorised.")
    return row


@router.delete("/{analysis_id}", response_model=APIResponse)
async def delete_analysis(
    analysis_id: int,
    current_user: dict = Depends(get_current_user),
):
    row = _get_analysis(analysis_id)
    if not row:
        raise HTTPException(status_code=404, detail="Analysis not found.")
    if row.get("user_id") != current_user["id"]:
        raise HTTPException(status_code=403, detail="Not authorised.")
    db.execute("DELETE FROM resume_analyses WHERE id = ?", (analysis_id,))
    return {"success": True, "message": "Analysis deleted.", "data": None}


# ────────────────────────────────────────────────────────────────────────────
# CORE: Analyse resume
# ────────────────────────────────────────────────────────────────────────────

async def _analyze_single_file(
    file: UploadFile,
    job_description: Optional[str],
    skills_dict: Optional[dict],
    job_id: Optional[int],
    current_user: Optional[dict],
) -> dict:
    """
    Full analyze pipeline for ONE file: validate, extract, score, optionally
    persist, and build the response dict. Raises HTTPException on failure.

    Shared by both /analyze (single file) and /analyze-batch (many files),
    so a resume is scored exactly the same way and with exactly the same
    validation no matter which endpoint processed it — and a fix here
    never needs to be made twice.
    """
    filename_lower = (file.filename or "").lower()
    is_pdf  = (
        file.content_type in ("application/pdf", "binary/octet-stream", "application/octet-stream")
        or filename_lower.endswith(".pdf")
    )
    is_docx = (
        file.content_type in (
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/msword",
            "application/zip",
            "binary/octet-stream",
            "application/octet-stream",
        )
        or filename_lower.endswith(".docx")
        or filename_lower.endswith(".doc")
    )

    if not is_pdf and not is_docx:
        raise HTTPException(
            status_code=415,
            detail=(
                f"Unsupported file type. Received content-type '{file.content_type}' "
                f"for file '{file.filename}'. Please upload a PDF or DOCX file."
            ),
        )

    # Use filename extension to determine parser (more reliable than MIME)
    if filename_lower.endswith(".pdf"):
        suffix, use_pdf = ".pdf", True
    elif filename_lower.endswith(".docx") or filename_lower.endswith(".doc"):
        suffix, use_pdf = ".docx", False
    else:
        # Fall back to content-type
        suffix, use_pdf = (".pdf", True) if is_pdf else (".docx", False)

    temp_path = None

    try:
        # ── Save to temp file (with size check) ──
        content = await file.read()
        if len(content) > settings.MAX_FILE_SIZE:
            raise HTTPException(
                status_code=413,
                detail=f"File exceeds maximum size of {settings.MAX_FILE_SIZE // (1024*1024)} MB.",
            )

        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(content)
            temp_path = tmp.name

        # ── Extract text (offloaded to a worker thread — parsing large
        #    files is blocking, CPU-bound work) ──
        try:
            text = await run_in_threadpool(_extract_text_sync, temp_path, use_pdf)
        except Exception as parse_exc:
            logger.error(f"Text extraction failed ({suffix}): {parse_exc}")
            raise HTTPException(
                status_code=422,
                detail=(
                    f"Could not extract text from the file. "
                    f"The file may be corrupt, password-protected, or scanned. "
                    f"Details: {str(parse_exc)[:120]}"
                ),
            )

        if not text or len(text.strip()) < 50:
            raise HTTPException(
                status_code=400,
                detail="Could not extract enough text. The file may be scanned or protected.",
            )

        # ── Optionally pull job description from DB ──
        if job_id and not job_description and current_user:
            row = db.fetch_one(
                "SELECT description FROM job_descriptions WHERE id = ? AND is_active = 1",
                (job_id,),
            )
            if row:
                job_description = row["description"]

        # ── NLP analysis + scoring (offloaded to a worker thread) ──
        # This is where the sentence-transformer model gets loaded on its
        # very first use, which can be slow on a fresh install or a slow
        # network. Running it via run_in_threadpool keeps the server
        # responsive to every other request in the meantime. When several
        # files are being analysed at once (batch mode), the caller runs
        # several of these concurrently, so this also keeps one slow file
        # from holding up the rest of the batch.
        nlp_analysis, score_result = await run_in_threadpool(
            _run_nlp_pipeline_sync, text, job_description, skills_dict
        )

        # ── Extract candidate contact info ──
        contact = nlp_analysis.get("contact_info", {})
        _emails = contact.get("emails") or []
        _phones = contact.get("phones") or []
        candidate_email = contact.get("email") or (_emails[0] if _emails else None)
        candidate_name  = contact.get("name")  or nlp_analysis.get("candidate_name")
        candidate_phone = contact.get("phone") or (_phones[0] if _phones else None)

        # ── Persist if requested (auto-save when user is authenticated) ──
        db_id = None
        if current_user:
            try:
                db_id = db.insert(
                    """INSERT INTO resume_analyses
                       (user_id, job_id, filename, candidate_name, candidate_email,
                        candidate_phone, extracted_text, overall_score, keyword_score,
                        skill_score, structure_score, semantic_score, experience_score,
                        education_score, matched_keywords, matched_skills,
                        missing_skills, recommendations, analysis_data, detected_domain, status)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        current_user["id"],
                        job_id,
                        file.filename,
                        candidate_name,
                        candidate_email,
                        candidate_phone,
                        text[:6000],
                        score_result["overall_score"],
                        score_result["keyword_match_score"],
                        score_result["skill_match_score"],
                        score_result["structure_score"],
                        score_result.get("semantic_similarity"),
                        score_result.get("experience_score", 0),
                        score_result.get("education_score", 0),
                        json.dumps(
                            (score_result.get("breakdown", {}).get("keywords", {})
                             or score_result.get("breakdown", {}).get("keyword_analysis", {}))
                            .get("job_keywords_match", [])
                        ),
                        json.dumps(
                            score_result.get("breakdown", {})
                            .get("skill_analysis", {})
                            .get("matched_skills", [])
                        ),
                        json.dumps(
                            score_result.get("breakdown", {})
                            .get("skill_analysis", {})
                            .get("missing_skills", [])
                        ),
                        json.dumps(
                            score_result.get("breakdown", {})
                            .get("recommendations", [])
                        ),
                        json.dumps(score_result),
                        score_result.get("detected_domain", "general"),
                        "completed",
                    ),
                )

                db.insert(
                    """INSERT INTO analysis_history
                       (user_id, analysis_id, analysis_type, description, result_summary)
                       VALUES (?, ?, ?, ?, ?)""",
                    (
                        current_user["id"],
                        db_id,
                        "resume_analysis",
                        f"Analysed: {file.filename}",
                        f"Score: {score_result['overall_score']}%",
                    ),
                )

            except Exception as exc:
                logger.error(f"Error persisting analysis: {exc}")

        # ── Build response ──
        created_at = None
        if db_id:
            row = _get_analysis(db_id)
            if row:
                created_at = row.get("created_at")

        return {
            "analysis_id":          db_id or 0,
            "filename":             file.filename,
            "extracted_text_length": len(text),
            "candidate_name":       candidate_name,
            "candidate_email":      candidate_email,
            "overall_score":        score_result["overall_score"],
            "keyword_match_score":  score_result["keyword_match_score"],
            "skill_match_score":    score_result["skill_match_score"],
            "structure_score":      score_result["structure_score"],
            "semantic_similarity":  score_result.get("semantic_similarity"),
            "experience_score":     score_result.get("experience_score", 0),
            "education_score":      score_result.get("education_score", 0),
            "detected_domain":      score_result.get("detected_domain", "general"),
            "domain_confidence":    score_result.get("domain_confidence", 0.0),
            "india_context_bonus":  score_result.get("india_context_bonus", 0.0),
            "indian_context":       score_result.get("indian_context", {}),
            "accuracy_estimate":    score_result.get("accuracy_estimate", 88),
            "nlp_analysis":         nlp_analysis,
            "breakdown":            score_result.get("breakdown", {}),
            "status":               "completed",
            "created_at":           created_at,
        }

    except HTTPException:
        raise
    except MemoryError:
        logger.error("MemoryError during analysis")
        raise HTTPException(status_code=507, detail="Insufficient memory to process file. Try a smaller file.")
    except Exception as exc:
        logger.error(f"Unexpected analysis error: {exc}", exc_info=True)
        err_msg = str(exc)
        if "spacy" in err_msg.lower() or "nlp" in err_msg.lower():
            detail = "NLP processing error. Please try again or contact support."
        elif "extract" in err_msg.lower() or "parse" in err_msg.lower():
            detail = "Could not parse the file. Ensure it is a valid non-scanned PDF or DOCX."
        elif "database" in err_msg.lower() or "sqlite" in err_msg.lower():
            detail = "Database error saving results. Analysis may still have completed."
        else:
            detail = f"Analysis failed unexpectedly: {err_msg[:200]}"
        raise HTTPException(status_code=500, detail=detail)
    finally:
        _cleanup(temp_path)


@router.post("/analyze", response_model=ResumeAnalysisFullResponse, status_code=status.HTTP_201_CREATED)
async def analyze_resume(
    file:             UploadFile = File(...),
    job_description:  Optional[str] = Form(None),
    required_skills:  Optional[str] = Form(None),
    job_id:           Optional[int] = Form(None),
    save_to_db:       bool = Form(False),
    current_user: Optional[dict] = Depends(get_optional_user),
):
    """
    Analyse a resume file (PDF or DOCX).
    Optionally provide a job description and/or select a saved job by ID.
    """
    skills_dict = None
    if required_skills:
        try:
            skills_dict = json.loads(required_skills)
        except json.JSONDecodeError:
            pass

    return await _analyze_single_file(file, job_description, skills_dict, job_id, current_user)


@router.post("/analyze-batch")
async def analyze_resumes_batch(
    files:            List[UploadFile] = File(...),
    job_description:  Optional[str] = Form(None),
    required_skills:  Optional[str] = Form(None),
    job_id:           Optional[int] = Form(None),
    save_to_db:       bool = Form(False),
    current_user: Optional[dict] = Depends(get_optional_user),
):
    """
    Analyse several resumes in one request — for comparing candidates
    against the same role side by side.

    Each file gets its own completely independent extraction, NLP pass,
    and score (all run through the exact same pipeline as /analyze, via
    the shared helper above), so results are never mixed between resumes.
    Files are processed concurrently for speed, and one bad file (wrong
    type, corrupt, scanned with no extractable text) only fails that
    file's entry — it never takes down the rest of the batch.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files provided.")

    MAX_BATCH_SIZE = 15
    if len(files) > MAX_BATCH_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"Too many files at once (max {MAX_BATCH_SIZE}). Please split into smaller batches.",
        )

    skills_dict = None
    if required_skills:
        try:
            skills_dict = json.loads(required_skills)
        except json.JSONDecodeError:
            pass

    async def _one(index: int, f: UploadFile) -> dict:
        try:
            result = await _analyze_single_file(f, job_description, skills_dict, job_id, current_user)
            result["batch_index"] = index
            result["error"] = None
            return result
        except HTTPException as he:
            logger.warning(f"Batch item {index} ('{f.filename}') failed: {he.detail}")
            return {
                "batch_index": index,
                "filename":    f.filename,
                "status":      "failed",
                "error":       he.detail,
            }
        except Exception as exc:
            logger.error(f"Batch item {index} ('{f.filename}') unexpected error: {exc}", exc_info=True)
            return {
                "batch_index": index,
                "filename":    f.filename,
                "status":      "failed",
                "error":       f"Analysis failed unexpectedly: {str(exc)[:200]}",
            }

    results = await asyncio.gather(*(_one(i, f) for i, f in enumerate(files)))

    succeeded = sum(1 for r in results if not r.get("error"))
    return {
        "total":     len(results),
        "succeeded": succeeded,
        "failed":    len(results) - succeeded,
        "results":   results,
    }
