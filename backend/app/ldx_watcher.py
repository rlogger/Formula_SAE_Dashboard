import asyncio
import logging
import os
import tempfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple
from xml.etree import ElementTree

from sqlalchemy import and_, or_
from sqlmodel import Session, select

from .database import engine
from .forms import FormField, load_forms
from .models import AuditLog, FormValue, InjectionLog, LdxFile, LdxFieldMeta, Setting

logger = logging.getLogger(__name__)

_STRING_ENTRY_TYPE = "string"
_MATH_ENTRY_TYPE = "math"


@dataclass(frozen=True)
class InjectionEntry:
    field_id: str
    value: str
    entry_type: str
    unit: str = ""
    form_name: str = ""


@dataclass(frozen=True)
class ApplySummary:
    created: int = 0
    updated: int = 0
    unchanged: int = 0
    short_comment: Optional[str] = None

    @property
    def changed_count(self) -> int:
        return self.created + self.updated

    @property
    def total(self) -> int:
        return self.created + self.updated + self.unchanged


class LdxWatcher:
    def __init__(self, interval_seconds: int = 5, verify_interval_seconds: int = 60):
        self.interval_seconds = interval_seconds
        self.verify_interval_seconds = verify_interval_seconds
        self._scan_task: Optional[asyncio.Task] = None
        self._verify_task: Optional[asyncio.Task] = None

    def start(self) -> None:
        if not self._scan_task:
            self._scan_task = asyncio.create_task(self._run_scan_loop())
        if not self._verify_task:
            self._verify_task = asyncio.create_task(self._run_verify_loop())

    def stop(self) -> None:
        if self._scan_task:
            self._scan_task.cancel()
            self._scan_task = None
        if self._verify_task:
            self._verify_task.cancel()
            self._verify_task = None

    async def _run_scan_loop(self) -> None:
        while True:
            try:
                await self._scan_once()
            except Exception as exc:
                logger.error("Error in LDX watcher scan: %s", exc, exc_info=True)
            await asyncio.sleep(self.interval_seconds)

    async def _run_verify_loop(self) -> None:
        while True:
            try:
                await self._verify_once()
            except Exception as exc:
                logger.error("Error in LDX verification scan: %s", exc, exc_info=True)
            await asyncio.sleep(self.verify_interval_seconds)

    async def _scan_once(self) -> None:
        directory = _get_watch_path()
        if directory is None:
            return
        for path in directory.glob("*.ldx"):
            await self._process_file(path)

    async def _verify_once(self) -> None:
        directory = _get_watch_path()
        if directory is None:
            return

        with Session(engine) as session:
            tracked_paths = [record.path for record in session.exec(select(LdxFile)).all()]

        for raw_path in tracked_paths:
            path = Path(raw_path)
            try:
                resolved = path.resolve()
            except OSError:
                continue
            if resolved.parent != directory:
                continue
            if not resolved.exists() or not resolved.is_file():
                continue

            try:
                with Session(engine) as session:
                    record = session.exec(
                        select(LdxFile).where(LdxFile.path == str(resolved))
                    ).first()
                    if record is None:
                        continue
                    summary = reinject_logged_values_into_ldx(
                        resolved,
                        session,
                        datetime.now(timezone.utc),
                    )
                    if summary.changed_count > 0:
                        try:
                            record.mtime = resolved.stat().st_mtime
                        except OSError:
                            pass
                        session.add(record)
                        session.commit()
                        logger.info(
                            "Restored %d injected values in %s",
                            summary.changed_count,
                            resolved.name,
                        )
            except Exception as exc:
                logger.error(
                    "Error verifying LDX file %s: %s", resolved, exc, exc_info=True
                )

    async def _process_file(self, path: Path) -> None:
        try:
            path.stat()
        except OSError:
            return

        abs_path = str(path.resolve())

        try:
            with Session(engine) as session:
                record = session.exec(
                    select(LdxFile).where(LdxFile.path == abs_path)
                ).first()
                if record:
                    return

                detection_time = datetime.now(timezone.utc)
                summary = inject_values_into_ldx(path, session, detection_time)

                try:
                    file_mtime = path.stat().st_mtime
                except OSError:
                    return

                session.add(
                    LdxFile(
                        path=abs_path,
                        mtime=file_mtime,
                        processed_at=detection_time,
                        short_comment=summary.short_comment,
                    )
                )
                session.commit()
                if summary.total > 0:
                    logger.info(
                        "Processed %s with %d injected values",
                        path.name,
                        summary.total,
                    )
        except Exception as exc:
            logger.error("Error processing LDX file %s: %s", path, exc, exc_info=True)


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


