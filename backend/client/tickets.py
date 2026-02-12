from flask import Blueprint, request, jsonify
from auth.middleware import require_auth
from models.ticket import Ticket

client_tickets_bp = Blueprint("client_tickets", __name__)

@client_tickets_bp.route("/api/client/tickets", methods=["GET"])
@require_auth(required_role="client")
def get_tickets():
    tickets = Ticket.get_by_company(request.user["company_id"])
    return jsonify(tickets), 200

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
