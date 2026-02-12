from datetime import datetime
from models.db import db

client_config_collection = db["client_configs"]


class ClientConfig:
    DEFAULTS = {
        "default_priority": "normal",
        "sla_response_hours": 4,
        "reply_signature": "Thanks for reaching out.\nNO-Q Support Team",
        "notifications": {
            "email_new_tickets": True,
            "daily_summary_report": True,
            "manager_escalation_alerts": False,
        },
    }

    @staticmethod
    def _sanitize_document(doc):
        if not doc:
            return None
        data = dict(doc)
        data.pop("_id", None)
        data.pop("company_id", None)
        data.pop("created_at", None)
        data.pop("updated_at", None)
        return data

    @staticmethod
    def _merge_with_defaults(config):
        merged = dict(ClientConfig.DEFAULTS)
        merged["notifications"] = dict(ClientConfig.DEFAULTS["notifications"])

        if not config:
            return merged

        merged["default_priority"] = config.get("default_priority", merged["default_priority"])
        merged["sla_response_hours"] = config.get("sla_response_hours", merged["sla_response_hours"])
        merged["reply_signature"] = config.get("reply_signature", merged["reply_signature"])

        incoming_notifications = config.get("notifications") or {}
        for key, value in incoming_notifications.items():
            if key in merged["notifications"]:
                merged["notifications"][key] = bool(value)

        return merged

    @staticmethod
    def get_by_company(company_id):
        doc = client_config_collection.find_one({"company_id": company_id})
        config = ClientConfig._sanitize_document(doc)
        return ClientConfig._merge_with_defaults(config)

    @staticmethod
    def update_by_company(company_id, config):
        now = datetime.utcnow()
        client_config_collection.update_one(
            {"company_id": company_id},
            {
                "$set": {
                    **config,
                    "updated_at": now,
                },
                "$setOnInsert": {
                    "company_id": company_id,
                    "created_at": now,
                },
            },
            upsert=True,
        )
        return ClientConfig.get_by_company(company_id)
