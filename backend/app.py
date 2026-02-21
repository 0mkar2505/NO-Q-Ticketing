from flask import Flask
from flask import request
from flask import send_from_directory
from flask_cors import CORS
from auth.routes import auth_bp
from admin.routes import admin_bp
from client.routes import client_bp
from client.tickets import client_tickets_bp
from client.analytics import client_analytics_bp
from client.configs import client_configs_bp
from client.knowledge import client_knowledge_bp
from support.routes import support_bp
from routes.ai_routes import ai_bp
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "frontend"))

app = Flask(__name__)
CORS(app)

app.register_blueprint(ai_bp, url_prefix="/api")
app.register_blueprint(auth_bp, url_prefix="/api/auth")
app.register_blueprint(admin_bp, url_prefix="/api/admin")
app.register_blueprint(client_bp, url_prefix="/api/client")
app.register_blueprint(client_tickets_bp)
app.register_blueprint(client_analytics_bp)
app.register_blueprint(client_configs_bp)
app.register_blueprint(client_knowledge_bp)
app.register_blueprint(support_bp)

@app.route("/health")
def health():
    return {"status": "ok"}

from auth.middleware import require_auth

@app.route("/protected")
@require_auth()
def protected():
    return {
        "message": "You are authenticated",
        "user": request.user
    }

@app.route("/support", defaults={"company_slug": ""})
@app.route("/support/<company_slug>")
def serve_support(company_slug):
    # Tenant is derived client-side from the URL path (/support/<slug>) so customers never type it.
    return send_from_directory(FRONTEND_DIR, "public/support.html")

@app.route("/", defaults={"path": "public/index.html"})
@app.route("/<path:path>")
def serve_frontend(path):
    file_path = os.path.join(FRONTEND_DIR, path)

    if os.path.isfile(file_path):
        return send_from_directory(FRONTEND_DIR, path)

    return send_from_directory(FRONTEND_DIR, "public/index.html")


if __name__ == "__main__":
    app.run(debug=True)
