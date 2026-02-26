"""Tests for user management endpoints."""
import uuid

import pytest
from fastapi.testclient import TestClient

from tests.conftest import auth_headers


def unique_name(prefix: str = "user") -> str:
    """Generate a unique username for tests."""
    return f"{prefix}_{uuid.uuid4().hex[:8]}"


class TestCreateUser:
    """Test POST /admin/users."""

    def test_create_user_success(self, client: TestClient, admin_token: str):
        name = unique_name("new")
        response = client.post(
            "/admin/users",
            json={"username": name, "password": "Password1!", "roles": ["DAQ"]},
            headers=auth_headers(admin_token),
        )
        assert response.status_code == 200
        data = response.json()
        assert data["username"] == name
        assert data["is_admin"] is False
        assert "DAQ" in data["roles"]

    def test_create_admin_user(self, client: TestClient, admin_token: str):
        name = unique_name("adm")
        response = client.post(
            "/admin/users",
            json={"username": name, "password": "Admin123!", "roles": [], "is_admin": True},
            headers=auth_headers(admin_token),
        )
        assert response.status_code == 200
        assert response.json()["is_admin"] is True

    def test_create_user_duplicate_username(self, client: TestClient, admin_token: str):
        response = client.post(
            "/admin/users",
            json={"username": "admin", "password": "Password1!", "roles": ["DAQ"]},
            headers=auth_headers(admin_token),
        )
        assert response.status_code == 409
        assert "already exists" in response.json()["detail"]

    def test_create_user_short_password(self, client: TestClient, admin_token: str):
        response = client.post(
            "/admin/users",
            json={"username": unique_name(), "password": "Ab1!", "roles": ["DAQ"]},
            headers=auth_headers(admin_token),
        )
        assert response.status_code == 400
        assert "at least" in response.json()["detail"]

    def test_create_user_all_digit_password(self, client: TestClient, admin_token: str):
        response = client.post(
            "/admin/users",
            json={"username": unique_name(), "password": "12345678", "roles": ["DAQ"]},
            headers=auth_headers(admin_token),
        )
        assert response.status_code == 400
        assert "all numbers" in response.json()["detail"]

    def test_create_user_all_alpha_password(self, client: TestClient, admin_token: str):
        response = client.post(
            "/admin/users",
            json={"username": unique_name(), "password": "abcdefgh", "roles": ["DAQ"]},
            headers=auth_headers(admin_token),
        )
        assert response.status_code == 400
        assert "number or special" in response.json()["detail"]

    def test_create_user_invalid_username_chars(self, client: TestClient, admin_token: str):
        response = client.post(
            "/admin/users",
            json={"username": "user name!", "password": "Password1!", "roles": ["DAQ"]},
            headers=auth_headers(admin_token),
        )
        assert response.status_code == 422

    def test_create_user_empty_username(self, client: TestClient, admin_token: str):
        response = client.post(
            "/admin/users",
            json={"username": "  ", "password": "Password1!", "roles": ["DAQ"]},
            headers=auth_headers(admin_token),
        )
        assert response.status_code == 422

    def test_create_user_too_long_username(self, client: TestClient, admin_token: str):
        response = client.post(
            "/admin/users",
            json={"username": "a" * 100, "password": "Password1!", "roles": ["DAQ"]},
            headers=auth_headers(admin_token),
        )
        assert response.status_code == 422

    def test_create_user_invalid_role(self, client: TestClient, admin_token: str):
        response = client.post(
            "/admin/users",
            json={"username": unique_name(), "password": "Password1!", "roles": ["nonexistent"]},
            headers=auth_headers(admin_token),
        )
        assert response.status_code == 400

    def test_create_user_too_many_roles(self, client: TestClient, admin_token: str):
        response = client.post(
            "/admin/users",
            json={"username": unique_name(), "password": "Password1!", "roles": ["DAQ", "Chief", "aero"]},
            headers=auth_headers(admin_token),
        )
        assert response.status_code == 422

    def test_create_admin_with_roles_fails(self, client: TestClient, admin_token: str):
        response = client.post(
            "/admin/users",
            json={"username": unique_name(), "password": "Password1!", "roles": ["DAQ"], "is_admin": True},
            headers=auth_headers(admin_token),
        )
        assert response.status_code == 400
        assert "Admin cannot have subteam roles" in response.json()["detail"]

    def test_create_non_admin_without_roles_fails(self, client: TestClient, admin_token: str):
        response = client.post(
            "/admin/users",
            json={"username": unique_name(), "password": "Password1!", "roles": []},
            headers=auth_headers(admin_token),
        )
        assert response.status_code == 400

    def test_create_user_requires_admin(self, client: TestClient, user_token: str):
        response = client.post(
            "/admin/users",
            json={"username": unique_name(), "password": "Password1!", "roles": ["DAQ"]},
            headers=auth_headers(user_token),
        )
        # Should be 401 or 403
        assert response.status_code in (401, 403)


