"""Shared test fixtures for the backend test suite."""
import os
import tempfile

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine

# Set required env vars BEFORE importing the app modules
os.environ["JWT_SECRET"] = "test-secret-key-for-testing-only"
os.environ["ADMIN_USERNAME"] = "admin"
os.environ["ADMIN_PASSWORD"] = "Admin123!"

from app.auth import create_access_token, get_password_hash
from app.database import engine as prod_engine
from app.main import app
from app.models import Role, SubteamRole, User


@pytest.fixture(scope="session")
def test_db():
    """Create a temporary database for tests."""
    tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    tmp.close()
    db_url = f"sqlite:///{tmp.name}"
    test_engine = create_engine(db_url, connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(test_engine)
    yield test_engine
    os.unlink(tmp.name)


@pytest.fixture()
def session(test_db):
    """Provide a database session for each test."""
    # Reset tables
    SQLModel.metadata.drop_all(test_db)
    SQLModel.metadata.create_all(test_db)
    with Session(test_db) as session:
        # Seed roles
        for role in SubteamRole:
            session.add(Role(name=role.value))
        session.commit()
        yield session


@pytest.fixture()
def client():
    """Provide a test client for the FastAPI app."""
    return TestClient(app)


@pytest.fixture()
def admin_token():
    """Generate a valid admin JWT token."""
    return create_access_token("admin")


@pytest.fixture()
def user_token():
    """Generate a valid user JWT token."""
    return create_access_token("testuser")


def auth_headers(token: str) -> dict:
    """Helper to create auth headers."""
    return {"Authorization": f"Bearer {token}"}
