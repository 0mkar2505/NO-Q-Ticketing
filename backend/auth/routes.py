from flask import Blueprint, request, jsonify
from models.user import User
from models.user import create_user, get_user_by_email  
from models.company import create_company
from auth.utils import check_password, generate_token
from auth.utils import hash_password
from models.db import user_collection

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")

@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.json

    if not data or "email" not in data or "password" not in data:
        return jsonify({"error": "Invalid request"}), 400

    print("LOGIN START")
    user = User.find_by_email(data["email"])
    print("LOGIN QUERY DONE")

    if not user or not check_password(data["password"], user.password):
        return jsonify({"error": "Invalid credentials"}), 401

    # Backfill hierarchy fields for existing users (safe/no-op for new users).
    platform_role = user.platform_role or ("platform_admin" if user.role == "admin" else "client_user")
    company_role = user.company_role
    if platform_role == "client_user" and not company_role:
        company_role = "supervisor"

    if user.platform_role != platform_role or user.company_role != company_role:
        user_collection.update_one(
            {"_id": user._id},
            {"$set": {"platform_role": platform_role, "company_role": company_role}}
        )
        user.platform_role = platform_role
        user.company_role = company_role

    token = generate_token(user)

    return jsonify({
        "token": token,
        "user": {
            "id": str(user._id),
            "role": "admin" if platform_role == "platform_admin" else "client",
            "platform_role": platform_role,
            "company_role": company_role,
            "company_id": str(user.company_id) if user.company_id else None
        }
    })

@auth_bp.route("/register", methods=["POST"])
def register():
    data = request.json

    # Security: Force client role for public registration
    # Block any attempt to create admin accounts via API
    if data.get("role") and data["role"] != "client":
        return jsonify({"error": "Admin accounts cannot be created publicly"}), 403
    
    # Force client role
    data["role"] = "client"

    name = data.get("name")
    email = data.get("email")
    password = data.get("password")
    company_name = data.get("company_name")

    if not all([name, email, password]):
        return jsonify({"error": "Missing required fields"}), 400

    if not company_name:
        return jsonify({"error": "Company name is required"}), 400

    if get_user_by_email(email):
        return jsonify({"error": "User already exists"}), 409

    # Create company for client
    company = create_company(company_name, email)
    company_id = company["_id"]

    hashed_pw = hash_password(password)

    create_user(
        name=name,
        email=email,
        password=hashed_pw,
        role="client",
        company_id=company_id,
        platform_role="client_user",
        company_role="supervisor"
    )

    return jsonify({
        "message": "User registered successfully",
        "company_slug": company.get("slug"),
    }), 201
