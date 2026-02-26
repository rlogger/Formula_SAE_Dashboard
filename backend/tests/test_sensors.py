"""Tests for sensor CRUD endpoints and validation."""
import uuid

import pytest
from fastapi.testclient import TestClient

from tests.conftest import auth_headers


def unique_sensor_id() -> str:
    return f"sensor_{uuid.uuid4().hex[:8]}"


class TestCreateSensor:
    """Test POST /admin/sensors."""

    def test_create_sensor_success(self, client: TestClient, admin_token: str):
        sid = unique_sensor_id()
        response = client.post(
            "/admin/sensors",
            json={
                "sensor_id": sid,
                "name": "Test Sensor",
                "unit": "psi",
                "min_value": 0,
                "max_value": 100,
                "group": "Testing",
            },
            headers=auth_headers(admin_token),
        )
        assert response.status_code == 200, f"Create failed: {response.json()}"
        data = response.json()
        assert data["sensor_id"] == sid
        assert data["name"] == "Test Sensor"
        assert data["unit"] == "psi"

    def test_create_sensor_duplicate_id(self, client: TestClient, admin_token: str):
        # First, list existing sensors to get a known ID
        sensors = client.get("/admin/sensors", headers=auth_headers(admin_token)).json()
        if not sensors:
            pytest.skip("No sensors configured")
        existing_id = sensors[0]["sensor_id"]

        response = client.post(
            "/admin/sensors",
            json={
                "sensor_id": existing_id,
                "name": "Dupe",
                "unit": "x",
                "min_value": 0,
                "max_value": 100,
            },
            headers=auth_headers(admin_token),
        )
        assert response.status_code == 400
        assert "already exists" in response.json()["detail"]

    def test_create_sensor_invalid_id_chars(self, client: TestClient, admin_token: str):
        response = client.post(
            "/admin/sensors",
            json={"sensor_id": "bad sensor!", "name": "Bad", "unit": "x"},
            headers=auth_headers(admin_token),
        )
        assert response.status_code == 422

    def test_create_sensor_empty_id(self, client: TestClient, admin_token: str):
        response = client.post(
            "/admin/sensors",
            json={"sensor_id": "", "name": "Empty", "unit": "x"},
            headers=auth_headers(admin_token),
        )
        assert response.status_code == 422

    def test_create_sensor_min_gt_max(self, client: TestClient, admin_token: str):
        response = client.post(
            "/admin/sensors",
            json={"sensor_id": unique_sensor_id(), "name": "Bad Range", "unit": "x", "min_value": 100, "max_value": 50},
            headers=auth_headers(admin_token),
        )
        assert response.status_code == 422

    def test_create_sensor_bad_sort_order(self, client: TestClient, admin_token: str):
        response = client.post(
            "/admin/sensors",
            json={"sensor_id": unique_sensor_id(), "name": "Bad Sort", "unit": "x", "sort_order": 999999},
            headers=auth_headers(admin_token),
        )
        assert response.status_code == 422

    def test_create_sensor_requires_admin(self, client: TestClient, user_token: str):
        response = client.post(
            "/admin/sensors",
            json={"sensor_id": unique_sensor_id(), "name": "No Auth", "unit": "x"},
            headers=auth_headers(user_token),
        )
        assert response.status_code in (401, 403)


class TestListSensors:
    """Test GET /admin/sensors."""

    def test_list_sensors(self, client: TestClient, admin_token: str):
        response = client.get("/admin/sensors", headers=auth_headers(admin_token))
        assert response.status_code == 200
        sensors = response.json()
        assert isinstance(sensors, list)
        assert len(sensors) > 0  # Default sensors are seeded


class TestUpdateSensor:
    """Test PUT /admin/sensors/{sensor_id}."""

    def test_update_sensor_name(self, client: TestClient, admin_token: str):
        sensors = client.get("/admin/sensors", headers=auth_headers(admin_token)).json()
        if not sensors:
            pytest.skip("No sensors")
        sensor_id = sensors[0]["sensor_id"]

        response = client.put(
            f"/admin/sensors/{sensor_id}",
            json={"name": "Updated Name"},
            headers=auth_headers(admin_token),
        )
        assert response.status_code == 200
        assert response.json()["name"] == "Updated Name"

    def test_update_sensor_not_found(self, client: TestClient, admin_token: str):
        response = client.put(
            "/admin/sensors/nonexistent_sensor",
            json={"name": "Nope"},
            headers=auth_headers(admin_token),
        )
        assert response.status_code == 404

    def test_update_sensor_min_gt_max(self, client: TestClient, admin_token: str):
        sensors = client.get("/admin/sensors", headers=auth_headers(admin_token)).json()
        if not sensors:
            pytest.skip("No sensors")
        sensor_id = sensors[0]["sensor_id"]

        response = client.put(
            f"/admin/sensors/{sensor_id}",
            json={"min_value": 999, "max_value": 1},
            headers=auth_headers(admin_token),
        )
        assert response.status_code == 400


class TestDeleteSensor:
    """Test DELETE /admin/sensors/{sensor_id}."""

    def test_delete_sensor_success(self, client: TestClient, admin_token: str):
        sid = unique_sensor_id()
        client.post(
            "/admin/sensors",
            json={"sensor_id": sid, "name": "Delete Me", "unit": "x", "min_value": 0, "max_value": 100},
            headers=auth_headers(admin_token),
        )
        response = client.delete(f"/admin/sensors/{sid}", headers=auth_headers(admin_token))
        assert response.status_code == 200

    def test_delete_sensor_not_found(self, client: TestClient, admin_token: str):
        response = client.delete("/admin/sensors/ghost", headers=auth_headers(admin_token))
        assert response.status_code == 404
