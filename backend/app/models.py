from datetime import datetime, timezone
from enum import Enum
from typing import List, Optional

from sqlmodel import Field, Relationship, SQLModel


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class SubteamRole(str, Enum):
    daq = "DAQ"
    chief = "Chief"
    suspension = "suspension"
    electronic = "electronic"
    drivetrain = "drivetrain"
    driver = "driver"
    chasis = "chasis"
    aero = "aero"
    ergo = "ergo"
    powertrain = "powertrain"


class UserRoleLink(SQLModel, table=True):
    user_id: Optional[int] = Field(
        default=None, foreign_key="user.id", primary_key=True
    )
    role_name: Optional[str] = Field(
        default=None, foreign_key="role.name", primary_key=True
    )


class Role(SQLModel, table=True):
    name: str = Field(primary_key=True)
    users: List["User"] = Relationship(back_populates="roles", link_model=UserRoleLink)


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(index=True, unique=True)
    hashed_password: str
    is_admin: bool = False
    roles: List[Role] = Relationship(back_populates="users", link_model=UserRoleLink)


class Setting(SQLModel, table=True):
    key: str = Field(primary_key=True)
    value: str


class FormValue(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    form_name: str = Field(index=True)
    field_name: str = Field(index=True)
    value: str
    updated_at: datetime = Field(default_factory=_utcnow)
    updated_by: Optional[int] = Field(default=None, foreign_key="user.id")


class AuditLog(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    form_name: str = Field(index=True)
    field_name: str = Field(index=True)
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    changed_at: datetime = Field(default_factory=_utcnow, index=True)
    changed_by: Optional[int] = Field(default=None, foreign_key="user.id")


class TelemetrySensor(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    sensor_id: str = Field(index=True, unique=True)
    name: str
    unit: str
    min_value: float = 0
    max_value: float = 100
    group: str = "Other"
    sort_order: int = 0
    enabled: bool = True


class DashboardPreference(SQLModel, table=True):
    user_id: int = Field(foreign_key="user.id", primary_key=True)
    config: str
    updated_at: datetime = Field(default_factory=_utcnow)


class LdxFile(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    path: str = Field(index=True, unique=True)
    mtime: float
    processed_at: datetime = Field(default_factory=_utcnow)


class InjectionLog(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    ldx_path: str = Field(index=True)
    field_id: str
    value: str
    was_update: bool = False
    injected_at: datetime = Field(default_factory=_utcnow)
