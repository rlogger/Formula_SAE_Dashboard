"""Serial telemetry reader for Digi Bee SX modem receiving Motec CAN data.

Data chain: Motec CAN -> RS232 (CAN-to-Serial) -> Digi Bee SX TX -> air ->
            Digi Bee SX RX -> RS232 -> this reader -> WebSocket dashboard

The Digi Bee SX modems act as a transparent serial bridge, so the data format
depends on the Motec CAN-to-Serial converter output. This module supports:
  - CSV text frames (e.g. "speed,rpm,throttle,...\\n")
  - Motec binary frames (length-prefixed with CAN IDs)
"""

import asyncio
import logging
import os
import struct
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Callable, Dict, List, Optional

logger = logging.getLogger(__name__)


class SerialFormat(str, Enum):
    CSV = "csv"
    MOTEC_BINARY = "motec_binary"
    AUTO = "auto"


class ModemState(str, Enum):
    DISCONNECTED = "disconnected"
    CONNECTING = "connecting"
    CONNECTED = "connected"
    ERROR = "error"


@dataclass
class SerialConfig:
    port: str = ""
    baud_rate: int = 9600
    data_format: SerialFormat = SerialFormat.CSV
    csv_channel_order: List[str] = field(default_factory=lambda: [
        "speed", "rpm", "throttle", "brake_pressure",
        "coolant_temp", "oil_temp", "intake_temp", "exhaust_temp",
        "g_lateral", "g_longitudinal",
        "wheel_fl", "wheel_fr", "wheel_rl", "wheel_rr",
        "battery_voltage",
    ])
    csv_separator: str = ","
    timeout: float = 2.0
    reconnect_interval: float = 5.0

    @classmethod
    def from_env(cls) -> "SerialConfig":
        csv_order_env = os.getenv("SERIAL_CSV_CHANNELS", "")
        csv_channels = (
            [c.strip() for c in csv_order_env.split(",") if c.strip()]
            if csv_order_env
            else None
        )
        config = cls(
            port=os.getenv("SERIAL_PORT", ""),
            baud_rate=int(os.getenv("SERIAL_BAUD", "9600")),
            data_format=SerialFormat(os.getenv("SERIAL_FORMAT", "csv")),
            csv_separator=os.getenv("SERIAL_CSV_SEPARATOR", ","),
            timeout=float(os.getenv("SERIAL_TIMEOUT", "2.0")),
            reconnect_interval=float(os.getenv("SERIAL_RECONNECT", "5.0")),
        )
        if csv_channels:
            config.csv_channel_order = csv_channels
        return config

    def to_dict(self) -> dict:
        return {
            "port": self.port,
            "baud_rate": self.baud_rate,
            "data_format": self.data_format.value,
            "csv_channel_order": self.csv_channel_order,
            "csv_separator": self.csv_separator,
            "timeout": self.timeout,
            "reconnect_interval": self.reconnect_interval,
        }


# Motec CAN ID -> (sensor_id, scale, offset) mapping
# These are common Motec M1 CAN broadcast addresses
MOTEC_CAN_MAP: Dict[int, List[tuple]] = {
    0x5F0: [("rpm", 1.0, 0), ("throttle", 0.1, 0)],
    0x5F1: [("speed", 0.1, 0), ("brake_pressure", 0.1, 0)],
    0x5F2: [("coolant_temp", 0.1, -40), ("oil_temp", 0.1, -40)],
    0x5F3: [("intake_temp", 0.1, -40), ("exhaust_temp", 1.0, 0)],
    0x5F4: [("g_lateral", 0.001, 0), ("g_longitudinal", 0.001, 0)],
    0x5F5: [("wheel_fl", 0.1, 0), ("wheel_fr", 0.1, 0)],
    0x5F6: [("wheel_rl", 0.1, 0), ("wheel_rr", 0.1, 0)],
    0x5F7: [("battery_voltage", 0.01, 0)],
}


