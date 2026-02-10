from flask import Flask
from flask import request
from flask_cors import CORS
from auth.routes import auth_bp
from admin.routes import admin_bp
from client.routes import client_bp
from client.tickets import client_tickets_bp
from auth.routes import auth_bp
from routes.ai_routes import ai_bp

app = Flask(__name__)
CORS(app)

app.register_blueprint(ai_bp, url_prefix="/api")
app.register_blueprint(auth_bp, url_prefix="/api/auth")
app.register_blueprint(admin_bp, url_prefix="/api/admin")
app.register_blueprint(client_bp, url_prefix="/api/client")
app.register_blueprint(client_tickets_bp)

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


if __name__ == "__main__":
    app.run(debug=True)

