"""
EasyRecruit ATS 3.0 — Company Registry & Company-Admin Seeding
────────────────────────────────────────────────────────────────
Every company that appears in the Job Market (datasets/job_notifications.json)
gets a row here with a dedicated recruiter e-mail domain. A recruiter can only
self-register for a company if their e-mail matches that company's domain,
and even then their account sits in 'pending' status until that company's
admin approves it.

Each company also gets exactly one pre-provisioned "company_admin" account.
These are NOT created through the public /register endpoint — they are
seeded directly into the database the first time the app starts, using the
fixed credentials below. The admin account itself needs no approval from
anyone; it's the root authority for its own company.

IMPORTANT: These passwords are also written into the credentials handout
(CompanyAdmin_Credentials.docx). If you change a password here after the
database has already been created once, it will NOT retroactively change
the stored hash — update it via the app's "change password" flow instead,
since seeding only ever creates an admin, never overwrites one that already
exists.
"""
import logging

logger = logging.getLogger(__name__)

# name                              recruiter_domain                    admin_password
COMPANIES = [
    ("Zoho Corporation",                 "zohorecruiter.com",               "QE#Skl5m4YFx"),
    ("Freshworks",                       "freshworksrecruiter.com",         "F275sLOI7$gp"),
    ("Tata Consultancy Services",        "tcsrecruiter.com",                "8ZIE8df&zanG"),
    ("Infosys BPM",                      "infosysbpmrecruiter.com",         "j75IHd#eaS9G"),
    ("Cognizant Technology Solutions",   "cognizantrecruiter.com",          "9JoJ8ortg@sQ"),
    ("Hexaware Technologies",            "hexawarerecruiter.com",           "jXy8b30CNS#2"),
    ("Sutherland Global Services",       "sutherlandrecruiter.com",         "d7F6TRU$5hSv"),
    ("TVS Motor Company",                "tvsmotorrecruiter.com",           "zdR49lz90lVO"),
    ("Rane Group",                       "ranegrouprecruiter.com",          "vVXUeB*9kN6r"),
    ("Wipro Limited",                    "wiprorecruiter.com",              "qdOmh26g@vfZ"),
    ("ELGI Equipments",                  "elgirecruiter.com",               "QI!2x0NEYrwu"),
    ("Amazon Development Centre India",  "amazonindiarecruiter.com",        "aWW7vZ0O7Fvm"),
    ("Chargebee",                        "chargebeerecruiter.com",          "h8oCOc#iU37H"),
    ("Ramco Systems",                    "ramcorecruiter.com",              "p#sZK5xNkI27"),
    ("Ford Motor Company India",         "fordindiarecruiter.com",          "fKB1K#aDX67r"),
    ("Intellect Design Arena",           "intellectrecruiter.com",          "z5o8N6iy6ww8"),
    ("Ashok Leyland",                    "ashokleylandrecruiter.com",       "LZeT9%7PKN43"),
    ("Standard Chartered GBS",           "standardcharteredrecruiter.com",  "WvN*0qM2Cp7o"),
    ("Tata Elxsi",                       "tataelxsirecruiter.com",          "Zh7NSzchjO%2"),
    ("NatWest Group India",              "natwestrecruiter.com",            "z3WU0LTHjyjG"),
]


def admin_email_for(recruiter_domain: str) -> str:
    return f"admin@{recruiter_domain}"


def seed_companies_and_admins(db, hash_password) -> None:
    """
    Idempotent: safe to call on every app startup.
    - Inserts any company row that doesn't exist yet.
    - Creates the company's admin user only if that e-mail doesn't exist yet.
    Never overwrites an existing company_admin's password or a company's row.
    """
    for name, domain, password in COMPANIES:
        try:
            existing_company = db.fetch_one(
                "SELECT id FROM companies WHERE name = ?", (name,)
            )
            if not existing_company:
                db.insert(
                    "INSERT INTO companies (name, recruiter_domain) VALUES (?, ?)",
                    (name, domain),
                )
                logger.info(f"Seeded company: {name} ({domain})")

            admin_email = admin_email_for(domain)
            existing_admin = db.fetch_one(
                "SELECT id FROM users WHERE email = ?", (admin_email,)
            )
            if not existing_admin:
                username = "admin_" + domain.split(".")[0]
                db.insert(
                    """INSERT INTO users
                       (email, username, password_hash, full_name, company_name,
                        role, approval_status, is_active)
                       VALUES (?, ?, ?, ?, ?, 'company_admin', 'approved', 1)""",
                    (
                        admin_email,
                        username,
                        hash_password(password),
                        f"{name} — Company Admin",
                        name,
                    ),
                )
                logger.info(f"Seeded company_admin: {admin_email}")
        except Exception as exc:
            logger.warning(f"Company seed skipped for {name}: {exc}")
