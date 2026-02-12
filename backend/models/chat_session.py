from datetime import datetime
from bson import ObjectId
from models.db import db

chat_session_collection = db["chat_sessions"]


class ChatSession:
    @staticmethod
    def _to_object_id(value):
        try:
            return ObjectId(value)
        except Exception:
            return value

    @staticmethod
    def _serialize(doc):
        if not doc:
            return None
        data = dict(doc)
        if "_id" in data:
            data["_id"] = str(data["_id"])
        if "company_id" in data and data["company_id"] is not None:
            data["company_id"] = str(data["company_id"])
        if "ticket_id" in data and data["ticket_id"] is not None:
            data["ticket_id"] = str(data["ticket_id"])
        return data

    @staticmethod
    def create(company_id, customer_email, company_name):
        now = datetime.utcnow()
        doc = {
            "company_id": company_id,
            "company_name": company_name,
            "customer_email": customer_email.lower().strip(),
            "current_step": "category",
            "answers": {},
            "transcript": [],
            "status": "active",
            "ticket_id": None,
            "created_at": now,
            "updated_at": now,
        }
        result = chat_session_collection.insert_one(doc)
        doc["_id"] = result.inserted_id
        return ChatSession._serialize(doc)

    @staticmethod
    def get_by_id(session_id):
        doc = chat_session_collection.find_one({"_id": ChatSession._to_object_id(session_id)})
        return ChatSession._serialize(doc)

    @staticmethod
    def append_turn(session_id, speaker, text):
        text = (text or "").strip()
        if not text:
            return
        chat_session_collection.update_one(
            {"_id": ChatSession._to_object_id(session_id)},
            {
                "$push": {
                    "transcript": {
                        "speaker": speaker,
                        "text": text,
                        "timestamp": datetime.utcnow(),
                    }
                },
                "$set": {"updated_at": datetime.utcnow()},
            },
        )

    @staticmethod
    def update_progress(session_id, current_step, answers):
        chat_session_collection.update_one(
            {"_id": ChatSession._to_object_id(session_id)},
            {
                "$set": {
                    "current_step": current_step,
                    "answers": answers,
                    "updated_at": datetime.utcnow(),
                }
            },
        )

    @staticmethod
    def complete(session_id, ticket_id):
        chat_session_collection.update_one(
            {"_id": ChatSession._to_object_id(session_id)},
            {
                "$set": {
                    "status": "completed",
                    "ticket_id": ChatSession._to_object_id(ticket_id),
                    "updated_at": datetime.utcnow(),
                }
            },
        )
