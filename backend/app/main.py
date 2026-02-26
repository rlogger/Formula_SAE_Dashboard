import os
import shutil
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

from fastapi import Depends, FastAPI, HTTPException, Query, WebSocket, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
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


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserCreate(BaseModel):
    username: str
    password: str
    roles: List[str] = []
    is_admin: bool = False


class UserView(BaseModel):
    id: int
    username: str
    roles: List[str]
    is_admin: bool


class PasswordUpdate(BaseModel):
    password: str


class RolesUpdate(BaseModel):
    roles: List[str]


class FormValuesResponse(BaseModel):
    values: Dict[str, Optional[str]]
    timestamps: Dict[str, float] = {}
    previous_values: Dict[str, Optional[str]] = {}


class FormSubmit(BaseModel):
    values: Dict[str, Optional[str]]


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
    if len(password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Password must be at least {MIN_PASSWORD_LENGTH} characters"
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


def _ensure_access(role: str, user: User) -> None:
    if user.is_admin:
        return
    if role not in [r.name for r in user.roles]:
        raise HTTPException(status_code=403, detail="Access denied for this form")


@app.post("/auth/login", response_model=TokenResponse)
def login(form_data: OAuth2PasswordRequestForm = Depends()) -> TokenResponse:
    with Session(engine) as session:
        user = session.exec(select(User).where(User.username == form_data.username)).first()
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
        raise HTTPException(status_code=400, detail="At least one role is required")
    with Session(engine) as session:
        existing = session.exec(select(User).where(User.username == payload.username)).first()
        if existing:
            raise HTTPException(status_code=400, detail="Username already exists")
        user = User(
            username=payload.username,
            hashed_password=get_password_hash(payload.password),
            is_admin=payload.is_admin,
        )
        if roles:
            db_roles = session.exec(select(Role).where(Role.name.in_(roles))).all()
            user.roles = db_roles
        session.add(user)
        session.commit()
        session.refresh(user)
        return _user_to_view(user)


@app.delete("/admin/users/{user_id}")
def delete_user(user_id: int, _: User = Depends(require_admin)) -> Dict[str, str]:
    with Session(engine) as session:
        user = session.get(User, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
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


@app.post("/forms/{role}/submit")
def submit_form(role: str, payload: FormSubmit, current_user: User = Depends(get_current_user)) -> Dict[str, str]:
    _ensure_access(role, current_user)
    form = get_form_by_role(role)
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")
    field_names = {field.name for field in form.fields}
    for name in payload.values.keys():
        if name not in field_names:
            raise HTTPException(status_code=400, detail=f"Unknown field: {name}")
    with Session(engine) as session:
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
                current.updated_at = datetime.now(timezone.utc)
                current.updated_by = current_user.id
            else:
                session.add(
                    FormValue(
                        form_name=form.form_name,
                        field_name=field_name,
                        value=new_value_str,
                        updated_at=datetime.now(timezone.utc),
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
                        changed_at=datetime.now(timezone.utc),
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
    limit: int = Query(20, ge=1, le=500),
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
    path = payload.get("path", "")
    if not path:
        raise HTTPException(status_code=400, detail="Path is required")
    # Resolve and validate path to prevent path traversal
    try:
        resolved = Path(path).expanduser().resolve()
    except (ValueError, OSError):
        raise HTTPException(status_code=400, detail="Invalid path")
    if not resolved.is_dir():
        raise HTTPException(status_code=400, detail="Directory does not exist")
    # Prevent access to sensitive system directories
    sensitive_paths = ["/etc", "/var", "/usr", "/bin", "/sbin", "/root", "/home"]
    for sensitive in sensitive_paths:
        if str(resolved).startswith(sensitive) and not str(resolved).startswith("/home"):
            raise HTTPException(status_code=400, detail="Access to system directories is not allowed")
    set_watch_directory(str(resolved))
    return {"status": "updated", "path": str(resolved)}


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
        rows = session.exec(
            select(
                InjectionLog.ldx_path,
                func.count().label("total"),
                func.sum(InjectionLog.was_update.cast(int)).label("updates"),
            )
            .group_by(InjectionLog.ldx_path)
        ).all()
        stats: Dict[str, Dict[str, int]] = {}
        for ldx_path, total, updates in rows:
            name = Path(ldx_path).name
            if name not in stats:
                stats[name] = {"total": 0, "updates": 0}
            stats[name]["total"] += total
            stats[name]["updates"] += updates or 0
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
def export_db(_: User = Depends(require_admin)) -> Dict[str, str]:
    watch_dir = get_watch_directory()
    if not watch_dir or not Path(watch_dir).is_dir():
        raise HTTPException(
            status_code=400, detail="Watch directory not configured or does not exist"
        )
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H%M%S")
    filename = f"export_{timestamp}.db"
    src = DATA_DIR / "app.db"
    dst = Path(watch_dir) / filename
    shutil.copy2(str(src), str(dst))
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

class SensorCreate(BaseModel):
    sensor_id: str
    name: str
    unit: str
    min_value: float = 0
    max_value: float = 100
    group: str = "Other"
    sort_order: int = 0
    enabled: bool = True


class SensorUpdate(BaseModel):
    name: Optional[str] = None
    unit: Optional[str] = None
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    group: Optional[str] = None
    sort_order: Optional[int] = None
    enabled: Optional[bool] = None


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
            raise HTTPException(status_code=404, detail="Sensor not found")
        update_data = payload.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(sensor, key, value)
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


class TelemetrySourceUpdate(BaseModel):
    source: str  # "auto", "serial", "simulated"


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
