from flask import Blueprint, request, jsonify
from auth.middleware import require_auth
from models.ticket import Ticket

client_tickets_bp = Blueprint("client_tickets", __name__)

@client_tickets_bp.route("/api/client/tickets", methods=["GET"])
@require_auth(required_role="client")
def get_tickets(current_user):
    tickets = Ticket.get_by_company(current_user["company_id"])
    return jsonify(tickets)

@client_tickets_bp.route("/api/client/tickets/<ticket_id>/reply", methods=["POST"])
@require_auth(required_role="client")
def reply_ticket(current_user, ticket_id):
    data = request.json
    Ticket.reply(ticket_id, current_user["company_id"], data["message"])
    return jsonify({"message": "Reply added"})

@client_tickets_bp.route("/api/client/tickets/<ticket_id>/resolve", methods=["PATCH"])
@require_auth(required_role="client")
def resolve_ticket(current_user, ticket_id):
    Ticket.resolve(ticket_id, current_user["company_id"])
    return jsonify({"message": "Ticket resolved"})