def _get_watch_path() -> Optional[Path]:
    watch_dir = get_watch_directory()
    if not watch_dir:
        return None
    directory = Path(watch_dir)
    if not directory.exists() or not directory.is_dir():
        return None
    try:
        return directory.resolve()
    except OSError:
        return None


def _ensure_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _to_human(s: str) -> str:
    return s.replace("_", " ").strip().title()


def _build_lookup_tables() -> Tuple[Dict[str, str], Dict[str, FormField]]:
    """Build form_name→role and (form.field)→FormField lookups in a single load_forms() call."""
    form_name_to_role: Dict[str, str] = {}
    field_lookup: Dict[str, FormField] = {}
    for form in load_forms():
        form_name_to_role[form.form_name] = form.role
        for field in form.fields:
            field_lookup[f"{form.form_name}.{field.name}"] = field
    return form_name_to_role, field_lookup


def _build_logged_entry_metadata_lookup() -> Dict[str, Tuple[str, str]]:
    lookup: Dict[str, Tuple[str, str]] = {}
    for form in load_forms():
        for field in form.fields:
            entry_type = _MATH_ENTRY_TYPE if field.type in _MATH_TYPES else _STRING_ENTRY_TYPE
            unit = field.unit or ""
            human_field = _to_human(field.name)

            candidates = [f"{_to_human(form.form_name)} {human_field}", human_field]
            if field.name == "notes":
                candidates = [f"{form.role}.notes"]

            for candidate in candidates:
                lookup.setdefault(candidate, (entry_type, unit))
    return lookup


def _ensure_ldx_targets(
    root: ElementTree.Element,
) -> Tuple[ElementTree.Element, ElementTree.Element]:
    layers = root.find("Layers")
    if layers is None:
        layers = ElementTree.SubElement(root, "Layers")

    details = layers.find("Details")
    if details is None:
        details = ElementTree.SubElement(layers, "Details")

    maths = root.find("Maths")
    if maths is None:
        maths = ElementTree.SubElement(root, "Maths")
        maths.set("Id", "Local")
        maths.set("Flags", "1208")

    math_constants = maths.find("MathConstants")
    if math_constants is None:
        math_constants = ElementTree.SubElement(maths, "MathConstants")

    return details, math_constants


def _string_entries_by_id(
    details: ElementTree.Element,
) -> Dict[str, ElementTree.Element]:
    return {
        child.get("Id"): child
        for child in details.findall("String")
        if child.get("Id")
    }


def _math_entries_by_name(
    math_constants: ElementTree.Element,
) -> Dict[str, ElementTree.Element]:
    return {
        child.get("Name"): child
        for child in math_constants.findall("MathConstant")
        if child.get("Name")
    }


def _extract_field_metadata(
    math_constants: ElementTree.Element,
    path: Path,
    session: Session,
    extracted_at: datetime,
) -> None:
    """Extract Value.Min, Value.Max, Comment from MathConstants and store as LdxFieldMeta."""
    abs_path = str(path.resolve())
    # Clear previous metadata for this file
    existing = session.exec(
        select(LdxFieldMeta).where(LdxFieldMeta.ldx_path == abs_path)
    ).all()
    for row in existing:
        session.delete(row)

    for child in math_constants.findall("MathConstant"):
        name = child.get("Name")
        if not name:
            continue
        value_min = child.get("Value.Min")
        value_max = child.get("Value.Max")
        comment = child.get("Comment")
        if value_min is not None or value_max is not None or comment is not None:
            session.add(
                LdxFieldMeta(
                    ldx_path=abs_path,
                    field_id=name,
                    value_min=value_min,
                    value_max=value_max,
                    comment=comment,
                    extracted_at=extracted_at,
                )
            )


def _extract_short_comment(
    details: ElementTree.Element,
) -> Optional[str]:
    """Extract Short Comment from LDX Details section."""
    for child in details.findall("String"):
        if child.get("Id") == "Short Comment":
            return child.get("Value")
    return None


