"""
EasyRecruit ATS 3.0 - Configuration
All settings sourced from environment variables with sane defaults.
"""
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings:
    # ── API ──
    API_TITLE: str = "EasyRecruit ATS API 3.0"
    API_VERSION: str = "3.0.0"
    API_DESCRIPTION: str = (
        "Smart Applicant Tracking System — resume parsing, NLP scoring, "
        "and candidate management. Version 3.0"
    )

    # ── Server ──
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8001"))
    DEBUG: bool = os.getenv("DEBUG", "false").lower() == "true"

    # ── Security ──
    SECRET_KEY: str = os.getenv(
        "SECRET_KEY", "easyrecruit-CHANGE-ME-in-production-v3"
    )
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(
        os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440")  # 24 h
    )
    REFRESH_TOKEN_EXPIRE_DAYS: int = int(
        os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7")
    )

    # ── Upload ──
    MAX_FILE_SIZE: int = int(os.getenv("MAX_FILE_SIZE", str(10 * 1024 * 1024)))  # 10 MB
    ALLOWED_EXTENSIONS: set = {".pdf", ".docx"}
    ALLOWED_MIME_TYPES: list = [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ]

    # ── NLP ──
    SPACY_MODEL: str = os.getenv("SPACY_MODEL", "en_core_web_sm")
    SENTENCE_TRANSFORMER_MODEL: str = os.getenv(
        "SENTENCE_TRANSFORMER_MODEL", "all-MiniLM-L6-v2"
    )

    # ── Scoring weights ──
    KEYWORD_WEIGHT: float = float(os.getenv("KEYWORD_WEIGHT", "0.25"))
    SKILL_WEIGHT: float = float(os.getenv("SKILL_WEIGHT", "0.30"))
    STRUCTURE_WEIGHT: float = float(os.getenv("STRUCTURE_WEIGHT", "0.20"))
    SEMANTIC_WEIGHT: float = float(os.getenv("SEMANTIC_WEIGHT", "0.25"))

    # ── Database ──
    DATABASE_PATH: str = os.getenv(
        "DATABASE_PATH", str(BASE_DIR / "app" / "data" / "easyrecruit.db")
    )

    # ── Logging ──
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO").upper()
    LOG_FILE: str = os.getenv("LOG_FILE", "easyrecruit.log")

    # ── CORS ──
    CORS_ORIGINS: list = [
        o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",")
    ]

    # ── Rate limiting (simple in-memory) ──
    RATE_LIMIT_REQUESTS: int = int(os.getenv("RATE_LIMIT_REQUESTS", "100"))
    RATE_LIMIT_WINDOW_SECONDS: int = int(os.getenv("RATE_LIMIT_WINDOW_SECONDS", "60"))

    # ── Pagination defaults ──
    DEFAULT_PAGE_SIZE: int = 10
    MAX_PAGE_SIZE: int = 100


settings = Settings()
