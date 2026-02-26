import json
import logging
import os
import re
import shutil
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

from fastapi import Depends, FastAPI, HTTPException, Query, Request, WebSocket, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, field_validator
from sqlmodel import Session, col, delete, func, select

from .auth import (
    MIN_PASSWORD_LENGTH,
    create_access_token,
    ensure_default_admin,
    ensure_roles,
    get_current_user,
    get_password_hash,
    require_admin,
    verify_password,
)
from .database import DATA_DIR, engine, init_db
from .forms import FormSchema, get_form_by_role, list_roles, load_forms
from .ldx_watcher import LdxWatcher, get_watch_directory, set_watch_directory
from .models import (
    AuditLog, DashboardPreference, FormValue, InjectionLog, LdxFile,
    Role, SubteamRole, TelemetrySensor, User,
)
from .serial_telemetry import SerialFormat
from .telemetry import TelemetryChannelInfo, ensure_default_sensors, get_channels, source_manager, telemetry_websocket

logger = logging.getLogger(__name__)

# --- Constants ---
MAX_USERNAME_LENGTH = 64
MAX_PASSWORD_LENGTH = 128
MAX_FIELD_VALUE_LENGTH = 10_000
MAX_SENSOR_ID_LENGTH = 64
MAX_SENSOR_NAME_LENGTH = 128
MAX_SENSOR_UNIT_LENGTH = 32
MAX_SENSOR_GROUP_LENGTH = 64
MAX_DASHBOARD_CONFIG_LENGTH = 100_000  # 100KB
MAX_FORM_VALUES_PER_SUBMIT = 200

watcher = LdxWatcher()


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    with Session(engine) as session:
        ensure_roles(session)
        ensure_default_admin(session)
        ensure_default_sensors(session)
    watcher.start()
    await source_manager.start()
    yield
    await source_manager.stop()
    watcher.stop()


app = FastAPI(title="SCR Form Manager", lifespan=lifespan)

# CORS configuration - use ALLOWED_ORIGINS env var in production
allowed_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:8080,http://localhost:5173,http://localhost:3000")
origins_list = [origin.strip() for origin in allowed_origins.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)


# --- Global exception handler ---
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.error("Unhandled error on %s %s: %s", request.method, request.url.path, exc, exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "An internal server error occurred. Please try again later."},
    )


# --- Pydantic schemas with validation ---

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


_USERNAME_PATTERN = re.compile(r"^[a-zA-Z0-9_.\-]+$")


class UserCreate(BaseModel):
    username: str
    password: str
    roles: List[str] = []
    is_admin: bool = False

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Username is required")
        if len(v) > MAX_USERNAME_LENGTH:
            raise ValueError(f"Username must be at most {MAX_USERNAME_LENGTH} characters")
        if not _USERNAME_PATTERN.match(v):
            raise ValueError("Username may only contain letters, numbers, underscores, dots, and hyphens")
        return v

    @field_validator("password")
    @classmethod
    def validate_password_length(cls, v: str) -> str:
        if len(v) > MAX_PASSWORD_LENGTH:
            raise ValueError(f"Password must be at most {MAX_PASSWORD_LENGTH} characters")
        return v

    @field_validator("roles")
    @classmethod
    def validate_roles_count(cls, v: List[str]) -> List[str]:
        if len(v) > 2:
            raise ValueError("A user can have at most 2 roles")
        return v


class UserView(BaseModel):
    id: int
    username: str
    roles: List[str]
    is_admin: bool


class PasswordUpdate(BaseModel):
    password: str

    @field_validator("password")
    @classmethod
    def validate_password_length(cls, v: str) -> str:
        if len(v) > MAX_PASSWORD_LENGTH:
            raise ValueError(f"Password must be at most {MAX_PASSWORD_LENGTH} characters")
        return v


class RolesUpdate(BaseModel):
    roles: List[str]

    @field_validator("roles")
    @classmethod
    def validate_roles_count(cls, v: List[str]) -> List[str]:
        if len(v) > 2:
            raise ValueError("A user can have at most 2 roles")
        return v


class FormValuesResponse(BaseModel):
    values: Dict[str, Optional[str]]
    timestamps: Dict[str, float] = {}
    previous_values: Dict[str, Optional[str]] = {}


