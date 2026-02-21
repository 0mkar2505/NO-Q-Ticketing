from flask import Blueprint, jsonify, request
from auth.middleware import require_auth
from models.client_config import ClientConfig

client_configs_bp = Blueprint("client_configs", __name__)

ALLOWED_PRIORITIES = {"low", "normal", "high"}
ALLOWED_SLA_HOURS = {2, 4, 8}
HEX_COLOR_LENGTH = 7
MAX_BRAND_NAME_LENGTH = 60
MAX_LOGO_URL_LENGTH = 500
MAX_TAXONOMY_CATEGORIES = 30
MAX_TAXONOMY_LABEL_LENGTH = 40
MAX_TAXONOMY_POLICY_LENGTH = 600


def _coerce_bool(value):
    return bool(value)


def _is_hex_color(value):
    if not isinstance(value, str):
        return False
    value = value.strip()
    if len(value) != HEX_COLOR_LENGTH or not value.startswith("#"):
        return False
    hex_chars = value[1:]
    return all(ch in "0123456789abcdefABCDEF" for ch in hex_chars)


def _validate_payload(data):
    if not isinstance(data, dict):
        return None, "Invalid payload"

    default_priority = (data.get("default_priority") or "").strip().lower()
    if default_priority not in ALLOWED_PRIORITIES:
        return None, "default_priority must be one of: low, normal, high"

    try:
        sla_response_hours = int(data.get("sla_response_hours"))
    except (TypeError, ValueError):
        return None, "sla_response_hours must be a number"

    if sla_response_hours not in ALLOWED_SLA_HOURS:
        return None, "sla_response_hours must be one of: 2, 4, 8"

    reply_signature = (data.get("reply_signature") or "").strip()
    if not reply_signature:
        return None, "reply_signature is required"
    if len(reply_signature) > 1000:
        return None, "reply_signature is too long (max 1000 characters)"

    notifications = data.get("notifications") or {}
    if not isinstance(notifications, dict):
        return None, "notifications must be an object"

    taxonomy_in_payload = "taxonomy" in data
    taxonomy = data.get("taxonomy") or {}
    if taxonomy_in_payload and not isinstance(taxonomy, dict):
        return None, "taxonomy must be an object"

    customer_chat_ui = data.get("customer_chat_ui") or {}
    if not isinstance(customer_chat_ui, dict):
        return None, "customer_chat_ui must be an object"

    brand_name = (customer_chat_ui.get("brand_name") or "").strip()
    logo_url = (customer_chat_ui.get("logo_url") or "").strip()
    brand_text_color = (customer_chat_ui.get("brand_text_color") or "").strip()
    assistant_title = (customer_chat_ui.get("assistant_title") or "").strip()
    assistant_subtitle = (customer_chat_ui.get("assistant_subtitle") or "").strip()
    primary_color = (customer_chat_ui.get("primary_color") or "").strip()
    assistant_bubble_color = (customer_chat_ui.get("assistant_bubble_color") or "").strip()
    assistant_text_color = (customer_chat_ui.get("assistant_text_color") or "").strip()
    customer_bubble_color = (customer_chat_ui.get("customer_bubble_color") or "").strip()
    customer_text_color = (customer_chat_ui.get("customer_text_color") or "").strip()

    if brand_name and len(brand_name) > MAX_BRAND_NAME_LENGTH:
        return None, f"customer_chat_ui.brand_name is too long (max {MAX_BRAND_NAME_LENGTH} characters)"
    if logo_url and len(logo_url) > MAX_LOGO_URL_LENGTH:
        return None, f"customer_chat_ui.logo_url is too long (max {MAX_LOGO_URL_LENGTH} characters)"
    if logo_url and not (
        logo_url.startswith("http://")
        or logo_url.startswith("https://")
        or logo_url.startswith("/")
    ):
        return None, "customer_chat_ui.logo_url must be a http(s) URL or a relative path starting with /"

    if not assistant_title:
        return None, "customer_chat_ui.assistant_title is required"
    if len(assistant_title) > 100:
        return None, "customer_chat_ui.assistant_title is too long (max 100 characters)"
    if not assistant_subtitle:
        return None, "customer_chat_ui.assistant_subtitle is required"
    if len(assistant_subtitle) > 240:
        return None, "customer_chat_ui.assistant_subtitle is too long (max 240 characters)"

    color_fields = {
        "brand_text_color": brand_text_color,
        "primary_color": primary_color,
        "assistant_bubble_color": assistant_bubble_color,
        "assistant_text_color": assistant_text_color,
        "customer_bubble_color": customer_bubble_color,
        "customer_text_color": customer_text_color,
    }
    for field, color in color_fields.items():
        if not _is_hex_color(color):
            return None, f"customer_chat_ui.{field} must be a valid hex color like #7c3aed"

    config = {
        "default_priority": default_priority,
        "sla_response_hours": sla_response_hours,
        "reply_signature": reply_signature,
        "notifications": {
            "email_new_tickets": _coerce_bool(notifications.get("email_new_tickets")),
            "daily_summary_report": _coerce_bool(notifications.get("daily_summary_report")),
            "manager_escalation_alerts": _coerce_bool(notifications.get("manager_escalation_alerts")),
        },
        "customer_chat_ui": {
            "brand_name": brand_name,
            "logo_url": logo_url,
            "brand_text_color": brand_text_color,
            "assistant_title": assistant_title,
            "assistant_subtitle": assistant_subtitle,
            "primary_color": primary_color,
            "assistant_bubble_color": assistant_bubble_color,
            "assistant_text_color": assistant_text_color,
            "customer_bubble_color": customer_bubble_color,
            "customer_text_color": customer_text_color,
        },
    }

    # Only update taxonomy if it was sent (so branding/settings PATCHes don't overwrite it).
    if taxonomy_in_payload:
        categories = taxonomy.get("categories") or []
        if not isinstance(categories, list):
            return None, "taxonomy.categories must be a list"

        normalized_categories = []
        seen = set()
        for item in categories:
            name = str(item or "").strip()
            if not name:
                continue
            if len(name) > 60:
                return None, "taxonomy.categories entries must be <= 60 characters"
            key = name.lower()
            if key in seen:
                continue
            seen.add(key)
            normalized_categories.append(name)

        if not normalized_categories:
            return None, "taxonomy.categories must include at least 1 category"
        if len(normalized_categories) > MAX_TAXONOMY_CATEGORIES:
            return None, f"taxonomy.categories must be <= {MAX_TAXONOMY_CATEGORIES} entries"
        if not any(c.lower() == "other" for c in normalized_categories):
            normalized_categories.append("Other")

        priority_labels = taxonomy.get("priority_labels") or {}
        severity_labels = taxonomy.get("severity_labels") or {}
        if not isinstance(priority_labels, dict):
            return None, "taxonomy.priority_labels must be an object"
        if not isinstance(severity_labels, dict):
            return None, "taxonomy.severity_labels must be an object"

        def _label(value, fallback):
            text = str(value or fallback).strip()
            return text[:MAX_TAXONOMY_LABEL_LENGTH] if text else fallback

        config["taxonomy"] = {
            "categories": normalized_categories,
            "priority_labels": {
                "high": _label(priority_labels.get("high"), "High"),
                "normal": _label(priority_labels.get("normal"), "Normal"),
                "low": _label(priority_labels.get("low"), "Low"),
            },
            "severity_labels": {
                "critical": _label(severity_labels.get("critical"), "Critical"),
                "high": _label(severity_labels.get("high"), "High"),
                "medium": _label(severity_labels.get("medium"), "Medium"),
                "low": _label(severity_labels.get("low"), "Low"),
            },
            "policy_text": str(taxonomy.get("policy_text") or "").strip()[:MAX_TAXONOMY_POLICY_LENGTH],
        }

    return config, None


@client_configs_bp.route("/api/client/configs", methods=["GET"])
@require_auth(required_role="client")
def get_client_configs():
    config = ClientConfig.get_by_company(request.user["company_id"])
    return jsonify(config), 200


@client_configs_bp.route("/api/client/configs", methods=["PATCH"])
@require_auth(required_role="client")
def update_client_configs():
    data = request.get_json(silent=True) or {}
    config, error = _validate_payload(data)
    if error:
        return jsonify({"error": error}), 400

    updated = ClientConfig.update_by_company(request.user["company_id"], config)
    return jsonify({"message": "Settings saved", "config": updated}), 200
