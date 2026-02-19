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


def create_company(name, email):
    base_slug = _slugify(name)
    company_slug = _build_unique_slug(base_slug)
    company = {
        "name": name,
        "email": email,
        "slug": company_slug,
        "created_at": datetime.utcnow(),
        "is_active": True,
    }
    result = company_collection.insert_one(company)
    company["_id"] = result.inserted_id
    return company