class TestDeleteUser:
    """Test DELETE /admin/users/{user_id}."""

    def test_delete_user_success(self, client: TestClient, admin_token: str):
        name = unique_name("del")
        create_resp = client.post(
            "/admin/users",
            json={"username": name, "password": "Password1!", "roles": ["DAQ"]},
            headers=auth_headers(admin_token),
        )
        assert create_resp.status_code == 200, f"Create failed: {create_resp.json()}"
        user_id = create_resp.json()["id"]

        response = client.delete(f"/admin/users/{user_id}", headers=auth_headers(admin_token))
        assert response.status_code == 200
        assert response.json()["status"] == "deleted"

    def test_delete_nonexistent_user(self, client: TestClient, admin_token: str):
        response = client.delete("/admin/users/99999", headers=auth_headers(admin_token))
        assert response.status_code == 404

    def test_delete_self_fails(self, client: TestClient, admin_token: str):
        # Get admin's own user ID
        me_resp = client.get("/auth/me", headers=auth_headers(admin_token))
        my_id = me_resp.json()["id"]

        response = client.delete(f"/admin/users/{my_id}", headers=auth_headers(admin_token))
        assert response.status_code == 400
        assert "cannot delete your own" in response.json()["detail"]


class TestUpdatePassword:
    """Test PUT /admin/users/{user_id}/password."""

    def test_update_password_success(self, client: TestClient, admin_token: str):
        name = unique_name("pw")
        create_resp = client.post(
            "/admin/users",
            json={"username": name, "password": "Password1!", "roles": ["DAQ"]},
            headers=auth_headers(admin_token),
        )
        assert create_resp.status_code == 200, f"Create failed: {create_resp.json()}"
        user_id = create_resp.json()["id"]

        response = client.put(
            f"/admin/users/{user_id}/password",
            json={"password": "NewPass123!"},
            headers=auth_headers(admin_token),
        )
        assert response.status_code == 200

    def test_update_password_weak(self, client: TestClient, admin_token: str):
        me_resp = client.get("/auth/me", headers=auth_headers(admin_token))
        my_id = me_resp.json()["id"]

        response = client.put(
            f"/admin/users/{my_id}/password",
            json={"password": "123"},
            headers=auth_headers(admin_token),
        )
        assert response.status_code == 400


class TestUpdateRoles:
    """Test PUT /admin/users/{user_id}/roles."""

    def test_update_roles_success(self, client: TestClient, admin_token: str):
        name = unique_name("role")
        create_resp = client.post(
            "/admin/users",
            json={"username": name, "password": "Password1!", "roles": ["DAQ"]},
            headers=auth_headers(admin_token),
        )
        assert create_resp.status_code == 200, f"Create failed: {create_resp.json()}"
        user_id = create_resp.json()["id"]

        response = client.put(
            f"/admin/users/{user_id}/roles",
            json={"roles": ["Chief"]},
            headers=auth_headers(admin_token),
        )
        assert response.status_code == 200
        assert "Chief" in response.json()["roles"]

    def test_update_roles_nonexistent_user(self, client: TestClient, admin_token: str):
        response = client.put(
            "/admin/users/99999/roles",
            json={"roles": ["DAQ"]},
            headers=auth_headers(admin_token),
        )
        assert response.status_code == 404


class TestListUsers:
    """Test GET /admin/users."""

    def test_list_users(self, client: TestClient, admin_token: str):
        response = client.get("/admin/users", headers=auth_headers(admin_token))
        assert response.status_code == 200
        users = response.json()
        assert isinstance(users, list)
        assert len(users) >= 1  # At least admin