def _append_injection_log(
    session: Session,
    path: Path,
    entry: InjectionEntry,
    injected_at: datetime,
    was_update: bool,
) -> None:
    session.add(
        InjectionLog(
            ldx_path=str(path.resolve()),
            field_id=entry.field_id,
            value=entry.value,
            entry_type=entry.entry_type,
            unit=entry.unit or None,
            was_update=was_update,
            injected_at=injected_at,
            form_name=entry.form_name or None,
        )
    )


def _write_ldx_tree(tree: ElementTree.ElementTree, root: ElementTree.Element, path: Path) -> None:
    ElementTree.indent(root, space=" ", level=0)

    dir_path = path.parent
    fd, tmp_path = tempfile.mkstemp(dir=str(dir_path), suffix=".tmp")
    try:
        os.close(fd)
        tree.write(tmp_path, encoding="utf-8", xml_declaration=True)
        # Preserve original file permissions; default to 0o644 if file is new
        try:
            st = os.stat(str(path))
            os.chmod(tmp_path, st.st_mode)
        except OSError:
            os.chmod(tmp_path, 0o644)
        os.replace(tmp_path, str(path))
    except Exception:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise


def _apply_injection_entries_to_tree(
    path: Path,
    tree: ElementTree.ElementTree,
    root: ElementTree.Element,
    details: ElementTree.Element,
    math_constants: ElementTree.Element,
    session: Session,
    entries: Sequence[InjectionEntry],
    injected_at: datetime,
    log_when_unchanged: bool,
) -> ApplySummary:
    string_entries = _string_entries_by_id(details)
    math_entries = _math_entries_by_name(math_constants)

    created = 0
    updated = 0
    unchanged = 0
    modified = False

    for entry in entries:
        if entry.entry_type == _MATH_ENTRY_TYPE:
            child = math_entries.get(entry.field_id)
            if child is None:
                child = ElementTree.SubElement(math_constants, "MathConstant")
                child.set("Name", entry.field_id)
                child.set("Value", entry.value)
                child.set("Unit", entry.unit)
                math_entries[entry.field_id] = child
                created += 1
                modified = True
                _append_injection_log(session, path, entry, injected_at, was_update=False)
                continue

            old_value = child.get("Value", "")
            old_unit = child.get("Unit", "")
            if old_value != entry.value or old_unit != entry.unit:
                child.set("Value", entry.value)
                child.set("Unit", entry.unit)
                updated += 1
                modified = True
                _append_injection_log(session, path, entry, injected_at, was_update=True)
            else:
                unchanged += 1
                if log_when_unchanged:
                    _append_injection_log(
                        session, path, entry, injected_at, was_update=False
                    )
            continue

        child = string_entries.get(entry.field_id)
        if child is None:
            child = ElementTree.SubElement(details, "String")
            child.set("Id", entry.field_id)
            child.set("Value", entry.value)
            string_entries[entry.field_id] = child
            created += 1
            modified = True
            _append_injection_log(session, path, entry, injected_at, was_update=False)
            continue

        old_value = child.get("Value", "")
        if old_value != entry.value:
            child.set("Value", entry.value)
            updated += 1
            modified = True
            _append_injection_log(session, path, entry, injected_at, was_update=True)
        else:
            unchanged += 1
            if log_when_unchanged:
                _append_injection_log(session, path, entry, injected_at, was_update=False)

    if modified:
        _write_ldx_tree(tree, root, path)

    short_comment = _extract_short_comment(details)
    return ApplySummary(created=created, updated=updated, unchanged=unchanged, short_comment=short_comment)


# Field types that go into Maths/MathConstants as MathConstant elements.
_MATH_TYPES = {"number"}


