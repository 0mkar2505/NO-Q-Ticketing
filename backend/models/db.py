from pymongo import MongoClient
import certifi
import os
import re

MONGO_URI = os.getenv("MONGO_URI")

client = MongoClient(
    MONGO_URI,
    tls=True,
    tlsCAFile=certifi.where(),
    serverSelectionTimeoutMS=5000
)

db = client["noq_db"]

user_collection = db["users"]
company_collection = db["companies"]


def _slugify_company_name(name):
    text = (name or "").strip().lower()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    text = text.strip("-")
    return text or "company"


def _ensure_company_slugs():
    try:
        existing = set(
            slug for slug in company_collection.distinct("slug")
            if isinstance(slug, str) and slug.strip()
        )
        missing_cursor = company_collection.find({
            "$or": [
                {"slug": {"$exists": False}},
                {"slug": None},
                {"slug": ""},
            ]
        })
        for company in missing_cursor:
            base_slug = _slugify_company_name(company.get("name"))
            slug = base_slug
            suffix = 2
            while slug in existing:
                slug = f"{base_slug}-{suffix}"
                suffix += 1
            company_collection.update_one(
                {"_id": company["_id"]},
                {"$set": {"slug": slug}}
            )
            existing.add(slug)
    except Exception:
        # Avoid startup crash on backfill attempts; API paths still work without it.
        pass


_ensure_company_slugs()
