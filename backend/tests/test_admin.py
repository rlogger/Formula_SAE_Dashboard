"""Tests for admin endpoints - audit, LDX, data management."""
import pytest
from fastapi.testclient import TestClient

from tests.conftest import auth_headers


class TestHealth:
    """Test GET /health."""

    def test_health_check(self, client: TestClient):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}


class TestAuditLog:
    """Test GET /admin/audit."""

    def test_audit_log_default(self, client: TestClient, admin_token: str):
        response = client.get("/admin/audit", headers=auth_headers(admin_token))
        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert "total" in data
        assert isinstance(data["items"], list)

    def test_audit_log_pagination(self, client: TestClient, admin_token: str):
        response = client.get(
            "/admin/audit?offset=0&limit=5",
            headers=auth_headers(admin_token),
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["items"]) <= 5

    def test_audit_log_invalid_limit(self, client: TestClient, admin_token: str):
        response = client.get(
            "/admin/audit?limit=0",
            headers=auth_headers(admin_token),
        )
        assert response.status_code == 422

    def test_audit_log_too_large_limit(self, client: TestClient, admin_token: str):
        response = client.get(
            "/admin/audit?limit=1000",
            headers=auth_headers(admin_token),
        )
        assert response.status_code == 422

    def test_audit_log_negative_offset(self, client: TestClient, admin_token: str):
        response = client.get(
            "/admin/audit?offset=-1",
            headers=auth_headers(admin_token),
        )
        assert response.status_code == 422

    def test_audit_log_no_auth(self, client: TestClient):
        response = client.get("/admin/audit")
        assert response.status_code == 401


class TestClearData:
    """Test POST /admin/clear-data."""

    def test_clear_data(self, client: TestClient, admin_token: str):
        response = client.post("/admin/clear-data", headers=auth_headers(admin_token))
        assert response.status_code == 200
        assert response.json()["status"] == "cleared"


class TestWatchDirectory:
    """Test watch directory endpoints."""

    def test_get_watch_directory(self, client: TestClient, admin_token: str):
        response = client.get("/admin/watch-directory", headers=auth_headers(admin_token))
        assert response.status_code == 200
        assert "path" in response.json()

    def test_set_watch_directory_empty(self, client: TestClient, admin_token: str):
        response = client.put(
            "/admin/watch-directory",
            json={"path": ""},
            headers=auth_headers(admin_token),
        )
        assert response.status_code == 400

    def test_set_watch_directory_nonexistent(self, client: TestClient, admin_token: str):
        response = client.put(
            "/admin/watch-directory",
            json={"path": "/nonexistent/path/12345"},
            headers=auth_headers(admin_token),
        )
        assert response.status_code == 400
        assert "does not exist" in response.json()["detail"]

    def test_set_watch_directory_sensitive_path(self, client: TestClient, admin_token: str):
        # /usr/bin is a system dir
        response = client.put(
            "/admin/watch-directory",
            json={"path": "/usr/bin"},
            headers=auth_headers(admin_token),
        )
        assert response.status_code == 400
        assert "not allowed" in response.json()["detail"]

    def test_set_watch_directory_too_long(self, client: TestClient, admin_token: str):
        response = client.put(
            "/admin/watch-directory",
            json={"path": "/" + "a" * 2000},
            headers=auth_headers(admin_token),
        )
        assert response.status_code == 400


class TestLdxFiles:
    """Test LDX file endpoints."""

    def test_list_ldx_files(self, client: TestClient, admin_token: str):
        response = client.get("/admin/ldx-files", headers=auth_headers(admin_token))
        assert response.status_code == 200
        assert isinstance(response.json(), list)

    def test_ldx_injections_path_traversal(self, client: TestClient, admin_token: str):
        response = client.get(
            "/admin/ldx-files/../../etc/passwd/injections",
            headers=auth_headers(admin_token),
        )
        assert response.status_code in (400, 404, 422)

    def test_ldx_injections_non_ldx_file(self, client: TestClient, admin_token: str):
        response = client.get(
            "/admin/ldx-files/test.txt/injections",
            headers=auth_headers(admin_token),
        )
        assert response.status_code == 400

    def test_ldx_stats(self, client: TestClient, admin_token: str):
        response = client.get("/admin/ldx-stats", headers=auth_headers(admin_token))
        assert response.status_code == 200
        assert isinstance(response.json(), list)


class TestRoles:
    """Test GET /roles."""

    def test_list_roles(self, client: TestClient, admin_token: str):
        response = client.get("/roles", headers=auth_headers(admin_token))
        assert response.status_code == 200
        roles = response.json()
        assert isinstance(roles, list)


class TestDashboardPreferences:
    """Test telemetry preferences endpoints."""

    def test_get_preferences(self, client: TestClient, admin_token: str):
        response = client.get("/telemetry/preferences", headers=auth_headers(admin_token))
        assert response.status_code == 200
        assert "config" in response.json()

    def test_save_preferences_valid_json(self, client: TestClient, admin_token: str):
        response = client.put(
            "/telemetry/preferences",
            json={"config": '{"charts": []}'},
            headers=auth_headers(admin_token),
        )
        assert response.status_code == 200

    def test_save_preferences_invalid_json(self, client: TestClient, admin_token: str):
        response = client.put(
            "/telemetry/preferences",
            json={"config": "not valid json {"},
            headers=auth_headers(admin_token),
        )
        assert response.status_code == 422

    def test_save_preferences_empty(self, client: TestClient, admin_token: str):
        response = client.put(
            "/telemetry/preferences",
            json={"config": ""},
            headers=auth_headers(admin_token),
        )
        assert response.status_code == 422

    def test_save_preferences_too_large(self, client: TestClient, admin_token: str):
        large_config = '{"data": "' + "x" * 200_000 + '"}'
        response = client.put(
            "/telemetry/preferences",
            json={"config": large_config},
            headers=auth_headers(admin_token),
        )
        assert response.status_code == 422


class TestTelemetrySource:
    """Test telemetry source endpoints."""

    def test_get_telemetry_source(self, client: TestClient, admin_token: str):
        response = client.get("/telemetry/source", headers=auth_headers(admin_token))
        assert response.status_code == 200
        data = response.json()
        assert "active_source" in data

    def test_set_source_valid(self, client: TestClient, admin_token: str):
        response = client.put(
            "/admin/serial/source",
            json={"source": "simulated"},
            headers=auth_headers(admin_token),
        )
        assert response.status_code == 200

    def test_set_source_invalid(self, client: TestClient, admin_token: str):
        response = client.put(
            "/admin/serial/source",
            json={"source": "invalid_source"},
            headers=auth_headers(admin_token),
        )
        assert response.status_code == 422


class TestSerialConfig:
    """Test serial configuration endpoints."""

    def test_get_serial_config(self, client: TestClient, admin_token: str):
        response = client.get("/admin/serial/config", headers=auth_headers(admin_token))
        assert response.status_code == 200

    def test_update_serial_invalid_baud(self, client: TestClient, admin_token: str):
        response = client.put(
            "/admin/serial/config",
            json={"baud_rate": 12345},
            headers=auth_headers(admin_token),
        )
        assert response.status_code == 422

    def test_update_serial_invalid_timeout(self, client: TestClient, admin_token: str):
        response = client.put(
            "/admin/serial/config",
            json={"timeout": -5},
            headers=auth_headers(admin_token),
        )
        assert response.status_code == 422
