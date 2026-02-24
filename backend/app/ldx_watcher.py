import asyncio
import os
import traceback
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional
from xml.etree import ElementTree

from sqlmodel import Session, select

from .database import engine
from .forms import FormField, load_forms
from .models import AuditLog, FormValue, InjectionLog, LdxFile, Setting, User


def _indent_xml(elem, level=0):
    """Add indentation to XML elements for readability."""
    indent = "\n" + " " * (level * 2)
    if len(elem):
        if not elem.text or not elem.text.strip():
            elem.text = indent + " "
        if not elem.tail or not elem.tail.strip():
            elem.tail = indent
        last_child = None
        for child in elem:
            _indent_xml(child, level + 1)
            last_child = child
        if last_child is not None and (
            not last_child.tail or not last_child.tail.strip()
        ):
            last_child.tail = indent
    else:
        if level and (not elem.tail or not elem.tail.strip()):
            elem.tail = indent


class LdxWatcher:
    def __init__(self, interval_seconds: int = 5):
        self.interval_seconds = interval_seconds
        self._task: Optional[asyncio.Task] = None

    def start(self) -> None:
        if self._task:
            return
        self._task = asyncio.create_task(self._run())

    def stop(self) -> None:
        if self._task:
            self._task.cancel()
            self._task = None

    async def _run(self) -> None:
        while True:
            try:
                await self._scan_once()
            except Exception as e:
                # Log errors but keep the watcher alive
                print(f"Error in LDX watcher scan: {e}")
                traceback.print_exc()
            await asyncio.sleep(self.interval_seconds)

    async def _scan_once(self) -> None:
        watch_dir = get_watch_directory()
        if not watch_dir:
            return
        directory = Path(watch_dir)
        if not directory.exists() or not directory.is_dir():
            return
        for path in directory.glob("*.ldx"):
            await self._process_file(path)

    async def _process_file(self, path: Path) -> None:
        try:
            path.stat()  # Check if file exists
        except OSError:
            # File might have been deleted
            return

        # Use absolute path for consistent comparison
        abs_path = str(path.resolve())

        try:
            with Session(engine) as session:
                record = session.exec(
                    select(LdxFile).where(LdxFile.path == abs_path)
                ).first()

                # If file was already processed, skip it
                if record:
                    return

                # This is a new file - record the detection time (current UTC time)
                # This represents when we first detected the file in the directory
                detection_time = datetime.now(timezone.utc)

                # Inject the most recent form values across all fields
                # Each new file gets the latest submission for each field
                inject_values_into_ldx(path, session, detection_time)

                # Record that we've processed this file
                # Store the detection time and current mtime for reference
                try:
                    file_mtime = path.stat().st_mtime
                except OSError:
                    # File might have been deleted during processing
                    return

                session.add(
                    LdxFile(
                        path=abs_path,
                        mtime=file_mtime,
                        processed_at=detection_time,
                    )
                )
                session.commit()
        except Exception as e:
            # Log the error but don't crash the watcher
            print(f"Error processing LDX file {path}: {e}")
            traceback.print_exc()


def get_watch_directory() -> Optional[str]:
    env_dir = os.getenv("LDX_WATCH_DIR")
    with Session(engine) as session:
        record = session.get(Setting, "watch_directory")
        if record and record.value:
            return record.value
    return env_dir


def set_watch_directory(value: str) -> None:
    with Session(engine) as session:
        record = session.get(Setting, "watch_directory")
        if record:
            record.value = value
        else:
            session.add(Setting(key="watch_directory", value=value))
        session.commit()


def _to_human(s: str) -> str:
    return s.replace("_", " ").strip().title()


def _build_form_name_to_role() -> Dict[str, str]:
    """Build a mapping from form_name to subteam role name."""
    mapping: Dict[str, str] = {}
    for form in load_forms():
        mapping[form.form_name] = form.role
    return mapping


def _build_field_lookup() -> Dict[str, FormField]:
    """Build a mapping from 'form_name.field_name' -> FormField schema."""
    lookup: Dict[str, FormField] = {}
    for form in load_forms():
        for field in form.fields:
            lookup[f"{form.form_name}.{field.name}"] = field
    return lookup


# Field types that go into Maths/MathConstants as MathConstant elements.
_MATH_TYPES = {"number"}