class FormSubmit(BaseModel):
    values: Dict[str, Optional[str]]

    @field_validator("values")
    @classmethod
    def validate_values(cls, v: Dict[str, Optional[str]]) -> Dict[str, Optional[str]]:
        if len(v) > MAX_FORM_VALUES_PER_SUBMIT:
            raise ValueError(f"Too many fields submitted (max {MAX_FORM_VALUES_PER_SUBMIT})")
        for key, val in v.items():
            if val is not None and len(val) > MAX_FIELD_VALUE_LENGTH:
                raise ValueError(f"Value for '{key}' exceeds maximum length of {MAX_FIELD_VALUE_LENGTH} characters")
        return v


class AuditLogView(BaseModel):
    id: int
    form_name: str
    field_name: str
    old_value: Optional[str]
    new_value: Optional[str]
    changed_at: datetime
    changed_by: Optional[int]
    changed_by_name: Optional[str]


class LdxFileInfo(BaseModel):
    name: str
    size: int
    modified_at: datetime


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


def _user_to_view(user: User) -> UserView:
    return UserView(
        id=user.id,
        username=user.username,
        roles=[role.name for role in user.roles],
        is_admin=user.is_admin,
    )


def _validate_roles(roles: List[str]) -> List[str]:
    available = {role.value for role in SubteamRole}
    if any(role not in available for role in roles):
        raise HTTPException(status_code=400, detail="Invalid role")
    if len(roles) > 2:
        raise HTTPException(status_code=400, detail="Max two roles allowed")
    return roles


def _validate_password(password: str) -> None:
    if not password or not password.strip():
        raise HTTPException(status_code=400, detail="Password is required")
    if len(password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Password must be at least {MIN_PASSWORD_LENGTH} characters"
        )
    if len(password) > MAX_PASSWORD_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Password must be at most {MAX_PASSWORD_LENGTH} characters"
        )
    if password.isdigit():
        raise HTTPException(
            status_code=400,
            detail="Password cannot be all numbers"
        )
    if password.isalpha():
        raise HTTPException(
            status_code=400,
            detail="Password must contain at least one number or special character"
        )
    if len(set(password)) < 3:
        raise HTTPException(
            status_code=400,
            detail="Password must contain at least 3 distinct characters"
        )


def _ensure_access(role: str, user: User) -> None:
    if user.is_admin:
        return
    if role not in [r.name for r in user.roles]:
        raise HTTPException(status_code=403, detail="Access denied for this form")


@app.post("/auth/login", response_model=TokenResponse)
def login(form_data: OAuth2PasswordRequestForm = Depends()) -> TokenResponse:
    username = form_data.username.strip()
    if not username:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Username is required"
        )
    if not form_data.password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Password is required"
        )
    if len(username) > MAX_USERNAME_LENGTH:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Username must be at most {MAX_USERNAME_LENGTH} characters",
        )
    with Session(engine) as session:
        user = session.exec(select(User).where(User.username == username)).first()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Account not found"
            )
        if not verify_password(form_data.password, user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect password"
            )
        token = create_access_token(user.username)
        return TokenResponse(access_token=token)


@app.get("/auth/me", response_model=UserView)
def me(current_user: User = Depends(get_current_user)) -> UserView:
    return _user_to_view(current_user)


@app.get("/admin/users", response_model=List[UserView])
def list_users(_: User = Depends(require_admin)) -> List[UserView]:
    with Session(engine) as session:
        users = session.exec(select(User)).all()
        return [_user_to_view(user) for user in users]


@app.post("/admin/users", response_model=UserView)
def create_user(payload: UserCreate, _: User = Depends(require_admin)) -> UserView:
    _validate_password(payload.password)
    roles = _validate_roles(payload.roles)
    if payload.is_admin and roles:
        raise HTTPException(status_code=400, detail="Admin cannot have subteam roles")
    if not payload.is_admin and not roles:
        raise HTTPException(status_code=400, detail="At least one role is required for non-admin users")
    with Session(engine) as session:
        existing = session.exec(select(User).where(User.username == payload.username)).first()
        if existing:
            raise HTTPException(status_code=409, detail=f"Username '{payload.username}' already exists")
        user = User(
            username=payload.username,
            hashed_password=get_password_hash(payload.password),
            is_admin=payload.is_admin,
        )
        if roles:
            db_roles = session.exec(select(Role).where(Role.name.in_(roles))).all()
            if len(db_roles) != len(roles):
                found = {r.name for r in db_roles}
                missing = [r for r in roles if r not in found]
                raise HTTPException(status_code=400, detail=f"Unknown roles: {', '.join(missing)}")
            user.roles = db_roles
        session.add(user)
        session.commit()
        session.refresh(user)
        logger.info("User created: %s (admin=%s)", payload.username, payload.is_admin)
        return _user_to_view(user)


