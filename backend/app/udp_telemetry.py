"""UDP broadcast receiver for WiFi-based telemetry.

Supports a passive, receive-only mode where the car broadcasts telemetry
packets over WiFi and the dashboard simply listens on a UDP port — no
two-way connection or handshake required.

Data chain: Motec CAN -> ECU WiFi broadcaster -> UDP broadcast ->
            this listener -> WebSocket dashboard

Packet formats supported:
  - CSV text (e.g. "speed,rpm,throttle,...\\n")
  - JSON (e.g. {"speed": 42.1, "rpm": 8500, ...})
  - Raw binary (logged for Wireshark-style inspection, user maps fields)
"""

import asyncio
import logging
import os
import time
from collections import deque
from dataclasses import dataclass, field
from enum import Enum
from typing import Callable, Deque, Dict, List, Optional

from .serial_telemetry import parse_csv_line

logger = logging.getLogger(__name__)

MAX_CAPTURE_PACKETS = 200


class UdpPacketFormat(str, Enum):
    CSV = "csv"
    JSON = "json"
    RAW = "raw"
    AUTO = "auto"


class UdpListenerState(str, Enum):
    STOPPED = "stopped"
    LISTENING = "listening"
    RECEIVING = "receiving"
    ERROR = "error"


@dataclass
class CapturedPacket:
    """A single captured UDP packet for inspection."""
    timestamp: float
    source_addr: str
    source_port: int
    size: int
    hex_dump: str
    ascii_preview: str
    parsed_ok: bool
    parsed_channels: Dict[str, float]
    error: str = ""


@dataclass
class UdpBroadcastConfig:
    port: int = 50_000
    bind_address: str = "0.0.0.0"
    packet_format: UdpPacketFormat = UdpPacketFormat.AUTO
    csv_channel_order: List[str] = field(default_factory=lambda: [
        "speed", "rpm", "throttle", "brake_pressure",
        "coolant_temp", "oil_temp", "intake_temp", "exhaust_temp",
        "g_lateral", "g_longitudinal",
        "wheel_fl", "wheel_fr", "wheel_rl", "wheel_rr",
        "battery_voltage",
    ])
    csv_separator: str = ","
    capture_enabled: bool = True

    @classmethod
    def from_env(cls) -> "UdpBroadcastConfig":
        csv_order_env = os.getenv("UDP_CSV_CHANNELS", "")
        csv_channels = (
            [c.strip() for c in csv_order_env.split(",") if c.strip()]
            if csv_order_env
            else None
        )
        try:
            port = int(os.getenv("UDP_PORT", "50000"))
        except (ValueError, TypeError):
            port = 50000
        try:
            fmt = UdpPacketFormat(os.getenv("UDP_PACKET_FORMAT", "auto"))
        except ValueError:
            fmt = UdpPacketFormat.AUTO
        config = cls(
            port=port,
            bind_address=os.getenv("UDP_BIND_ADDRESS", "0.0.0.0"),
            packet_format=fmt,
            csv_separator=os.getenv("UDP_CSV_SEPARATOR", ","),
        )
        if csv_channels:
            config.csv_channel_order = csv_channels
        return config

    def to_dict(self) -> dict:
        return {
            "port": self.port,
            "bind_address": self.bind_address,
            "packet_format": self.packet_format.value,
            "csv_channel_order": self.csv_channel_order,
            "csv_separator": self.csv_separator,
            "capture_enabled": self.capture_enabled,
        }


class _UdpProtocol(asyncio.DatagramProtocol):
    """asyncio datagram protocol that forwards packets to the receiver."""

    def __init__(self, receiver: "UdpBroadcastReceiver") -> None:
        self._receiver = receiver

    def datagram_received(self, data: bytes, addr: tuple) -> None:
        self._receiver._handle_packet(data, addr)

    def error_received(self, exc: Exception) -> None:
        logger.error("UDP protocol error: %s", exc)

    def connection_lost(self, exc: Optional[Exception]) -> None:
        if exc:
            logger.warning("UDP connection lost: %s", exc)