def inject_values_into_ldx(
    path: Path, session: Session, detection_time: datetime
) -> None:
    # Get all form values (we'll filter to latest per field)
    all_values = session.exec(select(FormValue)).all()

    print(f"Injecting values into {path.name}: found {len(all_values)} form values")

    # Get the latest value for each unique (form_name, field_name) pair
    latest_values: Dict[str, FormValue] = {}
    for value in all_values:
        key = f"{value.form_name}.{value.field_name}"
        current = latest_values.get(key)
        if not current or value.updated_at > current.updated_at:
            latest_values[key] = value

    print(f"Latest values to inject: {len(latest_values)} unique fields")

    if not latest_values:
        print(f"No form values found to inject into {path.name}")
        return

    # Build lookups
    form_name_to_role = _build_form_name_to_role()
    field_lookup = _build_field_lookup()

    tree = ElementTree.parse(path)
    root = tree.getroot()

    # ── Ensure both target sections exist ──

    # Layers/Details for String entries
    layers = root.find("Layers")
    if layers is None:
        layers = ElementTree.SubElement(root, "Layers")
    details = layers.find("Details")
    if details is None:
        details = ElementTree.SubElement(layers, "Details")

    # Maths/MathConstants for MathConstant entries
    maths = root.find("Maths")
    if maths is None:
        maths = ElementTree.SubElement(root, "Maths")
        maths.set("Id", "Local")
        maths.set("Flags", "1208")
    math_constants = maths.find("MathConstants")
    if math_constants is None:
        math_constants = ElementTree.SubElement(maths, "MathConstants")

    # Collect existing IDs in both sections
    existing_string_ids = set()
    for child in details.findall("String"):
        existing_string_ids.add(child.get("Id"))

    existing_math_names = set()
    for child in math_constants.findall("MathConstant"):
        existing_math_names.add(child.get("Name"))

    # Group values by their human-readable field name to detect collisions
    by_human_field: Dict[str, List[FormValue]] = {}
    for val in latest_values.values():
        human_field = _to_human(val.field_name)
        if human_field not in by_human_field:
            by_human_field[human_field] = []
        by_human_field[human_field].append(val)

    # Split into string values and math values, each with their final ID/Name
    # string_inject: {Id -> value}
    # math_inject:   {Name -> (value, unit)}
    string_inject: Dict[str, str] = {}
    math_inject: Dict[str, tuple] = {}

    for human_field, vals in by_human_field.items():
        # Detect collision across all existing IDs in both sections
        has_conflict = (
            len(vals) > 1
            or human_field in existing_string_ids
            or human_field in existing_math_names
        )

        for val in vals:
            lookup_key = f"{val.form_name}.{val.field_name}"
            schema_field = field_lookup.get(lookup_key)
            field_type = schema_field.type if schema_field else "text"
            field_unit = (schema_field.unit or "") if schema_field else ""

            # --- Validity window check: skip stale values ---
            if schema_field and schema_field.validity_window is not None:
                age = (detection_time - val.updated_at).total_seconds()
                if age > schema_field.validity_window:
                    print(
                        f"Skipping {val.field_name}: value is {age:.0f}s old "
                        f"(window: {schema_field.validity_window}s)"
                    )
                    continue

            # --- Lookback: use previous submission value ---
            inject_value = val.value
            if schema_field and schema_field.lookback:
                prev_logs = session.exec(
                    select(AuditLog)
                    .where(
                        AuditLog.form_name == val.form_name,
                        AuditLog.field_name == val.field_name,
                    )
                    .order_by(AuditLog.changed_at.desc())
                ).all()
                if len(prev_logs) >= 2:
                    inject_value = prev_logs[1].new_value or ""
                else:
                    print(
                        f"Skipping {val.field_name}: lookback field with no previous value"
                    )
                    continue

            # Determine the final ID/Name
            if val.field_name == "notes":
                role = form_name_to_role.get(val.form_name, val.form_name)
                final_id = f"{role}.notes"
            elif has_conflict:
                final_id = f"{_to_human(val.form_name)} {human_field}"
            else:
                final_id = human_field

            if field_type in _MATH_TYPES:
                math_inject[final_id] = (inject_value, field_unit)
            else:
                string_inject[final_id] = inject_value

    abs_path = str(path.resolve())

    # ── Inject String entries into Layers/Details ──
    handled_string_ids = set()
    for child in details.findall("String"):
        id_attr = child.get("Id")
        if id_attr in string_inject:
            old_val = child.get("Value", "")
            new_val = string_inject[id_attr]
            was_update = old_val != new_val
            child.set("Value", new_val)
            handled_string_ids.add(id_attr)
            session.add(
                InjectionLog(
                    ldx_path=abs_path,
                    field_id=id_attr,
                    value=new_val,
                    was_update=was_update,
                    injected_at=detection_time,
                )
            )

    for id_attr, value_str in string_inject.items():
        if id_attr not in handled_string_ids:
            entry = ElementTree.SubElement(details, "String")
            entry.set("Id", id_attr)
            entry.set("Value", value_str)
            session.add(
                InjectionLog(
                    ldx_path=abs_path,
                    field_id=id_attr,
                    value=value_str,
                    was_update=False,
                    injected_at=detection_time,
                )
            )

    # ── Inject MathConstant entries into Maths/MathConstants ──
    handled_math_names = set()
    for child in math_constants.findall("MathConstant"):
        name_attr = child.get("Name")
        if name_attr in math_inject:
            old_val = child.get("Value", "")
            new_val, unit = math_inject[name_attr]
            was_update = old_val != new_val
            child.set("Value", new_val)
            child.set("Unit", unit)
            handled_math_names.add(name_attr)
            session.add(
                InjectionLog(
                    ldx_path=abs_path,
                    field_id=name_attr,
                    value=new_val,
                    was_update=was_update,
                    injected_at=detection_time,
                )
            )

    for name_attr, (value_str, unit) in math_inject.items():
        if name_attr not in handled_math_names:
            entry = ElementTree.SubElement(math_constants, "MathConstant")
            entry.set("Name", name_attr)
            entry.set("Value", value_str)
            entry.set("Unit", unit)
            session.add(
                InjectionLog(
                    ldx_path=abs_path,
                    field_id=name_attr,
                    value=value_str,
                    was_update=False,
                    injected_at=detection_time,
                )
            )

    # Format XML with proper indentation
    try:
        ElementTree.indent(root, space=" ", level=0)
    except AttributeError:
        _indent_xml(root)

    tree.write(path, encoding="utf-8", xml_declaration=True)
