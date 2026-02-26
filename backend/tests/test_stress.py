"""Stress tests for reliability and edge cases."""
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed

import pytest
from fastapi.testclient import TestClient

from tests.conftest import auth_headers


class TestConcurrentUsers:
    """Test creating many users concurrently."""

    def test_create_50_users_sequentially(self, client: TestClient, admin_token: str):
        """Verify the system handles rapid sequential user creation."""
        created = []
        headers = auth_headers(admin_token)
        for i in range(50):
            name = f"stress_{uuid.uuid4().hex[:8]}"
            resp = client.post(
                "/admin/users",
                json={"username": name, "password": f"StressPass{i}!", "roles": ["DAQ"]},
                headers=headers,
            )
            assert resp.status_code == 200, f"Failed on user {i}: {resp.json()}"
            created.append(resp.json()["id"])

        # Verify all exist
        users = client.get("/admin/users", headers=headers).json()
        created_ids = {u["id"] for u in users}
        for uid in created:
            assert uid in created_ids

        # Cleanup
        for uid in created:
            client.delete(f"/admin/users/{uid}", headers=headers)


class TestFormStress:
    """Test rapid form submissions."""

    def test_rapid_form_submissions(self, client: TestClient, admin_token: str):
        """Submit forms 100 times rapidly to check data integrity."""
        forms = client.get("/forms", headers=auth_headers(admin_token)).json()
        if not forms:
            pytest.skip("No forms configured")

        form = forms[0]
        role = form["role"]
        headers = auth_headers(admin_token)

        # Find a suitable field
        field = None
        for f in form["fields"]:
            if f["type"] in ("text", "textarea"):
                field = f
                break
        if not field:
            field = form["fields"][0]

        for i in range(100):
            val = str(i) if field["type"] == "number" else f"stress_value_{i}"
            resp = client.post(
                f"/forms/{role}/submit",
                json={"values": {field["name"]: val}},
                headers=headers,
            )
            assert resp.status_code == 200, f"Failed on submission {i}: {resp.json()}"

        # Verify the last value persisted
        values_resp = client.get(f"/forms/{role}/values", headers=headers)
        assert values_resp.status_code == 200
        final_val = values_resp.json()["values"].get(field["name"])
        expected = "99" if field["type"] == "number" else "stress_value_99"
        assert final_val == expected


class TestAuditLogStress:
    """Test audit log under load."""

    def test_audit_log_pagination_sweep(self, client: TestClient, admin_token: str):
        """Page through the entire audit log."""
        headers = auth_headers(admin_token)
        total_resp = client.get("/admin/audit?limit=1", headers=headers)
        assert total_resp.status_code == 200
        total = total_resp.json()["total"]

        # Page through in chunks of 20
        collected = 0
        offset = 0
        while offset < total:
            resp = client.get(f"/admin/audit?offset={offset}&limit=20", headers=headers)
            assert resp.status_code == 200
            items = resp.json()["items"]
            collected += len(items)
            offset += 20
            if not items:
                break

        assert collected == total


class TestEdgeCases:
    """Test unusual but valid inputs."""

    def test_unicode_username(self, client: TestClient, admin_token: str):
        """Unicode in username should be rejected by our pattern validator."""
        resp = client.post(
            "/admin/users",
            json={"username": "user_\u00e9\u00e0", "password": "Password1!", "roles": ["DAQ"]},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 422

    def test_very_long_password(self, client: TestClient, admin_token: str):
        """Password at max length should work."""
        name = f"longpw_{uuid.uuid4().hex[:6]}"
        # 128 chars is the max
        password = "Aa1!" + "x" * 124
        resp = client.post(
            "/admin/users",
            json={"username": name, "password": password, "roles": ["DAQ"]},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200

    def test_password_just_over_max(self, client: TestClient, admin_token: str):
        """Password over max length should fail."""
        name = f"overpw_{uuid.uuid4().hex[:6]}"
        password = "Aa1!" + "x" * 200
        resp = client.post(
            "/admin/users",
            json={"username": name, "password": password, "roles": ["DAQ"]},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code in (400, 422)

    def test_empty_form_submit(self, client: TestClient, admin_token: str):
        """Submitting an empty values dict should succeed (no-op)."""
        forms = client.get("/forms", headers=auth_headers(admin_token)).json()
        if not forms:
            pytest.skip("No forms configured")
        role = forms[0]["role"]
        resp = client.post(
            f"/forms/{role}/submit",
            json={"values": {}},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200

    def test_sensor_boundary_values(self, client: TestClient, admin_token: str):
        """Test sensor with extreme but valid values."""
        sid = f"boundary_{uuid.uuid4().hex[:6]}"
        resp = client.post(
            "/admin/sensors",
            json={
                "sensor_id": sid,
                "name": "Boundary Test",
                "unit": "x",
                "min_value": -999999.99,
                "max_value": 999999.99,
                "sort_order": -1000,
            },
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200

    def test_dashboard_prefs_overwrite(self, client: TestClient, admin_token: str):
        """Save prefs multiple times to verify idempotency."""
        headers = auth_headers(admin_token)
        for i in range(10):
            resp = client.put(
                "/telemetry/preferences",
                json={"config": f'{{"version": {i}}}'},
                headers=headers,
            )
            assert resp.status_code == 200

        final = client.get("/telemetry/preferences", headers=headers).json()
        assert '"version": 9' in final["config"]

    def test_double_delete_user_returns_404(self, client: TestClient, admin_token: str):
        """Deleting a user twice should return 404 on second attempt."""
        headers = auth_headers(admin_token)
        name = f"dbl_del_{uuid.uuid4().hex[:6]}"
        create_resp = client.post(
            "/admin/users",
            json={"username": name, "password": "Password1!", "roles": ["DAQ"]},
            headers=headers,
        )
        uid = create_resp.json()["id"]
        resp1 = client.delete(f"/admin/users/{uid}", headers=headers)
        assert resp1.status_code == 200
        resp2 = client.delete(f"/admin/users/{uid}", headers=headers)
        assert resp2.status_code == 404
