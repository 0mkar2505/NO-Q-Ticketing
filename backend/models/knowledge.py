from datetime import datetime
import re
from bson import ObjectId
from models.db import db


knowledge_collection = db["knowledge_entries"]


class Knowledge:
    @staticmethod
    def _coerce_object_id(value):
        try:
            return ObjectId(value)
        except Exception:
            return value

    @staticmethod
    def _coerce_company_id(company_id):
        try:
            return ObjectId(company_id)
        except Exception:
            return company_id

    @staticmethod
    def _company_id_filters(company_id):
        coerced = Knowledge._coerce_company_id(company_id)
        if isinstance(coerced, ObjectId):
            return {"$in": [coerced, str(coerced)]}
        return coerced

    @staticmethod
    def _serialize(doc):
        if not doc:
            return None
        data = dict(doc)
        if "_id" in data and isinstance(data["_id"], ObjectId):
            data["_id"] = str(data["_id"])
        if "company_id" in data and isinstance(data["company_id"], ObjectId):
            data["company_id"] = str(data["company_id"])
        return data

    @staticmethod
    def list(company_id, query=None, limit=50):
        q = (query or "").strip()
        base = {"company_id": Knowledge._company_id_filters(company_id)}
        if q:
            # Lightweight search for MVP: regex match in title/content/tags.
            pattern = re.escape(q)
            base["$or"] = [
                {"title": {"$regex": pattern, "$options": "i"}},
                {"content": {"$regex": pattern, "$options": "i"}},
                {"tags": {"$regex": pattern, "$options": "i"}},
            ]
        cursor = knowledge_collection.find(base).sort("updated_at", -1).limit(int(limit))
        return [Knowledge._serialize(doc) for doc in cursor]

    @staticmethod
    def get_by_id(entry_id, company_id):
        doc = knowledge_collection.find_one(
            {"_id": Knowledge._coerce_object_id(entry_id), "company_id": Knowledge._company_id_filters(company_id)}
        )
        return Knowledge._serialize(doc)

    @staticmethod
    def create(company_id, title, content, tags=None):
        now = datetime.utcnow()
        doc = {
            "company_id": Knowledge._coerce_company_id(company_id),
            "title": (title or "").strip(),
            "content": (content or "").strip(),
            "tags": tags or [],
            "created_at": now,
            "updated_at": now,
        }
        result = knowledge_collection.insert_one(doc)
        doc["_id"] = result.inserted_id
        return Knowledge._serialize(doc)

    @staticmethod
    def update(entry_id, company_id, title, content, tags=None):
        now = datetime.utcnow()
        update = {
            "$set": {
                "title": (title or "").strip(),
                "content": (content or "").strip(),
                "tags": tags or [],
                "updated_at": now,
            }
        }
        res = knowledge_collection.update_one(
            {"_id": Knowledge._coerce_object_id(entry_id), "company_id": Knowledge._company_id_filters(company_id)},
            update,
        )
        if res.matched_count != 1:
            return None
        return Knowledge.get_by_id(entry_id, company_id)

    @staticmethod
    def delete(entry_id, company_id):
        res = knowledge_collection.delete_one(
            {"_id": Knowledge._coerce_object_id(entry_id), "company_id": Knowledge._company_id_filters(company_id)}
        )
        return res.deleted_count == 1
