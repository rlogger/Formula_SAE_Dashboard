"""WebSocket telemetry endpoint with simulated and live serial data sources.

Supports two data sources:
  - "simulated": Generated test data (default when no serial port configured)
  - "serial": Live data from Digi Bee SX modem (Motec CAN -> RS232 -> modem)

The active source is determined by TELEMETRY_SOURCE env var ("auto", "serial",
"simulated") and whether a serial port is configured and available.
"""

import asyncio
import logging
import math
import os
import random
import time
from typing import Dict, List, Optional

import jwt
from fastapi import WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from .auth import JWT_ALGORITHM, JWT_SECRET
from .database import engine
from .models import TelemetrySensor, User
from .serial_telemetry import ModemState, SerialConfig, SerialTelemetryReader

logger = logging.getLogger(__name__)

DEFAULT_CHANNELS = [
    {"sensor_id": "speed", "name": "Vehicle Speed", "unit": "km/h", "min_value": 0, "max_value": 160, "group": "Performance", "sort_order": 0},
    {"sensor_id": "rpm", "name": "Engine RPM", "unit": "rpm", "min_value": 0, "max_value": 14000, "group": "Performance", "sort_order": 1},
    {"sensor_id": "throttle", "name": "Throttle Position", "unit": "%", "min_value": 0, "max_value": 100, "group": "Performance", "sort_order": 2},
    {"sensor_id": "brake_pressure", "name": "Brake Pressure", "unit": "bar", "min_value": 0, "max_value": 120, "group": "Performance", "sort_order": 3},
    {"sensor_id": "coolant_temp", "name": "Coolant Temp", "unit": "C", "min_value": 60, "max_value": 120, "group": "Temperatures", "sort_order": 4},
    {"sensor_id": "oil_temp", "name": "Oil Temp", "unit": "C", "min_value": 60, "max_value": 140, "group": "Temperatures", "sort_order": 5},
    {"sensor_id": "intake_temp", "name": "Intake Air Temp", "unit": "C", "min_value": 20, "max_value": 60, "group": "Temperatures", "sort_order": 6},
    {"sensor_id": "exhaust_temp", "name": "Exhaust Temp", "unit": "C", "min_value": 200, "max_value": 900, "group": "Temperatures", "sort_order": 7},
    {"sensor_id": "g_lateral", "name": "Lateral G-Force", "unit": "g", "min_value": -2.5, "max_value": 2.5, "group": "G-Forces", "sort_order": 8},
    {"sensor_id": "g_longitudinal", "name": "Longitudinal G-Force", "unit": "g", "min_value": -3, "max_value": 3, "group": "G-Forces", "sort_order": 9},
    {"sensor_id": "wheel_fl", "name": "Wheel Speed FL", "unit": "km/h", "min_value": 0, "max_value": 160, "group": "Wheel Speeds", "sort_order": 10},
    {"sensor_id": "wheel_fr", "name": "Wheel Speed FR", "unit": "km/h", "min_value": 0, "max_value": 160, "group": "Wheel Speeds", "sort_order": 11},
    {"sensor_id": "wheel_rl", "name": "Wheel Speed RL", "unit": "km/h", "min_value": 0, "max_value": 160, "group": "Wheel Speeds", "sort_order": 12},
    {"sensor_id": "wheel_rr", "name": "Wheel Speed RR", "unit": "km/h", "min_value": 0, "max_value": 160, "group": "Wheel Speeds", "sort_order": 13},
    {"sensor_id": "battery_voltage", "name": "Battery Voltage", "unit": "V", "min_value": 10, "max_value": 15, "group": "Electrical", "sort_order": 14},
]


class TelemetryChannelInfo(BaseModel):
    id: str
    name: str
    unit: str
    min: float
    max: float
    group: str


def ensure_default_sensors(session: Session) -> None:
    """Seed the TelemetrySensor table with defaults if empty."""
    count = session.exec(select(TelemetrySensor)).first()
    if count is not None:
        return
    for ch in DEFAULT_CHANNELS:
        session.add(TelemetrySensor(**ch))
    session.commit()


def get_channels() -> List[TelemetryChannelInfo]:
    """Return enabled sensors from the database, ordered by sort_order."""
    with Session(engine) as session:
        sensors = session.exec(
            select(TelemetrySensor)
            .where(TelemetrySensor.enabled == True)
            .order_by(TelemetrySensor.sort_order)
        ).all()
        return [
            TelemetryChannelInfo(
                id=s.sensor_id,
                name=s.name,
                unit=s.unit,
                min=s.min_value,
                max=s.max_value,
                group=s.group,
            )
            for s in sensors
        ]