@app.delete("/admin/users/{user_id}")
def delete_user(user_id: int, current_admin: User = Depends(require_admin)) -> Dict[str, str]:
    if user_id == current_admin.id:
        raise HTTPException(status_code=400, detail="You cannot delete your own account")
    with Session(engine) as session:
        user = session.get(User, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        logger.info("User deleted: %s (id=%d) by admin %s", user.username, user_id, current_admin.username)
        session.delete(user)
        session.commit()
    return {"status": "deleted"}


@app.put("/admin/users/{user_id}/password")
def update_password(
    user_id: int, payload: PasswordUpdate, _: User = Depends(require_admin)
) -> Dict[str, str]:
    _validate_password(payload.password)
    with Session(engine) as session:
        user = session.get(User, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        user.hashed_password = get_password_hash(payload.password)
        session.add(user)
        session.commit()
    return {"status": "updated"}


@app.put("/admin/users/{user_id}/roles", response_model=UserView)
def update_roles(
    user_id: int, payload: RolesUpdate, _: User = Depends(require_admin)
) -> UserView:
    roles = _validate_roles(payload.roles)
    with Session(engine) as session:
        user = session.get(User, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        if user.is_admin and roles:
            raise HTTPException(status_code=400, detail="Admin cannot have subteam roles")
        if not user.is_admin and not roles:
            raise HTTPException(status_code=400, detail="At least one role is required")
        db_roles = session.exec(select(Role).where(Role.name.in_(roles))).all()
        user.roles = db_roles
        session.add(user)
        session.commit()
        session.refresh(user)
        return _user_to_view(user)


@app.get("/forms", response_model=List[FormSchema])
def list_forms(current_user: User = Depends(get_current_user)) -> List[FormSchema]:
    forms = load_forms()
    if current_user.is_admin:
        return forms
    allowed = {role.name for role in current_user.roles}
    return [form for form in forms if form.role in allowed]


@app.get("/forms/{role}", response_model=FormSchema)
def get_form(role: str, current_user: User = Depends(get_current_user)) -> FormSchema:
    _ensure_access(role, current_user)
    form = get_form_by_role(role)
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")
    return form


@app.get("/forms/{role}/values", response_model=FormValuesResponse)
def get_form_values(role: str, current_user: User = Depends(get_current_user)) -> FormValuesResponse:
    _ensure_access(role, current_user)
    form = get_form_by_role(role)
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")

    lookback_fields = {f.name for f in form.fields if f.lookback}

    with Session(engine) as session:
        values = session.exec(
            select(FormValue).where(FormValue.form_name == form.form_name)
        ).all()
        value_map = {v.field_name: v.value for v in values}
        ts_map = {v.field_name: v.updated_at.timestamp() for v in values}

        prev_map: Dict[str, Optional[str]] = {}
        if lookback_fields:
            # Find the most recent processed run
            last_run = session.exec(
                select(LdxFile)
                .order_by(LdxFile.processed_at.desc())
                .limit(1)
            ).first()
            last_run_time = last_run.processed_at if last_run else None
            # SQLite drops tzinfo — treat as UTC
            if last_run_time and last_run_time.tzinfo is None:
                last_run_time = last_run_time.replace(tzinfo=timezone.utc)

            for field_name in lookback_fields:
                if not last_run_time:
                    prev_map[field_name] = None
                    continue
                # Value at the time of the last run
                prev_audit = session.exec(
                    select(AuditLog)
                    .where(
                        AuditLog.form_name == form.form_name,
                        AuditLog.field_name == field_name,
                        AuditLog.changed_at <= last_run_time,
                    )
                    .order_by(AuditLog.changed_at.desc())
                    .limit(1)
                ).first()
                prev_map[field_name] = prev_audit.new_value if prev_audit else None

        return FormValuesResponse(
            values=value_map,
            timestamps=ts_map,
            previous_values=prev_map,
        )


def _validate_field_value(field_schema: "FormField", value: Optional[str]) -> List[str]:
    """Validate a single field value against its schema. Returns list of error messages."""
    from .forms import FormField as FormFieldModel
    errors: List[str] = []
    if value is None or value == "":
        if field_schema.required:
            errors.append(f"'{field_schema.label}' is required")
        return errors

    if field_schema.type == "number":
        try:
            float(value)
        except (ValueError, TypeError):
            errors.append(f"'{field_schema.label}' must be a valid number")
    elif field_schema.type == "select" and field_schema.options:
        if value not in field_schema.options:
            errors.append(f"'{field_schema.label}' must be one of: {', '.join(field_schema.options)}")
    return errors


@app.post("/forms/{role}/submit")
def submit_form(role: str, payload: FormSubmit, current_user: User = Depends(get_current_user)) -> Dict[str, str]:
    _ensure_access(role, current_user)
    form = get_form_by_role(role)
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")

    field_map = {field.name: field for field in form.fields}
    validation_errors: List[str] = []

    for name in payload.values.keys():
        if name not in field_map:
            raise HTTPException(status_code=400, detail=f"Unknown field: '{name}'")

    # Validate all submitted values against their field schemas
    for name, value in payload.values.items():
        field_schema = field_map[name]
        validation_errors.extend(_validate_field_value(field_schema, value))

    # Check required fields that weren't submitted
    for field in form.fields:
        if field.required and field.name not in payload.values:
            # Only warn if field has no existing value
            pass  # Allow partial saves — don't block on missing fields

    if validation_errors:
        raise HTTPException(status_code=422, detail="; ".join(validation_errors))

    with Session(engine) as session:
        now = datetime.now(timezone.utc)
        for field_name, new_value in payload.values.items():
            current = session.exec(
                select(FormValue).where(
                    FormValue.form_name == form.form_name,
                    FormValue.field_name == field_name,
                )
            ).first()
            new_value_str = "" if new_value is None else str(new_value)
            old_value = current.value if current else None
            if current:
                current.value = new_value_str
                current.updated_at = now
                current.updated_by = current_user.id
            else:
                session.add(
                    FormValue(
                        form_name=form.form_name,
                        field_name=field_name,
                        value=new_value_str,
                        updated_at=now,
                        updated_by=current_user.id,
                    )
                )
            if old_value != new_value_str:
                session.add(
                    AuditLog(
                        form_name=form.form_name,
                        field_name=field_name,
                        old_value=old_value,
                        new_value=new_value_str,
                        changed_at=now,
                        changed_by=current_user.id,
                    )
                )
        session.commit()
    return {"status": "saved"}


class PaginatedAuditLogResponse(BaseModel):
    items: List[AuditLogView]
    total: int


@app.get("/admin/audit", response_model=PaginatedAuditLogResponse)
def audit_log(
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    _: User = Depends(require_admin),
) -> PaginatedAuditLogResponse:
    with Session(engine) as session:
        users = {user.id: user.username for user in session.exec(select(User)).all()}
        total = session.exec(
            select(func.count()).select_from(AuditLog)
        ).one()
        logs = session.exec(
            select(AuditLog)
            .order_by(AuditLog.changed_at.desc())
            .offset(offset)
            .limit(limit)
        ).all()
        items = [
            AuditLogView(
                id=log.id,
                form_name=log.form_name,
                field_name=log.field_name,
                old_value=log.old_value,
                new_value=log.new_value,
                changed_at=log.changed_at,
                changed_by=log.changed_by,
                changed_by_name=users.get(log.changed_by),
            )
            for log in logs
        ]
        return PaginatedAuditLogResponse(items=items, total=total)


@app.get("/admin/watch-directory")
def get_watch_dir(_: User = Depends(require_admin)) -> Dict[str, Optional[str]]:
    return {"path": get_watch_directory()}


@app.put("/admin/watch-directory")
def set_watch_dir(
    payload: Dict[str, str], _: User = Depends(require_admin)
) -> Dict[str, str]:
    path = payload.get("path", "").strip()
    if not path:
        raise HTTPException(status_code=400, detail="Path is required")
    if len(path) > 1024:
        raise HTTPException(status_code=400, detail="Path is too long")
    # Resolve and validate path to prevent path traversal
    try:
        resolved = Path(path).expanduser().resolve()
    except (ValueError, OSError):
        raise HTTPException(status_code=400, detail="Invalid path format")
    if not resolved.is_dir():
        raise HTTPException(status_code=400, detail=f"Directory does not exist: {resolved}")
    # Prevent access to sensitive system directories
    resolved_str = str(resolved)
    sensitive_prefixes = ["/etc", "/var/log", "/usr", "/bin", "/sbin", "/root", "/proc", "/sys", "/dev"]
    for sensitive in sensitive_prefixes:
        if resolved_str == sensitive or resolved_str.startswith(sensitive + "/"):
            raise HTTPException(status_code=400, detail=f"Access to system directory '{sensitive}' is not allowed")
    try:
        # Verify we can actually read the directory
        list(resolved.iterdir())
    except PermissionError:
        raise HTTPException(status_code=400, detail=f"Permission denied reading directory: {resolved}")
    set_watch_directory(resolved_str)
    logger.info("Watch directory updated to: %s", resolved_str)
    return {"status": "updated", "path": resolved_str}


@app.get("/admin/ldx-files", response_model=List[LdxFileInfo])
def list_ldx_files(_: User = Depends(require_admin)) -> List[LdxFileInfo]:
    watch_dir = get_watch_directory()
    if not watch_dir or not os.path.isdir(watch_dir):
        return []
    files: List[LdxFileInfo] = []
    for path in Path(watch_dir).glob("*.ldx"):
        try:
            stat = path.stat()
        except OSError:
            continue
        files.append(
            LdxFileInfo(
                name=path.name,
                size=stat.st_size,
                modified_at=datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc),
            )
        )
    files.sort(key=lambda item: item.modified_at, reverse=True)
    return files


class InjectionLogView(BaseModel):
    field_id: str
    value: str
    was_update: bool
    injected_at: datetime


@app.get(
    "/admin/ldx-files/{file_name}/injections",
    response_model=List[InjectionLogView],
)
def ldx_file_injections(
    file_name: str, _: User = Depends(require_admin)
) -> List[InjectionLogView]:
    # Prevent path traversal in file_name
    if "/" in file_name or "\\" in file_name or ".." in file_name:
        raise HTTPException(status_code=400, detail="Invalid file name")
    if not file_name.endswith(".ldx"):
        raise HTTPException(status_code=400, detail="File must be an .ldx file")
    with Session(engine) as session:
        logs = session.exec(
            select(InjectionLog)
            .where(col(InjectionLog.ldx_path).endswith(f"/{file_name}"))
            .order_by(InjectionLog.injected_at.desc())
        ).all()
        return [
            InjectionLogView(
                field_id=log.field_id,
                value=log.value,
                was_update=log.was_update,
                injected_at=log.injected_at,
            )
            for log in logs
        ]


class LdxFileStatsView(BaseModel):
    file_name: str
    total: int
    updates: int
    static: int


@app.get("/admin/ldx-stats", response_model=List[LdxFileStatsView])
def ldx_stats(_: User = Depends(require_admin)) -> List[LdxFileStatsView]:
    with Session(engine) as session:
        # Count updates per file path using a subquery approach for SQLite compatibility
        all_logs = session.exec(select(InjectionLog)).all()
        stats: Dict[str, Dict[str, int]] = {}
        for log in all_logs:
            name = Path(log.ldx_path).name
            if name not in stats:
                stats[name] = {"total": 0, "updates": 0}
            stats[name]["total"] += 1
            if log.was_update:
                stats[name]["updates"] += 1
        return [
            LdxFileStatsView(
                file_name=name,
                total=s["total"],
                updates=s["updates"],
                static=s["total"] - s["updates"],
            )
            for name, s in sorted(stats.items())
        ]


@app.post("/admin/export-db")
def export_db(admin: User = Depends(require_admin)) -> Dict[str, str]:
    watch_dir = get_watch_directory()
    if not watch_dir or not Path(watch_dir).is_dir():
        raise HTTPException(
            status_code=400, detail="Watch directory not configured or does not exist"
        )
    src = DATA_DIR / "app.db"
    if not src.exists():
        raise HTTPException(status_code=500, detail="Database file not found")
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H%M%S")
    filename = f"export_{timestamp}.db"
    dst = Path(watch_dir) / filename
    try:
        shutil.copy2(str(src), str(dst))
    except PermissionError:
        raise HTTPException(status_code=500, detail="Permission denied writing to watch directory")
    except OSError as e:
        raise HTTPException(status_code=500, detail=f"Failed to export database: {e}")
    logger.info("Database exported to %s by %s", dst, admin.username)
    return {"status": "exported", "filename": filename}


@app.post("/admin/clear-data")
def clear_data(_: User = Depends(require_admin)) -> Dict[str, str]:
    with Session(engine) as session:
        for model in [InjectionLog, LdxFile, AuditLog, FormValue]:
            session.exec(delete(model))
        session.commit()
    return {"status": "cleared"}


@app.get("/roles")
def roles(_: User = Depends(get_current_user)) -> List[str]:
    return list_roles()


# --- Telemetry ---

@app.get("/telemetry/channels", response_model=List[TelemetryChannelInfo])
def telemetry_channels(_: User = Depends(get_current_user)) -> List[TelemetryChannelInfo]:
    return get_channels()


@app.websocket("/ws/telemetry")
async def ws_telemetry(websocket: WebSocket, token: str = Query(...)) -> None:
    await telemetry_websocket(websocket, token)


# --- Dashboard Preferences ---

class DashboardConfigPayload(BaseModel):
    config: str  # JSON string

    @field_validator("config")
    @classmethod
    def validate_config(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Config is required")
        if len(v) > MAX_DASHBOARD_CONFIG_LENGTH:
            raise ValueError(f"Config exceeds maximum size of {MAX_DASHBOARD_CONFIG_LENGTH // 1000}KB")
        try:
            json.loads(v)
        except (json.JSONDecodeError, TypeError):
            raise ValueError("Config must be valid JSON")
        return v


@app.get("/telemetry/preferences")
def get_preferences(
    current_user: User = Depends(get_current_user),
) -> Dict[str, Optional[str]]:
    with Session(engine) as session:
        pref = session.get(DashboardPreference, current_user.id)
        return {"config": pref.config if pref else None}


@app.put("/telemetry/preferences")
def save_preferences(
    payload: DashboardConfigPayload,
    current_user: User = Depends(get_current_user),
) -> Dict[str, str]:
    with Session(engine) as session:
        pref = session.get(DashboardPreference, current_user.id)
        if pref:
            pref.config = payload.config
            pref.updated_at = datetime.now(timezone.utc)
        else:
            pref = DashboardPreference(
                user_id=current_user.id,
                config=payload.config,
            )
        session.add(pref)
        session.commit()
    return {"status": "saved"}


# --- Admin Sensor CRUD ---

_SENSOR_ID_PATTERN = re.compile(r"^[a-zA-Z0-9_]+$")


class SensorCreate(BaseModel):
    sensor_id: str
    name: str
    unit: str
    min_value: float = 0
    max_value: float = 100
    group: str = "Other"
    sort_order: int = 0
    enabled: bool = True

    @field_validator("sensor_id")
    @classmethod
    def validate_sensor_id(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Sensor ID is required")
        if len(v) > MAX_SENSOR_ID_LENGTH:
            raise ValueError(f"Sensor ID must be at most {MAX_SENSOR_ID_LENGTH} characters")
        if not _SENSOR_ID_PATTERN.match(v):
            raise ValueError("Sensor ID may only contain letters, numbers, and underscores")
        return v

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Name is required")
        if len(v) > MAX_SENSOR_NAME_LENGTH:
            raise ValueError(f"Name must be at most {MAX_SENSOR_NAME_LENGTH} characters")
        return v

    @field_validator("unit")
    @classmethod
    def validate_unit(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Unit is required")
        if len(v) > MAX_SENSOR_UNIT_LENGTH:
            raise ValueError(f"Unit must be at most {MAX_SENSOR_UNIT_LENGTH} characters")
        return v

    @field_validator("group")
    @classmethod
    def validate_group(cls, v: str) -> str:
        v = v.strip()
        if len(v) > MAX_SENSOR_GROUP_LENGTH:
            raise ValueError(f"Group must be at most {MAX_SENSOR_GROUP_LENGTH} characters")
        return v or "Other"

    @field_validator("max_value")
    @classmethod
    def validate_max_gt_min(cls, v: float, info: object) -> float:
        # Access min_value from validated data
        data = getattr(info, "data", {})
        min_val = data.get("min_value")
        if min_val is not None and v <= min_val:
            raise ValueError("Max value must be greater than min value")
        return v

    @field_validator("sort_order")
    @classmethod
    def validate_sort_order(cls, v: int) -> int:
        if v < -1000 or v > 10000:
            raise ValueError("Sort order must be between -1000 and 10000")
        return v


class SensorUpdate(BaseModel):
    name: Optional[str] = None
    unit: Optional[str] = None
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    group: Optional[str] = None
    sort_order: Optional[int] = None
    enabled: Optional[bool] = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            v = v.strip()
            if not v:
                raise ValueError("Name cannot be empty")
            if len(v) > MAX_SENSOR_NAME_LENGTH:
                raise ValueError(f"Name must be at most {MAX_SENSOR_NAME_LENGTH} characters")
        return v

    @field_validator("unit")
    @classmethod
    def validate_unit(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            v = v.strip()
            if not v:
                raise ValueError("Unit cannot be empty")
            if len(v) > MAX_SENSOR_UNIT_LENGTH:
                raise ValueError(f"Unit must be at most {MAX_SENSOR_UNIT_LENGTH} characters")
        return v

    @field_validator("group")
    @classmethod
    def validate_group(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and len(v) > MAX_SENSOR_GROUP_LENGTH:
            raise ValueError(f"Group must be at most {MAX_SENSOR_GROUP_LENGTH} characters")
        return v

    @field_validator("sort_order")
    @classmethod
    def validate_sort_order(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and (v < -1000 or v > 10000):
            raise ValueError("Sort order must be between -1000 and 10000")
        return v


class SensorView(BaseModel):
    id: int
    sensor_id: str
    name: str
    unit: str
    min_value: float
    max_value: float
    group: str
    sort_order: int
    enabled: bool


@app.get("/admin/sensors", response_model=List[SensorView])
def list_sensors(_: User = Depends(require_admin)) -> List[SensorView]:
    with Session(engine) as session:
        sensors = session.exec(
            select(TelemetrySensor).order_by(TelemetrySensor.sort_order)
        ).all()
        return [
            SensorView(
                id=s.id,
                sensor_id=s.sensor_id,
                name=s.name,
                unit=s.unit,
                min_value=s.min_value,
                max_value=s.max_value,
                group=s.group,
                sort_order=s.sort_order,
                enabled=s.enabled,
            )
            for s in sensors
        ]


@app.post("/admin/sensors", response_model=SensorView)
def create_sensor(
    payload: SensorCreate, _: User = Depends(require_admin)
) -> SensorView:
    with Session(engine) as session:
        existing = session.exec(
            select(TelemetrySensor).where(
                TelemetrySensor.sensor_id == payload.sensor_id
            )
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Sensor ID already exists")
        sensor = TelemetrySensor(**payload.model_dump())
        session.add(sensor)
        session.commit()
        session.refresh(sensor)
        return SensorView(
            id=sensor.id,
            sensor_id=sensor.sensor_id,
            name=sensor.name,
            unit=sensor.unit,
            min_value=sensor.min_value,
            max_value=sensor.max_value,
            group=sensor.group,
            sort_order=sensor.sort_order,
            enabled=sensor.enabled,
        )


@app.put("/admin/sensors/{sensor_id}", response_model=SensorView)
def update_sensor(
    sensor_id: str, payload: SensorUpdate, _: User = Depends(require_admin)
) -> SensorView:
    with Session(engine) as session:
        sensor = session.exec(
            select(TelemetrySensor).where(TelemetrySensor.sensor_id == sensor_id)
        ).first()
        if not sensor:
            raise HTTPException(status_code=404, detail=f"Sensor '{sensor_id}' not found")
        update_data = payload.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(sensor, key, value)
        # Validate min < max after applying updates
        if sensor.min_value >= sensor.max_value:
            raise HTTPException(status_code=400, detail="Max value must be greater than min value")
        session.add(sensor)
        session.commit()
        session.refresh(sensor)
        return SensorView(
            id=sensor.id,
            sensor_id=sensor.sensor_id,
            name=sensor.name,
            unit=sensor.unit,
            min_value=sensor.min_value,
            max_value=sensor.max_value,
            group=sensor.group,
            sort_order=sensor.sort_order,
            enabled=sensor.enabled,
        )


@app.delete("/admin/sensors/{sensor_id}")
def delete_sensor(
    sensor_id: str, _: User = Depends(require_admin)
) -> Dict[str, str]:
    with Session(engine) as session:
        sensor = session.exec(
            select(TelemetrySensor).where(TelemetrySensor.sensor_id == sensor_id)
        ).first()
        if not sensor:
            raise HTTPException(status_code=404, detail="Sensor not found")
        session.delete(sensor)
        session.commit()
    return {"status": "deleted"}


# --- Modem / Serial Telemetry ---


class SerialConfigUpdate(BaseModel):
    port: Optional[str] = None
    baud_rate: Optional[int] = None
    data_format: Optional[str] = None
    csv_channel_order: Optional[List[str]] = None
    csv_separator: Optional[str] = None
    timeout: Optional[float] = None
    reconnect_interval: Optional[float] = None

    @field_validator("port")
    @classmethod
    def validate_port(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            v = v.strip()
            if len(v) > 256:
                raise ValueError("Port path is too long")
        return v

    @field_validator("baud_rate")
    @classmethod
    def validate_baud_rate(cls, v: Optional[int]) -> Optional[int]:
        valid_bauds = {1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200, 230400, 460800}
        if v is not None and v not in valid_bauds:
            raise ValueError(f"Baud rate must be one of: {', '.join(str(b) for b in sorted(valid_bauds))}")
        return v

    @field_validator("timeout")
    @classmethod
    def validate_timeout(cls, v: Optional[float]) -> Optional[float]:
        if v is not None and (v < 0.1 or v > 60):
            raise ValueError("Timeout must be between 0.1 and 60 seconds")
        return v

    @field_validator("reconnect_interval")
    @classmethod
    def validate_reconnect(cls, v: Optional[float]) -> Optional[float]:
        if v is not None and (v < 1 or v > 300):
            raise ValueError("Reconnect interval must be between 1 and 300 seconds")
        return v

    @field_validator("csv_separator")
    @classmethod
    def validate_separator(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and len(v) > 5:
            raise ValueError("CSV separator is too long")
        return v


class TelemetrySourceUpdate(BaseModel):
    source: str  # "auto", "serial", "simulated"

    @field_validator("source")
    @classmethod
    def validate_source(cls, v: str) -> str:
        valid = {"auto", "serial", "simulated"}
        if v not in valid:
            raise ValueError(f"Source must be one of: {', '.join(sorted(valid))}")
        return v


@app.get("/telemetry/source")
def get_telemetry_source(
    _: User = Depends(get_current_user),
) -> Dict:
    return source_manager.status()


@app.get("/admin/serial/config")
def get_serial_config(_: User = Depends(require_admin)) -> Dict:
    return source_manager.serial_reader.config.to_dict()


@app.put("/admin/serial/config")
async def update_serial_config(
    payload: SerialConfigUpdate, _: User = Depends(require_admin)
) -> Dict[str, str]:
    update_data = payload.model_dump(exclude_unset=True)
    if "data_format" in update_data:
        try:
            SerialFormat(update_data["data_format"])
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid format. Must be one of: {', '.join(f.value for f in SerialFormat)}",
            )
    # Stop reader, apply config, restart
    await source_manager.serial_reader.stop()
    source_manager.update_serial_config(**update_data)
    await source_manager.serial_reader.start()
    return {"status": "updated"}


@app.put("/admin/serial/source")
def set_telemetry_source(
    payload: TelemetrySourceUpdate, _: User = Depends(require_admin)
) -> Dict[str, str]:
    try:
        source_manager.set_source_preference(payload.source)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"status": "updated", "active_source": source_manager.active_source}


@app.post("/admin/serial/restart")
async def restart_serial(_: User = Depends(require_admin)) -> Dict[str, str]:
    await source_manager.serial_reader.stop()
    await source_manager.serial_reader.start()
    return {"status": "restarted", "state": source_manager.serial_reader.state.value}
