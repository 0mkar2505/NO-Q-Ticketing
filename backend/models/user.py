from datetime import datetime
from bson import ObjectId
from models.db import user_collection


class User:
    def __init__(self, user_doc):
        self._doc = user_doc
        self._id = user_doc["_id"]
        self.name = user_doc.get("name")
        self.email = user_doc.get("email")
        self.password = user_doc.get("password")
        self.role = user_doc.get("role")
        # New hierarchy fields (backwards compatible with legacy `role`).
        self.platform_role = user_doc.get("platform_role")
        self.company_role = user_doc.get("company_role")
        self.company_id = user_doc.get("company_id")
        self.created_at = user_doc.get("created_at")
        self.is_active = user_doc.get("is_active", True)

    @classmethod
    def find_by_email(cls, email):
        doc = user_collection.find_one({"email": email})
        return cls(doc) if doc else None

    @classmethod
    def find_by_id(cls, user_id):
        if not isinstance(user_id, ObjectId):
            user_id = ObjectId(user_id)
        doc = user_collection.find_one({"_id": user_id})
        return cls(doc) if doc else None

    @property
    def password_hash(self):
        return self.password

    def to_dict(self):
        return {
            "_id": str(self._id),
            "name": self.name,
            "email": self.email,
            "role": self.role,
            "platform_role": self.platform_role,
            "company_role": self.company_role,
            "company_id": str(self.company_id) if self.company_id else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "is_active": self.is_active
        }


def create_user(name, email, password, role, company_id=None, platform_role=None, company_role=None):
    user = {
        "name": name,
        "email": email,
        "password": password,      # already hashed
        "role": role,
        "platform_role": platform_role,
        "company_role": company_role,
        "company_id": company_id,  # ObjectId or None
        "created_at": datetime.utcnow(),
        "is_active": True
    }
    user_collection.insert_one(user)
    return user


def get_user_by_email(email):
    return user_collection.find_one({"email": email})


def get_user_by_id(user_id):
    if not isinstance(user_id, ObjectId):
        user_id = ObjectId(user_id)
    return user_collection.find_one({"_id": user_id})


def get_users_by_company(company_id):
    if not isinstance(company_id, ObjectId):
        company_id = ObjectId(company_id)
    return list(user_collection.find({"company_id": company_id}))


def get_all_users():
    return list(user_collection.find({}))