class UdpBroadcastReceiver:
    """Passively listens for UDP broadcast telemetry packets."""

    def __init__(self, config: UdpBroadcastConfig) -> None:
        self.config = config
        self.state = UdpListenerState.STOPPED
        self._transport: Optional[asyncio.DatagramTransport] = None
        self._on_frame: Optional[Callable[[Dict[str, float]], None]] = None
        self._last_frame_time: float = 0
        self._frames_received: int = 0
        self._packets_received: int = 0
        self._errors: int = 0
        self._capture_buffer: Deque[CapturedPacket] = deque(maxlen=MAX_CAPTURE_PACKETS)

    @property
    def is_available(self) -> bool:
        return self.config.port > 0

    def set_on_frame(self, callback: Callable[[Dict[str, float]], None]) -> None:
        self._on_frame = callback

    def status(self) -> dict:
        return {
            "state": self.state.value,
            "port": self.config.port,
            "bind_address": self.config.bind_address,
            "packet_format": self.config.packet_format.value,
            "last_frame_time": self._last_frame_time,
            "frames_received": self._frames_received,
            "packets_received": self._packets_received,
            "errors": self._errors,
            "available": self.is_available,
            "capture_enabled": self.config.capture_enabled,
            "capture_count": len(self._capture_buffer),
        }

    async def start(self) -> None:
        if self._transport is not None:
            return
        if not self.is_available:
            logger.info("UDP broadcast receiver not configured (port=%d)", self.config.port)
            return
        try:
            loop = asyncio.get_running_loop()
            transport, _ = await loop.create_datagram_endpoint(
                lambda: _UdpProtocol(self),
                local_addr=(self.config.bind_address, self.config.port),
                allow_broadcast=True,
            )
            self._transport = transport
            self.state = UdpListenerState.LISTENING
            logger.info(
                "UDP broadcast listener started on %s:%d",
                self.config.bind_address,
                self.config.port,
            )
        except Exception as e:
            self.state = UdpListenerState.ERROR
            self._errors += 1
            logger.error("Failed to start UDP listener: %s", e)

    async def stop(self) -> None:
        if self._transport:
            self._transport.close()
            self._transport = None
        self.state = UdpListenerState.STOPPED
        logger.info("UDP broadcast listener stopped")

    def _handle_packet(self, data: bytes, addr: tuple) -> None:
        """Process a received UDP packet."""
        self._packets_received += 1
        source_addr = addr[0]
        source_port = addr[1]

        # Build hex dump and ASCII preview for capture
        hex_dump = data[:128].hex()
        ascii_preview = data[:128].decode("ascii", errors="replace").replace("\r", "\\r").replace("\n", "\\n")

        channels: Dict[str, float] = {}
        parse_error = ""
        parsed_ok = False

        try:
            channels = self._parse_packet(data)
            parsed_ok = bool(channels)
        except Exception as e:
            parse_error = str(e)
            self._errors += 1

        if self.config.capture_enabled:
            self._capture_buffer.append(CapturedPacket(
                timestamp=time.time(),
                source_addr=source_addr,
                source_port=source_port,
                size=len(data),
                hex_dump=hex_dump,
                ascii_preview=ascii_preview,
                parsed_ok=parsed_ok,
                parsed_channels=channels,
                error=parse_error,
            ))

        if parsed_ok and channels:
            self.state = UdpListenerState.RECEIVING
            self._last_frame_time = time.time()
            self._frames_received += 1
            if self._on_frame:
                self._on_frame(channels)

    def _parse_packet(self, data: bytes) -> Dict[str, float]:
        """Parse a UDP packet based on configured format."""
        fmt = self.config.packet_format

        if fmt == UdpPacketFormat.RAW:
            # Raw mode: capture only, no parsing
            return {}

        text = ""
        try:
            text = data.decode("ascii", errors="ignore").strip()
        except Exception:
            pass

        if fmt == UdpPacketFormat.JSON or (fmt == UdpPacketFormat.AUTO and text.startswith("{")):
            return self._parse_json(text)

        if fmt == UdpPacketFormat.CSV or (fmt == UdpPacketFormat.AUTO and text):
            return self._parse_csv(text)

        return {}

    def _parse_json(self, text: str) -> Dict[str, float]:
        import json
        obj = json.loads(text)
        if not isinstance(obj, dict):
            return {}
        # Accept flat dict of channel->value or nested {"channels": {...}}
        channels = obj.get("channels", obj)
        return {
            k: float(v)
            for k, v in channels.items()
            if isinstance(v, (int, float))
        }

    def _parse_csv(self, text: str) -> Dict[str, float]:
        # Handle multi-line: parse each line, merge
        channels: Dict[str, float] = {}
        for line in text.splitlines():
            line = line.strip()
            if not line:
                continue
            parsed = parse_csv_line(
                line,
                self.config.csv_channel_order,
                self.config.csv_separator,
            )
            channels.update(parsed)
        return channels

    def get_captured_packets(self, limit: int = 50) -> List[dict]:
        packets = list(self._capture_buffer)
        packets.reverse()
        return [
            {
                "timestamp": p.timestamp,
                "source": f"{p.source_addr}:{p.source_port}",
                "size": p.size,
                "hex": p.hex_dump,
                "ascii": p.ascii_preview,
                "parsed_ok": p.parsed_ok,
                "channels": p.parsed_channels,
                "error": p.error,
            }
            for p in packets[:limit]
        ]

    def clear_capture(self) -> None:
        self._capture_buffer.clear()

    def update_config(self, **kwargs: object) -> None:
        for key, value in kwargs.items():
            if hasattr(self.config, key):
                if key == "packet_format":
                    value = UdpPacketFormat(value)
                setattr(self.config, key, value)
