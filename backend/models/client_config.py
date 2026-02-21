from datetime import datetime
from bson import ObjectId
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
        "taxonomy": {
            "categories": [
                "Billing & Payments",
                "Login & Access",
                "Bug / Crash",
                "Integrations",
                "Performance",
                "Account & Subscription",
                "Feature Request",
                "Other",
            ],
            "priority_labels": {
                "high": "High",
                "normal": "Normal",
                "low": "Low",
            },
            "severity_labels": {
                "critical": "Critical",
                "high": "High",
                "medium": "Medium",
                "low": "Low",
            },
            "policy_text": "Collect missing details, then create a ticket with the right priority and category.",
        },
        "customer_chat_ui": {
            "brand_name": "NO-Q Support",
            "logo_url": "",
            "brand_text_color": "#7c3aed",
            "assistant_title": "Guided Support Assistant",
            "assistant_subtitle": "Answer a few guided prompts and we will create a support ticket for you.",
            "primary_color": "#7c3aed",
            "assistant_bubble_color": "#eef2ff",
            "assistant_text_color": "#312e81",
            "customer_bubble_color": "#dcfce7",
            "customer_text_color": "#14532d",
        },
    }

    @staticmethod
    def _coerce_company_id(company_id):
        try:
            return ObjectId(company_id)
        except Exception:
            return company_id

    @staticmethod
    def _company_id_filters(company_id):
        coerced = ClientConfig._coerce_company_id(company_id)
        if isinstance(coerced, ObjectId):
            return {"$in": [coerced, str(coerced)]}
        return coerced

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
        # Copy defaults deeply enough to avoid cross-tenant mutation.
        # (Shallow copy would share nested dicts like customer_chat_ui between companies.)
        merged = dict(ClientConfig.DEFAULTS)
        merged["notifications"] = dict(ClientConfig.DEFAULTS["notifications"])
        merged["customer_chat_ui"] = dict(ClientConfig.DEFAULTS["customer_chat_ui"])
        merged["taxonomy"] = dict(ClientConfig.DEFAULTS["taxonomy"])
        merged["taxonomy"]["categories"] = list(ClientConfig.DEFAULTS["taxonomy"]["categories"])
        merged["taxonomy"]["priority_labels"] = dict(ClientConfig.DEFAULTS["taxonomy"]["priority_labels"])
        merged["taxonomy"]["severity_labels"] = dict(ClientConfig.DEFAULTS["taxonomy"]["severity_labels"])

        if not config:
            return merged

        merged["default_priority"] = config.get("default_priority", merged["default_priority"])
        merged["sla_response_hours"] = config.get("sla_response_hours", merged["sla_response_hours"])
        merged["reply_signature"] = config.get("reply_signature", merged["reply_signature"])

        incoming_notifications = config.get("notifications") or {}
        for key, value in incoming_notifications.items():
            if key in merged["notifications"]:
                merged["notifications"][key] = bool(value)

        incoming_taxonomy = config.get("taxonomy") or {}
        if isinstance(incoming_taxonomy, dict):
            categories = incoming_taxonomy.get("categories")
            if isinstance(categories, list) and categories:
                merged["taxonomy"]["categories"] = categories

            priority_labels = incoming_taxonomy.get("priority_labels") or {}
            if isinstance(priority_labels, dict):
                for key, value in priority_labels.items():
                    if key in merged["taxonomy"]["priority_labels"]:
                        merged["taxonomy"]["priority_labels"][key] = str(value)

            severity_labels = incoming_taxonomy.get("severity_labels") or {}
            if isinstance(severity_labels, dict):
                for key, value in severity_labels.items():
                    if key in merged["taxonomy"]["severity_labels"]:
                        merged["taxonomy"]["severity_labels"][key] = str(value)

            policy_text = incoming_taxonomy.get("policy_text")
            if isinstance(policy_text, str) and policy_text.strip():
                merged["taxonomy"]["policy_text"] = policy_text.strip()

        incoming_chat_ui = config.get("customer_chat_ui") or {}
        for key, value in incoming_chat_ui.items():
            if key in merged["customer_chat_ui"]:
                merged["customer_chat_ui"][key] = value

        return merged

    @staticmethod
    def get_by_company(company_id):
        doc = client_config_collection.find_one({"company_id": ClientConfig._company_id_filters(company_id)})
        config = ClientConfig._sanitize_document(doc)
        return ClientConfig._merge_with_defaults(config)

    @staticmethod
    def update_by_company(company_id, config):
        coerced_company_id = ClientConfig._coerce_company_id(company_id)
        now = datetime.utcnow()
        client_config_collection.update_one(
            {"company_id": ClientConfig._company_id_filters(company_id)},
            {
                "$set": {
                    **config,
                    "updated_at": now,
                },
                "$setOnInsert": {
                    "company_id": coerced_company_id,
                    "created_at": now,
                },
            },
            upsert=True,
        )
        return ClientConfig.get_by_company(company_id)