def inject_values_into_ldx(
    path: Path, session: Session, detection_time: datetime
) -> ApplySummary:
    all_values = session.exec(select(FormValue)).all()

    logger.info(
        "Injecting values into %s: found %d form values", path.name, len(all_values)
    )

    # Deduplicate to latest value per (form_name, field_name) in Python
    latest_values: Dict[str, FormValue] = {}
    for value in all_values:
        key = f"{value.form_name}.{value.field_name}"
        current = latest_values.get(key)
        if not current or value.updated_at > current.updated_at:
            latest_values[key] = value

    logger.info("Latest values to inject: %d unique fields", len(latest_values))

    if not latest_values:
        logger.info("No form values found to inject into %s", path.name)
        return ApplySummary()

    # Single load_forms() call builds both lookups
    form_name_to_role, field_lookup = _build_lookup_tables()

    tree = ElementTree.parse(path)
    root = tree.getroot()
    details, math_constants = _ensure_ldx_targets(root)

    # Extract metadata from LDX (Value.Min, Value.Max, Comment, Short Comment)
    _extract_field_metadata(math_constants, path, session, detection_time)

    existing_string_ids = set(_string_entries_by_id(details))
    existing_math_names = set(_math_entries_by_name(math_constants))

    # Pre-identify lookback fields so we can batch their DB queries
    lookback_keys: set = set()
    for fv in latest_values.values():
        sf = field_lookup.get(f"{fv.form_name}.{fv.field_name}")
        if sf and sf.lookback:
            lookback_keys.add((fv.form_name, fv.field_name))

    # Query last run once; batch all AuditLog lookback lookups into a single query
    lookback_values: Dict[Tuple[str, str], Optional[str]] = {}
    last_run = None
    if lookback_keys:
        last_run = session.exec(
            select(LdxFile)
            .where(LdxFile.processed_at < detection_time)
            .order_by(LdxFile.processed_at.desc())
            .limit(1)
        ).first()

        if last_run:
            last_run_time = _ensure_utc(last_run.processed_at)
            conditions = [
                and_(AuditLog.form_name == fn, AuditLog.field_name == fld)
                for fn, fld in lookback_keys
            ]
            all_audits = session.exec(
                select(AuditLog)
                .where(or_(*conditions))
                .where(AuditLog.changed_at <= last_run_time)
                .order_by(AuditLog.changed_at.desc())
            ).all()
            # First occurrence per key is the most recent (ordered DESC)
            for audit in all_audits:
                key = (audit.form_name, audit.field_name)
                if key not in lookback_values:
                    lookback_values[key] = audit.new_value

    by_human_field: Dict[str, List[FormValue]] = {}
    for value in latest_values.values():
        human_field = _to_human(value.field_name)
        by_human_field.setdefault(human_field, []).append(value)

    entries: List[InjectionEntry] = []

    for human_field, values in by_human_field.items():
        has_conflict = (
            len(values) > 1
            or human_field in existing_string_ids
            or human_field in existing_math_names
        )

        for value in values:
            lookup_key = f"{value.form_name}.{value.field_name}"
            schema_field = field_lookup.get(lookup_key)
            field_type = schema_field.type if schema_field else "text"
            field_unit = (schema_field.unit or "") if schema_field else ""

            if schema_field and schema_field.validity_window is not None:
                age = (detection_time - _ensure_utc(value.updated_at)).total_seconds()
                if age > schema_field.validity_window:
                    logger.debug(
                        "Skipping %s: value is %.0fs old (window: %ds)",
                        value.field_name,
                        age,
                        schema_field.validity_window,
                    )
                    continue

            inject_value = value.value
            if schema_field and schema_field.lookback:
                lb_key = (value.form_name, value.field_name)
                if last_run is None:
                    logger.debug(
                        "Skipping %s: lookback field with no previous run",
                        value.field_name,
                    )
                    continue
                if lb_key not in lookback_values:
                    logger.debug(
                        "Skipping %s: no value existed at previous run",
                        value.field_name,
                    )
                    continue
                inject_value = lookback_values[lb_key] or ""

            if value.field_name == "notes":
                role = form_name_to_role.get(value.form_name, value.form_name)
                final_id = f"{role}.notes"
            elif has_conflict:
                final_id = f"{_to_human(value.form_name)} {human_field}"
            else:
                final_id = human_field

            if field_type in _MATH_TYPES:
                entries.append(
                    InjectionEntry(
                        field_id=final_id,
                        value=inject_value,
                        entry_type=_MATH_ENTRY_TYPE,
                        unit=field_unit,
                        form_name=value.form_name,
                    )
                )
            else:
                entries.append(
                    InjectionEntry(
                        field_id=final_id,
                        value=inject_value,
                        entry_type=_STRING_ENTRY_TYPE,
                        form_name=value.form_name,
                    )
                )

    return _apply_injection_entries_to_tree(
        path=path,
        tree=tree,
        root=root,
        details=details,
        math_constants=math_constants,
        session=session,
        entries=entries,
        injected_at=detection_time,
        log_when_unchanged=True,
    )