def parse_csv_line(
    line: str,
    channel_order: List[str],
    separator: str = ",",
) -> Dict[str, float]:
    """Parse a CSV line into channel values."""
    parts = line.strip().split(separator)
    channels: Dict[str, float] = {}
    for i, value_str in enumerate(parts):
        if i >= len(channel_order):
            break
        value_str = value_str.strip()
        if not value_str:
            continue
        try:
            channels[channel_order[i]] = float(value_str)
        except ValueError:
            continue
    return channels


def parse_motec_binary_frames(
    data: bytes,
) -> tuple[Dict[str, float], bytes]:
    """Parse Motec binary CAN-over-serial frames from a byte buffer.

    Expected frame format (from Motec CAN-to-Serial converter):
      [0x55] [0xAA] [CAN_ID_H] [CAN_ID_L] [LEN] [DATA...] [CHECKSUM]

    Returns (parsed_channels, remaining_bytes) so callers can buffer leftovers.
    """
    channels: Dict[str, float] = {}
    pos = 0
    last_consumed = 0

    while pos + 5 < len(data):
        # Find sync header
        if data[pos] != 0x55 or data[pos + 1] != 0xAA:
            pos += 1
            last_consumed = pos
            continue

        can_id = struct.unpack(">H", data[pos + 2 : pos + 4])[0]
        data_len = data[pos + 4]
        frame_end = pos + 5 + data_len + 1

        # Incomplete frame - keep remaining bytes for next read
        if frame_end > len(data):
            break

        payload = data[pos + 5 : pos + 5 + data_len]
        checksum = data[pos + 5 + data_len]

        # Verify checksum (XOR of all bytes from CAN_ID to end of data)
        calc_checksum = 0
        for b in data[pos + 2 : pos + 5 + data_len]:
            calc_checksum ^= b
        if calc_checksum != checksum:
            pos += 1
            last_consumed = pos
            continue

        # Decode CAN payload using map
        if can_id in MOTEC_CAN_MAP:
            sensors = MOTEC_CAN_MAP[can_id]
            for j, (sensor_id, scale, offset) in enumerate(sensors):
                byte_offset = j * 2
                if byte_offset + 2 <= len(payload):
                    raw = struct.unpack(">h", payload[byte_offset : byte_offset + 2])[0]
                    channels[sensor_id] = round(raw * scale + offset, 3)

        pos = frame_end
        last_consumed = pos

    # Return remaining bytes that could be a partial frame
    return channels, data[last_consumed:]


