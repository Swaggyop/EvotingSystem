"""
app.py — application entry point. Wires together the auth, ballot, vote,
admin, and results blueprints defined in routes/.

Run with:  python app.py
Serves on http://localhost:5000
"""
from flask import Flask
from flask_cors import CORS

from models import init_db
from routes.auth import auth_bp
from routes.ballot import ballot_bp
from routes.vote import vote_bp
from routes.admin import admin_bp
from routes.results import results_bp


def create_app():
    app = Flask(__name__)
    CORS(app)  # demo-only: open CORS so the frontend dev server can call this API

    app.register_blueprint(auth_bp, url_prefix="/api")
    app.register_blueprint(ballot_bp, url_prefix="/api")
    app.register_blueprint(vote_bp, url_prefix="/api")
    app.register_blueprint(admin_bp, url_prefix="/api")
    app.register_blueprint(results_bp, url_prefix="/api")

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    return app


if __name__ == "__main__":
    import os
    init_db()
    app = create_app()
    port = int(os.environ.get("PORT", 5000))
    print(f"E-Voting backend running at http://0.0.0.0:{port}")
    app.run(debug=False, host="0.0.0.0", port=port)
