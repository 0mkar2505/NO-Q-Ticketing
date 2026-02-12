from flask import Blueprint, jsonify, request
from auth.middleware import require_auth
from models.client_config import ClientConfig

client_configs_bp = Blueprint("client_configs", __name__)

ALLOWED_PRIORITIES = {"low", "normal", "high"}
ALLOWED_SLA_HOURS = {2, 4, 8}
HEX_COLOR_LENGTH = 7


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

    customer_chat_ui = data.get("customer_chat_ui") or {}
    if not isinstance(customer_chat_ui, dict):
        return None, "customer_chat_ui must be an object"

    assistant_title = (customer_chat_ui.get("assistant_title") or "").strip()
    assistant_subtitle = (customer_chat_ui.get("assistant_subtitle") or "").strip()
    primary_color = (customer_chat_ui.get("primary_color") or "").strip()
    assistant_bubble_color = (customer_chat_ui.get("assistant_bubble_color") or "").strip()
    assistant_text_color = (customer_chat_ui.get("assistant_text_color") or "").strip()
    customer_bubble_color = (customer_chat_ui.get("customer_bubble_color") or "").strip()
    customer_text_color = (customer_chat_ui.get("customer_text_color") or "").strip()

    if not assistant_title:
        return None, "customer_chat_ui.assistant_title is required"
    if len(assistant_title) > 100:
        return None, "customer_chat_ui.assistant_title is too long (max 100 characters)"
    if not assistant_subtitle:
        return None, "customer_chat_ui.assistant_subtitle is required"
    if len(assistant_subtitle) > 240:
        return None, "customer_chat_ui.assistant_subtitle is too long (max 240 characters)"

    color_fields = {
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
            "assistant_title": assistant_title,
            "assistant_subtitle": assistant_subtitle,
            "primary_color": primary_color,
            "assistant_bubble_color": assistant_bubble_color,
            "assistant_text_color": assistant_text_color,
            "customer_bubble_color": customer_bubble_color,
            "customer_text_color": customer_text_color,
        },
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