class SerialTelemetryReader:
    """Reads telemetry from serial port connected to Digi Bee SX RX modem."""

    def __init__(self, config: SerialConfig):
        self.config = config
        self.state = ModemState.DISCONNECTED
        self._serial = None
        self._task: Optional[asyncio.Task] = None
        self._on_frame: Optional[Callable[[Dict[str, float]], None]] = None
        self._last_frame_time: float = 0
        self._frames_received: int = 0
        self._errors: int = 0
        self._running = False

    @property
    def is_available(self) -> bool:
        """Check if serial port is configured and pyserial is installed."""
        if not self.config.port:
            return False
        try:
            import serial  # noqa: F401
            return True
        except ImportError:
            logger.warning("pyserial not installed - serial telemetry unavailable")
            return False

    def status(self) -> dict:
        return {
            "state": self.state.value,
            "port": self.config.port,
            "baud_rate": self.config.baud_rate,
            "format": self.config.data_format.value,
            "last_frame_time": self._last_frame_time,
            "frames_received": self._frames_received,
            "errors": self._errors,
            "available": self.is_available,
        }

    def set_on_frame(self, callback: Callable[[Dict[str, float]], None]) -> None:
        self._on_frame = callback

    async def start(self) -> None:
        """Start the serial reader in a background task."""
        if self._running:
            return
        if not self.is_available:
            logger.info("Serial telemetry not available (port=%s)", self.config.port)
            return
        self._running = True
        self._task = asyncio.create_task(self._read_loop())
        logger.info(
            "Serial telemetry reader started on %s @ %d baud",
            self.config.port,
            self.config.baud_rate,
        )

    async def stop(self) -> None:
        """Stop the serial reader."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        self._close_serial()
        self.state = ModemState.DISCONNECTED

    def _close_serial(self) -> None:
        if self._serial and self._serial.is_open:
            try:
                self._serial.close()
            except Exception:
                pass
        self._serial = None

    def _open_serial(self) -> bool:
        try:
            import serial as pyserial

            self._close_serial()
            self.state = ModemState.CONNECTING
            self._serial = pyserial.Serial(
                port=self.config.port,
                baudrate=self.config.baud_rate,
                timeout=self.config.timeout,
                bytesize=pyserial.EIGHTBITS,
                parity=pyserial.PARITY_NONE,
                stopbits=pyserial.STOPBITS_ONE,
            )
            self.state = ModemState.CONNECTED
            logger.info("Serial port %s opened", self.config.port)
            return True
        except Exception as e:
            self.state = ModemState.ERROR
            self._errors += 1
            logger.error("Failed to open serial port %s: %s", self.config.port, e)
            return False

    def _emit_frame(self, channels: Dict[str, float]) -> None:
        """Record stats and invoke callback for a parsed frame."""
        if channels:
            self._last_frame_time = time.time()
            self._frames_received += 1
            if self._on_frame:
                self._on_frame(channels)

    async def _read_loop(self) -> None:
        """Main loop: open serial, read frames, reconnect on failure."""
        loop = asyncio.get_running_loop()
        while self._running:
            if not self._serial or not self._serial.is_open:
                if not self._open_serial():
                    await asyncio.sleep(self.config.reconnect_interval)
                    continue

            try:
                if self.config.data_format == SerialFormat.MOTEC_BINARY:
                    await self._read_binary(loop)
                else:
                    # CSV and auto both read text lines
                    await self._read_csv(loop)
            except asyncio.CancelledError:
                raise
            except Exception as e:
                self._errors += 1
                self.state = ModemState.ERROR
                logger.error("Serial read error: %s", e)
                self._close_serial()
                await asyncio.sleep(self.config.reconnect_interval)

    async def _read_csv(self, loop: asyncio.AbstractEventLoop) -> None:
        """Read CSV text lines from serial."""
        while self._running and self._serial and self._serial.is_open:
            ser = self._serial  # local ref for executor safety
            raw_line = await loop.run_in_executor(None, ser.readline)
            if not raw_line:
                continue
            try:
                line = raw_line.decode("ascii", errors="ignore").strip()
            except Exception:
                continue
            if not line:
                continue
            channels = parse_csv_line(
                line,
                self.config.csv_channel_order,
                self.config.csv_separator,
            )
            self._emit_frame(channels)

    async def _read_binary(self, loop: asyncio.AbstractEventLoop) -> None:
        """Read Motec binary frames from serial, buffering partial frames."""
        buf = b""
        while self._running and self._serial and self._serial.is_open:
            ser = self._serial  # local ref for executor safety
            raw = await loop.run_in_executor(
                None, lambda s=ser: s.read(s.in_waiting or 256)
            )
            if not raw:
                await asyncio.sleep(0.01)
                continue
            buf += raw
            channels, buf = parse_motec_binary_frames(buf)
            self._emit_frame(channels)
            # Prevent unbounded buffer growth from garbage data
            if len(buf) > 4096:
                buf = buf[-256:]

    def update_config(self, **kwargs: object) -> None:
        """Update configuration. Caller should stop/start to apply."""
        for key, value in kwargs.items():
            if hasattr(self.config, key):
                if key == "data_format":
                    value = SerialFormat(value)
                setattr(self.config, key, value)
