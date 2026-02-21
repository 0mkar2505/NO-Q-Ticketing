import re
from datetime import datetime
from models.db import company_collection


def _slugify(value):
    text = (value or "").strip().lower()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    text = text.strip("-")
    return text or "company"


def _build_unique_slug(base_slug):
    slug = base_slug
    suffix = 2
    while company_collection.find_one({"slug": slug}):
        slug = f"{base_slug}-{suffix}"
        suffix += 1
    return slug


def create_company(name, email, details=None):
    base_slug = _slugify(name)
    company_slug = _build_unique_slug(base_slug)
    details = details or {}
    company = {
        "name": name,
        "email": email,
        "slug": company_slug,
        "industry": (details.get("industry") or "").strip(),
        "website": (details.get("website") or "").strip(),
        "company_size": (details.get("company_size") or "").strip(),
        "notes": (details.get("notes") or "").strip(),
        "created_at": datetime.utcnow(),
        # New onboarding flow: payment then admin approval.
        "is_active": False,
        "approval_status": "pending_payment",
        "billing_status": "unpaid",
        "plan": None,
    }
    result = company_collection.insert_one(company)
    company["_id"] = result.inserted_id
    return company
