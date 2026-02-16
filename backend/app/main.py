import os
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

from fastapi import Depends, FastAPI, HTTPException, Query, WebSocket, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from sqlmodel import Session, select

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
from .database import engine, init_db
from .forms import FormSchema, get_form_by_role, list_roles, load_forms
from .ldx_watcher import LdxWatcher, get_watch_directory, set_watch_directory
from .models import AuditLog, FormValue, Role, SubteamRole, User
from .telemetry import TelemetryChannelInfo, get_channels, telemetry_websocket

app = FastAPI(title="SCR Form Manager")
watcher = LdxWatcher()

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


@app.on_event("startup")
def on_startup() -> None:
    init_db()
    with Session(engine) as session:
        ensure_roles(session)
        ensure_default_admin(session)
    watcher.start()


@app.on_event("shutdown")
def on_shutdown() -> None:
    watcher.stop()


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
        if not user or not verify_password(form_data.password, user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials"
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
    with Session(engine) as session:
        values = session.exec(
            select(FormValue).where(FormValue.form_name == form.form_name)
        ).all()
        value_map = {value.field_name: value.value for value in values}
        return FormValuesResponse(values=value_map)


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
                current.updated_at = datetime.utcnow()
                current.updated_by = current_user.id
            else:
                session.add(
                    FormValue(
                        form_name=form.form_name,
                        field_name=field_name,
                        value=new_value_str,
                        updated_at=datetime.utcnow(),
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
                        changed_at=datetime.utcnow(),
                        changed_by=current_user.id,
                    )
                )
        session.commit()
    return {"status": "saved"}


@app.get("/admin/audit", response_model=List[AuditLogView])
def audit_log(
    limit: int = Query(100, ge=1, le=500),
    _: User = Depends(require_admin),
) -> List[AuditLogView]:
    with Session(engine) as session:
        users = {user.id: user.username for user in session.exec(select(User)).all()}
        logs = session.exec(
            select(AuditLog).order_by(AuditLog.changed_at.desc()).limit(limit)
        ).all()
        return [
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
        resolved = Path(path).resolve()
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
                modified_at=datetime.fromtimestamp(stat.st_mtime),
            )
        )
    files.sort(key=lambda item: item.modified_at, reverse=True)
    return files


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
