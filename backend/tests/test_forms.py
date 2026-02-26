"""Tests for form endpoints and validation."""
import pytest
from fastapi.testclient import TestClient

from tests.conftest import auth_headers


class TestListForms:
    """Test GET /forms."""

    def test_list_forms_admin(self, client: TestClient, admin_token: str):
        response = client.get("/forms", headers=auth_headers(admin_token))
        assert response.status_code == 200
        forms = response.json()
        assert isinstance(forms, list)
        # Admin sees all forms
        assert len(forms) > 0

    def test_list_forms_no_auth(self, client: TestClient):
        response = client.get("/forms")
        assert response.status_code == 401


class TestGetForm:
    """Test GET /forms/{role}."""

    def test_get_form_admin(self, client: TestClient, admin_token: str):
        # First get available forms
        forms = client.get("/forms", headers=auth_headers(admin_token)).json()
        if forms:
            role = forms[0]["role"]
            response = client.get(f"/forms/{role}", headers=auth_headers(admin_token))
            assert response.status_code == 200
            data = response.json()
            assert "form_name" in data
            assert "fields" in data

    def test_get_form_not_found(self, client: TestClient, admin_token: str):
        response = client.get("/forms/nonexistent_role", headers=auth_headers(admin_token))
        assert response.status_code == 404


class TestSubmitForm:
    """Test POST /forms/{role}/submit."""

    def test_submit_form_success(self, client: TestClient, admin_token: str):
        forms = client.get("/forms", headers=auth_headers(admin_token)).json()
        if not forms:
            pytest.skip("No forms configured")
        form = forms[0]
        role = form["role"]
        # Find a text field (not number/select) to submit a string value
        field = None
        for f in form["fields"]:
            if f["type"] in ("text", "textarea"):
                field = f
                break
        if not field:
            # If all fields are number/select, use a number field with a valid number
            field = form["fields"][0]
            test_value = "42" if field["type"] == "number" else "test"
        else:
            test_value = "test_value"
        values = {field["name"]: test_value}
        response = client.post(
            f"/forms/{role}/submit",
            json={"values": values},
            headers=auth_headers(admin_token),
        )
        assert response.status_code == 200, f"Submit failed: {response.json()}"
        assert response.json()["status"] == "saved"

    def test_submit_form_unknown_field(self, client: TestClient, admin_token: str):
        forms = client.get("/forms", headers=auth_headers(admin_token)).json()
        if not forms:
            pytest.skip("No forms configured")
        role = forms[0]["role"]
        response = client.post(
            f"/forms/{role}/submit",
            json={"values": {"__nonexistent_field__": "value"}},
            headers=auth_headers(admin_token),
        )
        assert response.status_code == 400
        assert "Unknown field" in response.json()["detail"]

    def test_submit_form_invalid_number(self, client: TestClient, admin_token: str):
        forms = client.get("/forms", headers=auth_headers(admin_token)).json()
        if not forms:
            pytest.skip("No forms configured")
        # Find a number field
        for form in forms:
            for field in form["fields"]:
                if field["type"] == "number":
                    response = client.post(
                        f"/forms/{form['role']}/submit",
                        json={"values": {field["name"]: "not_a_number"}},
                        headers=auth_headers(admin_token),
                    )
                    assert response.status_code == 422
                    return
        pytest.skip("No number fields found")

    def test_submit_form_not_found(self, client: TestClient, admin_token: str):
        response = client.post(
            "/forms/nonexistent/submit",
            json={"values": {}},
            headers=auth_headers(admin_token),
        )
        assert response.status_code == 404

    def test_submit_form_too_long_value(self, client: TestClient, admin_token: str):
        forms = client.get("/forms", headers=auth_headers(admin_token)).json()
        if not forms:
            pytest.skip("No forms configured")
        form = forms[0]
        field = form["fields"][0]
        response = client.post(
            f"/forms/{form['role']}/submit",
            json={"values": {field["name"]: "x" * 20_000}},
            headers=auth_headers(admin_token),
        )
        assert response.status_code == 422

    def test_submit_form_no_auth(self, client: TestClient):
        response = client.post("/forms/DAQ/submit", json={"values": {}})
        assert response.status_code == 401


class TestGetFormValues:
    """Test GET /forms/{role}/values."""

    def test_get_values_after_submit(self, client: TestClient, admin_token: str):
        forms = client.get("/forms", headers=auth_headers(admin_token)).json()
        if not forms:
            pytest.skip("No forms configured")
        form = forms[0]
        role = form["role"]
        field = form["fields"][0]

        # Submit a value
        client.post(
            f"/forms/{role}/submit",
            json={"values": {field["name"]: "42"}},
            headers=auth_headers(admin_token),
        )

        # Get values
        response = client.get(f"/forms/{role}/values", headers=auth_headers(admin_token))
        assert response.status_code == 200
        data = response.json()
        assert "values" in data
        assert "timestamps" in data
        assert data["values"].get(field["name"]) == "42"
