from flask import Blueprint, request, jsonify
from auth.middleware import require_auth
from models.ticket import Ticket
from ai.ticket_ai_service import generate_ticket_ai_assist

client_tickets_bp = Blueprint("client_tickets", __name__)

@client_tickets_bp.route("/api/client/tickets", methods=["GET"])
@require_auth(required_role="client")
def get_tickets():
    tickets = Ticket.get_by_company(request.user["company_id"])
    return jsonify(tickets), 200


@client_tickets_bp.route("/api/client/tickets", methods=["POST"])
@require_auth(required_role="client")
def create_ticket():
    data = request.get_json(silent=True) or {}
    subject = (data.get("subject") or "").strip()
    customer_email = (data.get("customer_email") or "").strip().lower()
    message = (data.get("message") or "").strip()

    if not subject:
        return jsonify({"error": "subject is required"}), 400
    if not customer_email:
        return jsonify({"error": "customer_email is required"}), 400
    if not message:
        return jsonify({"error": "message is required"}), 400

    ticket = Ticket.create(
        company_id=request.user["company_id"],
        subject=subject,
        customer_email=customer_email,
        message=message,
    )
    return jsonify({"message": "Ticket created", "ticket": ticket}), 201

@client_tickets_bp.route("/api/client/tickets/<ticket_id>/reply", methods=["POST"])
@require_auth(required_role="client")
def reply_ticket(ticket_id):
    data = request.get_json(silent=True) or {}
    message = (data.get("message") or "").strip()

    if not message:
        return jsonify({"error": "Message is required"}), 400

    success, error = Ticket.reply(ticket_id, request.user["company_id"], message)
    if not success:
        if error == "not_found":
            return jsonify({"error": "Ticket not found"}), 404
        if error == "already_resolved":
            return jsonify({"error": "Resolved tickets cannot be updated"}), 409
        return jsonify({"error": "Unable to add reply"}), 500

    return jsonify({"message": "Reply added"}), 200

@client_tickets_bp.route("/api/client/tickets/<ticket_id>/resolve", methods=["PATCH"])
@require_auth(required_role="client")
def resolve_ticket(ticket_id):
    success, error = Ticket.resolve(ticket_id, request.user["company_id"])
    if not success:
        if error == "not_found":
            return jsonify({"error": "Ticket not found"}), 404
        if error == "already_resolved":
            return jsonify({"error": "Ticket is already resolved"}), 409
        return jsonify({"error": "Unable to resolve ticket"}), 500

    return jsonify({"message": "Ticket resolved"}), 200


@client_tickets_bp.route("/api/client/tickets/<ticket_id>/ai-assist", methods=["POST"])
@require_auth(required_role="client")
def generate_ticket_ai(ticket_id):
    ticket = Ticket.get_by_id(ticket_id, request.user["company_id"])
    if not ticket:
        return jsonify({"error": "Ticket not found"}), 404

    try:
        ai_assist = generate_ticket_ai_assist(ticket)
    except Exception:
        return jsonify({"error": "AI assist unavailable right now"}), 503

    updated, error = Ticket.update_ai_assist(ticket_id, request.user["company_id"], ai_assist)
    if error == "not_found":
        return jsonify({"error": "Ticket not found"}), 404

    return jsonify({
        "message": "AI assist generated",
        "ai_summary": updated.get("ai_summary"),
        "ai_priority_suggestion": updated.get("ai_priority_suggestion"),
        "ai_meta": updated.get("ai_meta"),
        "ai_last_processed_at": updated.get("ai_last_processed_at"),
    }), 200
