"""WebSocket telemetry endpoint with simulated vehicle data."""

import asyncio
import math
import random
import time
from typing import List

import jwt
from fastapi import WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from .auth import JWT_ALGORITHM, JWT_SECRET
from .database import engine
from .models import User

CHANNELS = [
    {"id": "speed", "name": "Vehicle Speed", "unit": "km/h", "min": 0, "max": 160, "group": "Performance"},
    {"id": "rpm", "name": "Engine RPM", "unit": "rpm", "min": 0, "max": 14000, "group": "Performance"},
    {"id": "throttle", "name": "Throttle Position", "unit": "%", "min": 0, "max": 100, "group": "Performance"},
    {"id": "brake_pressure", "name": "Brake Pressure", "unit": "bar", "min": 0, "max": 120, "group": "Performance"},
    {"id": "coolant_temp", "name": "Coolant Temp", "unit": "C", "min": 60, "max": 120, "group": "Temperatures"},
    {"id": "oil_temp", "name": "Oil Temp", "unit": "C", "min": 60, "max": 140, "group": "Temperatures"},
    {"id": "intake_temp", "name": "Intake Air Temp", "unit": "C", "min": 20, "max": 60, "group": "Temperatures"},
    {"id": "exhaust_temp", "name": "Exhaust Temp", "unit": "C", "min": 200, "max": 900, "group": "Temperatures"},
    {"id": "g_lateral", "name": "Lateral G-Force", "unit": "g", "min": -2.5, "max": 2.5, "group": "G-Forces"},
    {"id": "g_longitudinal", "name": "Longitudinal G-Force", "unit": "g", "min": -3, "max": 3, "group": "G-Forces"},
    {"id": "wheel_fl", "name": "Wheel Speed FL", "unit": "km/h", "min": 0, "max": 160, "group": "Wheel Speeds"},
    {"id": "wheel_fr", "name": "Wheel Speed FR", "unit": "km/h", "min": 0, "max": 160, "group": "Wheel Speeds"},
    {"id": "wheel_rl", "name": "Wheel Speed RL", "unit": "km/h", "min": 0, "max": 160, "group": "Wheel Speeds"},
    {"id": "wheel_rr", "name": "Wheel Speed RR", "unit": "km/h", "min": 0, "max": 160, "group": "Wheel Speeds"},
    {"id": "battery_voltage", "name": "Battery Voltage", "unit": "V", "min": 10, "max": 15, "group": "Electrical"},
]


class TelemetryChannelInfo(BaseModel):
    id: str
    name: str
    unit: str
    min: float
    max: float
    group: str


def get_channels() -> List[TelemetryChannelInfo]:
    return [TelemetryChannelInfo(**ch) for ch in CHANNELS]


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


def _generate_frame(t: float) -> dict:
    """Generate a single simulated telemetry frame."""
    # Simulate a car going around a track with varying speed
    phase = math.sin(t * 0.3) * 0.5 + 0.5  # 0-1 oscillating
    speed_base = 40 + phase * 100
    rpm_base = 3000 + phase * 9000

    return {
        "timestamp": t,
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


async def telemetry_websocket(websocket: WebSocket, token: str) -> None:
    """Handle a WebSocket telemetry connection."""
    if not _authenticate_ws(token):
        await websocket.close(code=4001, reason="Unauthorized")
        return

    await websocket.accept()
    start = time.time()
    try:
        while True:
            t = time.time() - start
            frame = _generate_frame(t)
            await websocket.send_json(frame)
            await asyncio.sleep(0.1)  # 10Hz
    except WebSocketDisconnect:
        pass
    except Exception:
        try:
            await websocket.close()
        except Exception:
            pass
