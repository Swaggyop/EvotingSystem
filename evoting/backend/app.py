"""
app.py — application entry point. Wires together the auth, ballot, vote,
admin, and results blueprints defined in routes/.

Run with:  python app.py   (local dev)
           gunicorn "app:create_app()"   (production / Render)
Serves on http://localhost:5000
"""
from flask import Flask, request
from flask_cors import CORS

from models import init_db
from routes.auth import auth_bp
from routes.ballot import ballot_bp
from routes.vote import vote_bp
from routes.admin import admin_bp
from routes.results import results_bp


def create_app():
    # Ensure the DB is initialised regardless of how the server is started.
    # gunicorn calls create_app() directly and never hits __main__, so
    # init_db() MUST live here, not only in the __main__ block.
    init_db()

    app = Flask(__name__)

    # ── CORS — allow every origin (demo/academic project) ──────────
    CORS(app, resources={r"/api/*": {"origins": "*"}},
         supports_credentials=False)

    # Belt-and-suspenders: guarantee the headers even if flask-cors
    # misses a route (e.g. on Render/gunicorn edge cases).
    @app.after_request
    def add_cors_headers(response):
        origin = request.headers.get("Origin", "*")
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Headers"] = "Content-Type,Authorization"
        response.headers["Access-Control-Allow-Methods"] = "GET,POST,PUT,DELETE,OPTIONS"
        return response

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
    app = create_app()  # init_db() is now called inside create_app()
    port = int(os.environ.get("PORT", 5000))
    print(f"E-Voting backend running at http://0.0.0.0:{port}")
    app.run(debug=False, host="0.0.0.0", port=port)
