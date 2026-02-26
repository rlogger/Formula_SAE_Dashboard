"""Tests for authentication endpoints and validation."""
import pytest
from fastapi.testclient import TestClient

from tests.conftest import auth_headers


class TestLogin:
    """Test POST /auth/login."""

    def test_login_success(self, client: TestClient, admin_token: str):
        """Create a test user with known credentials and verify login works."""
        import uuid
        from tests.conftest import auth_headers

        # Create a user with known creds via admin API
        username = f"logintest_{uuid.uuid4().hex[:6]}"
        password = "TestPass123!"
        client.post(
            "/admin/users",
            json={"username": username, "password": password, "roles": ["DAQ"]},
            headers=auth_headers(admin_token),
        )
        response = client.post("/auth/login", data={"username": username, "password": password})
        assert response.status_code == 200, f"Login failed: {response.json()}"
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"

    def test_login_wrong_password(self, client: TestClient):
        response = client.post("/auth/login", data={"username": "admin", "password": "wrong"})
        assert response.status_code == 401
        assert "Incorrect password" in response.json()["detail"]

    def test_login_nonexistent_user(self, client: TestClient):
        response = client.post("/auth/login", data={"username": "ghost", "password": "anything"})
        assert response.status_code == 401
        assert "Account not found" in response.json()["detail"]

    def test_login_empty_username(self, client: TestClient):
        response = client.post("/auth/login", data={"username": "", "password": "anything"})
        # Either 400 (our validation) or 422 (FastAPI form validation)
        assert response.status_code in (400, 422)

    def test_login_empty_password(self, client: TestClient):
        response = client.post("/auth/login", data={"username": "admin", "password": ""})
        assert response.status_code in (400, 422)

    def test_login_long_username(self, client: TestClient):
        response = client.post("/auth/login", data={"username": "a" * 200, "password": "anything"})
        assert response.status_code == 400


class TestMe:
    """Test GET /auth/me."""

    def test_me_authenticated(self, client: TestClient, admin_token: str):
        response = client.get("/auth/me", headers=auth_headers(admin_token))
        assert response.status_code == 200
        data = response.json()
        assert data["username"] == "admin"
        assert data["is_admin"] is True

    def test_me_no_token(self, client: TestClient):
        response = client.get("/auth/me")
        assert response.status_code == 401

    def test_me_invalid_token(self, client: TestClient):
        response = client.get("/auth/me", headers=auth_headers("invalid.jwt.token"))
        assert response.status_code == 401

    def test_me_expired_token(self, client: TestClient):
        # Use a manually crafted expired token
        import jwt
        import os
        from datetime import datetime, timedelta, timezone
        expired = jwt.encode(
            {"sub": "admin", "exp": datetime.now(timezone.utc) - timedelta(hours=1)},
            os.environ["JWT_SECRET"],
            algorithm="HS256",
        )
        response = client.get("/auth/me", headers=auth_headers(expired))
        assert response.status_code == 401
