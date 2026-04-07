import os
from pathlib import Path

from sqlalchemy import inspect, text
from sqlmodel import SQLModel, create_engine

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.getenv("DATA_DIR", BASE_DIR / "data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)

DB_PATH = os.getenv("DATABASE_URL", f"sqlite:///{DATA_DIR / 'app.db'}")

_connect_args = {"check_same_thread": False} if DB_PATH.startswith("sqlite") else {}
engine = create_engine(DB_PATH, connect_args=_connect_args)


def _ensure_column(table_name: str, column_name: str, definition: str) -> None:
    with engine.begin() as conn:
        columns = {column["name"] for column in inspect(conn).get_columns(table_name)}
        if column_name in columns:
            return
        conn.execute(
            text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {definition}")
        )


def init_db() -> None:
    SQLModel.metadata.create_all(engine)
    _ensure_column("injectionlog", "entry_type", "VARCHAR")
    _ensure_column("injectionlog", "unit", "VARCHAR")
    _ensure_column("injectionlog", "form_name", "VARCHAR")
