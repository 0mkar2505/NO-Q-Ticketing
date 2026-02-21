from flask import Blueprint, jsonify, request
from auth.middleware import require_auth
from models.ticket import Ticket

client_analytics_bp = Blueprint("client_analytics", __name__)


@client_analytics_bp.route("/api/client/analytics", methods=["GET"])
@require_auth(required_role="client", required_company_role="supervisor")
def get_client_analytics():
    analytics = Ticket.get_analytics(request.user["company_id"])
    return jsonify(analytics), 200
