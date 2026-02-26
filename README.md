# SCR Formula SAE Dashboard

A role-based forms and live telemetry system for a Formula SAE team. Users
login, see only their assigned subteam forms, and submit updates. Every change
is recorded with timestamps and user information. The backend watches a folder
for new `.ldx` XML files and injects the latest values into the file's `detail`
section. Live telemetry streams sensor data via WebSocket for real-time
monitoring with configurable charts.

## Features
- Role-based login (admin or subteam roles)
- Config-driven forms (YAML)
- Latest values prefilled on forms
- Audit log of every field change
- Admin dashboard for user management, sensor config, audit table, and LDX files
- LDX watcher that injects current values into new `.ldx` files
- Live telemetry with configurable line, gauge, and numeric charts
- Dynamic sensor management (add/edit/delete telemetry channels)
- WebSocket streaming with auto-reconnect and exponential backoff

## Tech Stack
- **Backend:** FastAPI + SQLModel + SQLite + WebSocket telemetry
- **Frontend:** Next.js 14 (App Router) + shadcn/ui + Tailwind CSS + Recharts + SWR
- **Deployment:** Docker Compose + Caddy reverse proxy

## Prerequisites

- **Local development:** Python 3.11+, Node.js 18+, npm
- **Docker deployment:** Docker and Docker Compose

---

## Quick Start (Local Development)

### 1. Start the Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

Set the required environment variables and start the server:

```bash
export ADMIN_USERNAME=admin
export ADMIN_PASSWORD=admin123
export JWT_SECRET=change-me

uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The API is now running at `http://localhost:8000`. You can verify at `http://localhost:8000/health`.

### 2. Start the Frontend

In a separate terminal:

```bash
cd frontend
npm install
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev
```

Open **http://localhost:3000** in your browser. Login with the admin credentials you set above (`admin` / `admin123`).

### 3. (Optional) Start Telemetry

The telemetry WebSocket endpoint is available at `ws://localhost:8000/ws/telemetry?token=<jwt>`. Any client that sends JSON frames in the format `{"channels": {"sensor_id": value}, "timestamp": unix_seconds}` will broadcast data to all connected dashboard users.

---

## Docker Deployment

### 1. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
DOMAIN=dashboard.yourteam.com    # or "localhost" for local Docker
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your_secure_password
JWT_SECRET=$(openssl rand -hex 32)
ALLOWED_ORIGINS=https://dashboard.yourteam.com
```

### 2. (Optional) Create LDX Directory

```bash
mkdir -p ldx
```

### 3. Build and Run

```bash
docker compose up --build -d
```

### 4. Access the Dashboard

| Service | URL |
|---------|-----|
| Frontend | `http://<host>` (port 80 via Caddy) |
| Backend API | `http://<host>/api` (proxied through Caddy) |

For production with a real domain, Caddy auto-provisions HTTPS via Let's Encrypt.

### First Login

Use the admin credentials from your `.env` file. Change the password after first login.

### Stopping the Dashboard

```bash
docker compose down
```

To stop and remove all data volumes:

```bash
docker compose down -v
```

---

## Roles

Subteam roles: `DAQ`, `Chief`, `suspension`, `electronic`, `drivetrain`,
`driver`, `chasis`, `aero`, `ergo`, `powertrain`.

Admins do not have subteam roles. Non-admin users can have up to two subteam
roles.

## Form Configuration

Forms live in `backend/forms/` as YAML files. Each file maps to a role.

Example (`backend/forms/daq.yaml`):

```yaml
form_name: "DAQ Form"
role: "DAQ"
fields:
  - name: "sampling_rate"
    label: "Sampling Rate (Hz)"
    type: "number"
    required: true
  - name: "notes"
    label: "Notes"
    type: "textarea"
```

Supported field types: `text`, `number`, `textarea`, `select` (with `options`).

Optional field properties:
- `tab` - group fields into named tabs
- `lookback` - show previous run's value alongside current
- `validity_window` - time window (seconds) after which a value is considered stale
- `unix_timestamp` - display raw timestamps in human-readable format

## Environment Variables

| Variable | Where | Description |
|----------|-------|-------------|
| `ADMIN_USERNAME` | Backend | Bootstrap admin username (first run only) |
| `ADMIN_PASSWORD` | Backend | Bootstrap admin password (first run only) |
| `JWT_SECRET` | Backend | Secret for signing JWT tokens |
| `LDX_WATCH_DIR` | Backend | Default watch directory for LDX files |
| `ALLOWED_ORIGINS` | Backend | CORS allowed origins (comma-separated) |
| `DOMAIN` | Caddy | Server domain (`localhost` for local dev) |
| `NEXT_PUBLIC_API_URL` | Frontend | Backend URL (leave empty in Docker; set to `http://localhost:8000` for local dev) |

## Admin Workflow

1. Login as admin.
2. Set the LDX watch directory in the admin dashboard (use `/ldx` in Docker).
3. Create users and assign roles.
4. Configure telemetry sensors under Admin > Sensors.
5. Use the audit table to review recent changes.
6. Admin can open and submit any form with current values prefilled.

## LDX Injection

When a new `.ldx` file appears in the watch directory, the backend injects all
current form values into the file's `detail` section as `<entry>` elements.

## Data Storage

- SQLite DB is stored in `backend/data/app.db` (mounted as a Docker volume).
- Back up the DB by copying this file, or use the Export Database button in Admin > LDX Files.
