from datetime import datetime, timedelta, timezone
from pathlib import Path
from xml.etree import ElementTree

import pytest
from sqlmodel import Session, SQLModel, create_engine, select

from app import auth, database, ldx_watcher, main
from app.auth import ensure_default_admin, ensure_roles
from app.ldx_watcher import inject_values_into_ldx, reinject_logged_values_into_ldx
from app.models import FormValue, InjectionLog, LdxFile, Setting


def _write_minimal_ldx(path: Path) -> None:
    path.write_text(
        '<?xml version="1.0" encoding="utf-8"?><Workbook />',
        encoding="utf-8",
    )


def _parse_ldx(path: Path) -> ElementTree.Element:
    return ElementTree.parse(path).getroot()


@pytest.fixture()
def isolated_ldx_env(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    db_path = tmp_path / "test.db"
    test_engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )

    for module in (database, auth, ldx_watcher, main):
        monkeypatch.setattr(module, "engine", test_engine)

    SQLModel.metadata.create_all(test_engine)
    database.init_db()

    with Session(test_engine) as session:
        ensure_roles(session)
        ensure_default_admin(session)
        session.add(Setting(key="watch_directory", value=str(tmp_path)))
        session.commit()

    return test_engine, tmp_path


def test_reinject_endpoint_replays_logged_values_not_latest_db_values(
    isolated_ldx_env,
):
    test_engine, tmp_path = isolated_ldx_env
    ldx_path = tmp_path / "manual.ldx"
    _write_minimal_ldx(ldx_path)

    initial_time = datetime.now(timezone.utc)
    later_time = initial_time + timedelta(minutes=5)

    with Session(test_engine) as session:
        session.add(
            FormValue(
                form_name="Aero",
                field_name="rear_element_2_position",
                value="10",
                updated_at=initial_time,
            )
        )
        session.add(
            FormValue(
                form_name="Aero",
                field_name="rake_id",
                value="R1",
                updated_at=initial_time,
            )
        )
        inject_values_into_ldx(ldx_path, session, initial_time)
        session.add(
            LdxFile(
                path=str(ldx_path.resolve()),
                mtime=ldx_path.stat().st_mtime,
                processed_at=initial_time,
            )
        )
        session.commit()

    with Session(test_engine) as session:
        session.add(
            FormValue(
                form_name="Aero",
                field_name="rear_element_2_position",
                value="99",
                updated_at=later_time,
            )
        )
        session.add(
            FormValue(
                form_name="Aero",
                field_name="rake_id",
                value="R2",
                updated_at=later_time,
            )
        )
        session.commit()

    _write_minimal_ldx(ldx_path)

    response = main.reinject_ldx_file("manual.ldx", None)

    assert response.file_name == "manual.ldx"
    assert response.created == 2
    assert response.updated == 0
    assert response.unchanged == 0

    root = _parse_ldx(ldx_path)
    restored_string = root.find("./Layers/Details/String[@Id='Rake Id']")
    restored_math = root.find(
        "./Maths/MathConstants/MathConstant[@Name='Rear Element 2 Position']"
    )

    assert restored_string is not None
    assert restored_string.get("Value") == "R1"
    assert restored_math is not None
    assert restored_math.get("Value") == "10"


def test_reinject_logged_values_restores_missing_and_changed_entries(
    isolated_ldx_env,
):
    test_engine, tmp_path = isolated_ldx_env
    ldx_path = tmp_path / "verify.ldx"
    _write_minimal_ldx(ldx_path)

    injected_at = datetime.now(timezone.utc)

    with Session(test_engine) as session:
        session.add(
            FormValue(
                form_name="Aero",
                field_name="rear_element_2_position",
                value="10",
                updated_at=injected_at,
            )
        )
        session.add(
            FormValue(
                form_name="Aero",
                field_name="rake_id",
                value="R1",
                updated_at=injected_at,
            )
        )
        inject_values_into_ldx(ldx_path, session, injected_at)
        session.commit()

    root = ElementTree.Element("Workbook")
    layers = ElementTree.SubElement(root, "Layers")
    details = ElementTree.SubElement(layers, "Details")
    string_entry = ElementTree.SubElement(details, "String")
    string_entry.set("Id", "Rake Id")
    string_entry.set("Value", "WRONG")
    maths = ElementTree.SubElement(root, "Maths")
    maths.set("Id", "Local")
    maths.set("Flags", "1208")
    ElementTree.SubElement(maths, "MathConstants")
    ElementTree.ElementTree(root).write(ldx_path, encoding="utf-8", xml_declaration=True)

    with Session(test_engine) as session:
        summary = reinject_logged_values_into_ldx(
            ldx_path,
            session,
            injected_at + timedelta(minutes=1),
        )
        session.commit()

    assert summary.created == 1
    assert summary.updated == 1
    assert summary.unchanged == 0

    root = _parse_ldx(ldx_path)
    restored_string = root.find("./Layers/Details/String[@Id='Rake Id']")
    restored_math = root.find(
        "./Maths/MathConstants/MathConstant[@Name='Rear Element 2 Position']"
    )

    assert restored_string is not None
    assert restored_string.get("Value") == "R1"
    assert restored_math is not None
    assert restored_math.get("Value") == "10"

    with Session(test_engine) as session:
        logs = session.exec(select(InjectionLog)).all()

    assert len(logs) == 4
