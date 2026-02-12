from flask import Blueprint, jsonify, request
from models.chat_session import ChatSession
from models.client_config import ClientConfig
from models.db import company_collection
from models.ticket import Ticket
from support.rules import (
    build_subject,
    compute_category,
    compute_priority,
    get_option_label,
    get_step,
)

support_bp = Blueprint("support", __name__)


def _find_company(company_name):
    if not company_name:
        return None
    return company_collection.find_one(
        {"name": {"$regex": f"^{company_name.strip()}$", "$options": "i"}}
    )


def _review_payload(answers):
    category_label = compute_category(answers.get("category"))
    priority, severity = compute_priority(answers)
    return {
        "category": category_label,
        "priority": priority,
        "severity": severity,
        "details": (answers.get("details") or "").strip(),
    }


@support_bp.route("/api/support/start", methods=["POST"])
def support_start():
    data = request.get_json(silent=True) or {}
    company_name = (data.get("company_name") or "").strip()
    customer_email = (data.get("customer_email") or "").strip().lower()

    if not company_name:
        return jsonify({"error": "company_name is required"}), 400
    if not customer_email:
        return jsonify({"error": "customer_email is required"}), 400

    company = _find_company(company_name)
    if not company:
        return jsonify({"error": "Company not found"}), 404
    client_config = ClientConfig.get_by_company(company["_id"])
    customer_chat_ui = (client_config or {}).get("customer_chat_ui") or {}

    session = ChatSession.create(
        company_id=company["_id"],
        company_name=company.get("name") or company_name,
        customer_email=customer_email,
    )

    step = get_step("category")
    ChatSession.append_turn(session["_id"], "assistant", step["message"])

    return jsonify(
        {
            "session_id": session["_id"],
            "step": "category",
            "message": step["message"],
            "options": step["options"],
            "ready_to_create_ticket": False,
            "customer_chat_ui": customer_chat_ui,
        }
    ), 200


@support_bp.route("/api/support/step", methods=["POST"])
def support_step():
    data = request.get_json(silent=True) or {}
    session_id = (data.get("session_id") or "").strip()
    option_id = (data.get("option_id") or "").strip()
    details = (data.get("details") or "").strip()

    if not session_id:
        return jsonify({"error": "session_id is required"}), 400

    session = ChatSession.get_by_id(session_id)
    if not session:
        return jsonify({"error": "Session not found"}), 404
    if session.get("status") != "active":
        return jsonify({"error": "Session is not active"}), 409

    current_step = session.get("current_step") or "category"
    if current_step == "review":
        return jsonify({"error": "Review complete. Create ticket to continue."}), 409

    step_config = get_step(current_step)
    if not step_config:
        return jsonify({"error": "Invalid session state"}), 500

    answers = dict(session.get("answers") or {})

    if current_step == "details":
        if not details:
            return jsonify({"error": "details is required for this step"}), 400
        answers["details"] = details
        ChatSession.append_turn(session_id, "customer", details)
    else:
        if not option_id:
            return jsonify({"error": "option_id is required"}), 400
        option_label = get_option_label(current_step, option_id)
        if not option_label:
            return jsonify({"error": "Invalid option for current step"}), 400
        answers[current_step] = option_id
        ChatSession.append_turn(session_id, "customer", option_label)

    next_step = step_config.get("next_step")
    if next_step == "review":
        review = _review_payload(answers)
        review_message = (
            f"Thanks. I categorized this as '{review['category']}' with "
            f"{review['priority']} priority. Please create the ticket to proceed."
        )
        ChatSession.update_progress(session_id, "review", answers)
        ChatSession.append_turn(session_id, "assistant", review_message)
        return jsonify(
            {
                "session_id": session_id,
                "step": "review",
                "message": review_message,
                "options": [],
                "ready_to_create_ticket": True,
                "review": review,
            }
        ), 200

    next_config = get_step(next_step)
    ChatSession.update_progress(session_id, next_step, answers)
    ChatSession.append_turn(session_id, "assistant", next_config["message"])

    return jsonify(
        {
            "session_id": session_id,
            "step": next_step,
            "message": next_config["message"],
            "options": next_config["options"],
            "ready_to_create_ticket": False,
        }
    ), 200


@support_bp.route("/api/support/create-ticket", methods=["POST"])
def support_create_ticket():
    data = request.get_json(silent=True) or {}
    session_id = (data.get("session_id") or "").strip()
    if not session_id:
        return jsonify({"error": "session_id is required"}), 400

    session = ChatSession.get_by_id(session_id)
    if not session:
        return jsonify({"error": "Session not found"}), 404

    if session.get("ticket_id"):
        ticket = Ticket.get_customer_status(session["ticket_id"], session.get("customer_email"))
        return jsonify({"message": "Ticket already created", "ticket": ticket}), 200

    answers = dict(session.get("answers") or {})
    required = ["category", "impact", "urgency", "details"]
    missing = [key for key in required if not answers.get(key)]
    if missing:
        return jsonify({"error": f"Missing answers: {', '.join(missing)}"}), 400

    category_label = compute_category(answers["category"])
    priority, severity = compute_priority(answers)
    subject = (data.get("subject") or "").strip() or build_subject(answers)

    transcript = []
    for turn in session.get("transcript") or []:
        speaker = (turn.get("speaker") or "").lower()
        sender = "assistant" if speaker == "assistant" else "customer"
        transcript.append(
            {
                "sender": sender,
                "text": (turn.get("text") or "").strip(),
                "timestamp": turn.get("timestamp"),
            }
        )

    ticket = Ticket.create_from_support(
        company_id=session["company_id"],
        customer_email=session["customer_email"],
        subject=subject,
        transcript=transcript,
        category=category_label,
        severity=severity,
        priority=priority,
        chat_session_id=session["_id"],
    )
    ChatSession.complete(session_id, ticket["_id"])

    return jsonify(
        {
            "message": "Ticket created",
            "ticket": {
                "_id": ticket["_id"],
                "subject": ticket["subject"],
                "status": ticket["status"],
                "category": ticket.get("category"),
                "severity": ticket.get("severity"),
                "priority": ticket.get("priority"),
            },
        }
    ), 201


@support_bp.route("/api/support/ticket-status", methods=["GET"])
def support_ticket_status():
    ticket_id = (request.args.get("ticket_id") or "").strip()
    customer_email = (request.args.get("email") or "").strip().lower()

    if not ticket_id:
        return jsonify({"error": "ticket_id is required"}), 400
    if not customer_email:
        return jsonify({"error": "email is required"}), 400

    ticket = Ticket.get_customer_status(ticket_id, customer_email)
    if not ticket:
        return jsonify({"error": "Ticket not found"}), 404

    messages = ticket.get("messages") or []
    recent_messages = messages[-10:]

    return jsonify(
        {
            "ticket": {
                "_id": ticket.get("_id"),
                "subject": ticket.get("subject"),
                "status": ticket.get("status"),
                "category": ticket.get("category"),
                "severity": ticket.get("severity"),
                "priority": ticket.get("priority"),
                "updated_at": ticket.get("updated_at"),
                "messages": recent_messages,
            }
        }
    ), 200