def _authenticate_ws(token: str) -> bool:
    """Validate JWT token from WebSocket query param."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        username = payload.get("sub")
        if not username:
            return False
        with Session(engine) as session:
            user = session.exec(
                select(User)
                .where(User.username == username)
                .options(selectinload(User.roles))
            ).first()
            return user is not None
    except jwt.PyJWTError:
        return False


def _generate_frame(t: float, unix_ts: float) -> dict:
    """Generate a single simulated telemetry frame."""
    phase = math.sin(t * 0.3) * 0.5 + 0.5
    speed_base = 40 + phase * 100
    rpm_base = 3000 + phase * 9000

    return {
        "timestamp": unix_ts,
        "source": "simulated",
        "channels": {
            "speed": round(speed_base + random.gauss(0, 2), 1),
            "rpm": round(rpm_base + random.gauss(0, 200), 0),
            "throttle": round(max(0, min(100, phase * 100 + random.gauss(0, 5))), 1),
            "brake_pressure": round(max(0, (1 - phase) * 80 + random.gauss(0, 3)), 1),
            "coolant_temp": round(85 + math.sin(t * 0.1) * 10 + random.gauss(0, 1), 1),
            "oil_temp": round(95 + math.sin(t * 0.08) * 15 + random.gauss(0, 1), 1),
            "intake_temp": round(35 + math.sin(t * 0.05) * 8 + random.gauss(0, 0.5), 1),
            "exhaust_temp": round(400 + phase * 350 + random.gauss(0, 15), 1),
            "g_lateral": round(math.sin(t * 0.7) * 1.8 + random.gauss(0, 0.1), 2),
            "g_longitudinal": round(math.cos(t * 0.5) * 1.5 + random.gauss(0, 0.1), 2),
            "wheel_fl": round(speed_base * 1.0 + random.gauss(0, 1.5), 1),
            "wheel_fr": round(speed_base * 1.0 + random.gauss(0, 1.5), 1),
            "wheel_rl": round(speed_base * 0.98 + random.gauss(0, 1.5), 1),
            "wheel_rr": round(speed_base * 0.98 + random.gauss(0, 1.5), 1),
            "battery_voltage": round(12.6 + math.sin(t * 0.2) * 0.5 + random.gauss(0, 0.05), 2),
        },
    }


# ---------------------------------------------------------------------------
# Telemetry source manager
# ---------------------------------------------------------------------------

class TelemetrySourceManager:
    """Manages the active telemetry data source (simulated vs serial modem)."""

    def __init__(self) -> None:
        self._serial_config = SerialConfig.from_env()
        self._serial_reader = SerialTelemetryReader(self._serial_config)
        self._latest_serial_channels: Dict[str, float] = {}
        self._serial_reader.set_on_frame(self._on_serial_frame)
        self._source_preference = os.getenv("TELEMETRY_SOURCE", "auto")

    def _on_serial_frame(self, channels: Dict[str, float]) -> None:
        """Callback from serial reader when a new frame arrives."""
        self._latest_serial_channels.update(channels)

    @property
    def active_source(self) -> str:
        """Return the currently active data source name."""
        if self._source_preference == "simulated":
            return "simulated"
        if self._source_preference == "serial":
            return "serial"
        # auto: use serial if connected, else simulated
        if self._serial_reader.state == ModemState.CONNECTED:
            return "serial"
        return "simulated"

    @property
    def serial_reader(self) -> SerialTelemetryReader:
        return self._serial_reader

    async def start(self) -> None:
        """Start the serial reader if configured."""
        if self._source_preference != "simulated":
            await self._serial_reader.start()

    async def stop(self) -> None:
        await self._serial_reader.stop()

    def get_frame(self, t: float, unix_ts: float) -> dict:
        """Get a telemetry frame from the active source."""
        if self.active_source == "serial" and self._latest_serial_channels:
            return {
                "timestamp": unix_ts,
                "source": "serial",
                "channels": dict(self._latest_serial_channels),
            }
        return _generate_frame(t, unix_ts)

    def status(self) -> dict:
        return {
            "active_source": self.active_source,
            "source_preference": self._source_preference,
            "serial": self._serial_reader.status(),
        }

    def update_serial_config(self, **kwargs: object) -> None:
        self._serial_reader.update_config(**kwargs)

    def set_source_preference(self, pref: str) -> None:
        if pref not in ("auto", "serial", "simulated"):
            raise ValueError(f"Invalid source preference: {pref}")
        self._source_preference = pref


# Module-level singleton
source_manager = TelemetrySourceManager()


async def telemetry_websocket(websocket: WebSocket, token: str) -> None:
    """Handle a WebSocket telemetry connection."""
    if not _authenticate_ws(token):
        await websocket.close(code=4001, reason="Unauthorized")
        return

    await websocket.accept()
    start = time.time()
    try:
        while True:
            now = time.time()
            t = now - start
            frame = source_manager.get_frame(t, now)
            await websocket.send_json(frame)
            await asyncio.sleep(0.1)  # 10Hz
    except WebSocketDisconnect:
        pass
    except Exception:
        try:
            await websocket.close()
        except Exception:
            pass