def _infer_logged_entry_metadata(
    field_id: str,
    details: ElementTree.Element,
    math_constants: ElementTree.Element,
) -> Tuple[str, str]:
    string_entries = _string_entries_by_id(details)
    if field_id in string_entries:
        return _STRING_ENTRY_TYPE, ""

    math_entries = _math_entries_by_name(math_constants)
    if field_id in math_entries:
        return _MATH_ENTRY_TYPE, math_entries[field_id].get("Unit", "")

    return _build_logged_entry_metadata_lookup().get(field_id, (_STRING_ENTRY_TYPE, ""))


def _latest_logged_entries_for_file(
    session: Session,
    path: Path,
    details: ElementTree.Element,
    math_constants: ElementTree.Element,
) -> List[InjectionEntry]:
    logs = session.exec(
        select(InjectionLog)
        .where(InjectionLog.ldx_path == str(path.resolve()))
        .order_by(InjectionLog.injected_at.desc(), InjectionLog.id.desc())
    ).all()

    latest_entries: Dict[str, InjectionEntry] = {}
    for log in logs:
        if log.field_id in latest_entries:
            continue
        entry_type = log.entry_type
        unit = log.unit or ""
        if not entry_type:
            entry_type, inferred_unit = _infer_logged_entry_metadata(
                log.field_id,
                details,
                math_constants,
            )
            if not unit:
                unit = inferred_unit

        latest_entries[log.field_id] = InjectionEntry(
            field_id=log.field_id,
            value=log.value,
            entry_type=entry_type or _STRING_ENTRY_TYPE,
            unit=unit,
        )

    return list(latest_entries.values())


def compute_pending_injection_entries(session: Session) -> List[InjectionEntry]:
    """Return entries that would be injected into the next new LDX file.

    This is a dry run — no file is read or written. Lookback fields are excluded
    because they require a previous-run file context to resolve.
    """
    all_values = session.exec(select(FormValue)).all()
    if not all_values:
        return []

    latest_values: Dict[str, FormValue] = {}
    for value in all_values:
        key = f"{value.form_name}.{value.field_name}"
        current = latest_values.get(key)
        if not current or value.updated_at > current.updated_at:
            latest_values[key] = value

    form_name_to_role, field_lookup = _build_lookup_tables()
    now = datetime.now(timezone.utc)

    by_human_field: Dict[str, List[FormValue]] = {}
    for value in latest_values.values():
        human_field = _to_human(value.field_name)
        by_human_field.setdefault(human_field, []).append(value)

    entries: List[InjectionEntry] = []

    for human_field, values in by_human_field.items():
        has_conflict = len(values) > 1

        for value in values:
            lookup_key = f"{value.form_name}.{value.field_name}"
            schema_field = field_lookup.get(lookup_key)
            field_type = schema_field.type if schema_field else "text"
            field_unit = (schema_field.unit or "") if schema_field else ""

            if schema_field and schema_field.validity_window is not None:
                age = (now - _ensure_utc(value.updated_at)).total_seconds()
                if age > schema_field.validity_window:
                    continue

            if schema_field and schema_field.lookback:
                continue

            if value.field_name == "notes":
                role = form_name_to_role.get(value.form_name, value.form_name)
                final_id = f"{role}.notes"
            elif has_conflict:
                final_id = f"{_to_human(value.form_name)} {human_field}"
            else:
                final_id = human_field

            entry_type = _MATH_ENTRY_TYPE if field_type in _MATH_TYPES else _STRING_ENTRY_TYPE
            entries.append(
                InjectionEntry(
                    field_id=final_id,
                    value=value.value,
                    entry_type=entry_type,
                    unit=field_unit,
                    form_name=value.form_name,
                )
            )

    return entries


def reinject_logged_values_into_ldx(
    path: Path,
    session: Session,
    injected_at: datetime,
) -> ApplySummary:
    tree = ElementTree.parse(path)
    root = tree.getroot()
    details, math_constants = _ensure_ldx_targets(root)
    entries = _latest_logged_entries_for_file(session, path, details, math_constants)
    if not entries:
        return ApplySummary()

    return _apply_injection_entries_to_tree(
        path=path,
        tree=tree,
        root=root,
        details=details,
        math_constants=math_constants,
        session=session,
        entries=entries,
        injected_at=injected_at,
        log_when_unchanged=False,
    )
