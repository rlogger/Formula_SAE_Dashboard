# Formula SAE Dashboard

Formula SAE Dashboard is a combined forms, LDX injection, and live telemetry
system for a race team. It gives subteams their own role-scoped forms, keeps a
full audit trail of updates, injects the latest configuration values into MoTeC
`.ldx` files, and streams live telemetry into a browser dashboard.

The project is split into a FastAPI backend and a Next.js frontend, with SQLite
used for persistence.

## Current Capabilities

- Role-based authentication for admin and subteam users
- YAML-driven form definitions with current values prefilled
- Audit logging for every form field change
- Admin UI for users, sensors, telemetry configuration, audit history, and LDX
  file management
- Automatic LDX watching and value injection for new `.ldx` files
- Manual LDX reinjection from stored injection history
- Automatic LDX verification and recovery when injected values are removed by a
  later MoTeC rewrite
- Live telemetry dashboard with line, gauge, and numeric widgets
- Telemetry source selection across simulated, serial modem, and UDP broadcast
  inputs
- Sensor/channel management from the admin UI

## Stack

- Backend: FastAPI, SQLModel, SQLite, WebSockets
- Frontend: Next.js 14 App Router, React 18, Tailwind CSS, shadcn/ui, SWR,
  Recharts
- Deployment: Docker Compose
- Telemetry inputs: simulated generator, Digi Bee SX serial bridge, passive UDP
  broadcast listener

## System Overview

1. The Next.js frontend calls the FastAPI backend over REST and connects to live
   telemetry over WebSocket.
2. The backend stores users, roles, form values, audit logs, sensor
   configuration, LDX file history, and injection history in SQLite.
3. The LDX watcher scans the configured watch directory for new `.ldx` files,
   injects values into them, and records exactly what was written.
4. A second verification task re-checks tracked `.ldx` files and restores
   missing injected values if a later rewrite removes them.
5. The telemetry source manager chooses between serial, UDP broadcast, or
   simulated telemetry and publishes frames to connected dashboard clients.

## Roles

The backend currently supports these role names:

- `DAQ`
- `Chief`
- `suspension`
- `electronic`
- `drivetrain`
- `driver`
- `chasis`
- `aero`
- `ergo`
- `powertrain`

Admins do not need subteam roles. Non-admin users can be assigned up to two
roles.

## Local Development

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Set the minimum required environment variables and start the API:

```bash
export ADMIN_USERNAME=admin
export ADMIN_PASSWORD=admin123
export JWT_SECRET=$(openssl rand -hex 32)

uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The backend will be available at:

- API: `http://localhost:8000`
- Health check: `http://localhost:8000/health`
- OpenAPI docs: `http://localhost:8000/docs`

### Frontend

In a second terminal:

```bash
cd frontend
npm install
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev
```

The frontend will be available at `http://localhost:3000`.

For local development, `NEXT_PUBLIC_API_URL` should point directly at the
FastAPI server.

### First Login

Log in with the admin credentials defined in your backend environment.

### Optional Nix Workflow

If you use the provided Nix shell and helper aliases, see
[`DEV_SETUP.md`](DEV_SETUP.md).

## Docker Deployment

### 1. Create the runtime config

```bash
cp .env.example .env
```

For a local Docker run, the important values are usually:

```env
DOMAIN=localhost
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change_this_password_123
JWT_SECRET=<generate-a-secure-value>
ALLOWED_ORIGINS=http://localhost
NEXT_PUBLIC_API_URL=
```

`NEXT_PUBLIC_API_URL` should point to the backend API address,
e.g. `http://localhost:8000`.

### 2. Create the LDX directory

```bash
mkdir -p ldx
```

The Docker backend mounts that folder at `/ldx` and uses it as the default LDX
watch directory.

### 3. Build and run

```bash
docker compose up --build -d
```

### 4. Access the app

| Surface | URL |
| --- | --- |
| Dashboard | `http://localhost:3000` |
| Backend API | `http://localhost:8000` |
| Backend health check | `http://localhost:8000/health` |
| UDP telemetry listener | `udp://<host>:50000` by default |

### 5. Stop the stack

```bash
docker compose down
```

To remove persistent container state as well:

```bash
docker compose down -v
```

## Environment Variables

These are the main runtime knobs used by the current codebase.

| Variable | Used By | Default | Notes |
| --- | --- | --- | --- |
| `ADMIN_USERNAME` | backend | none | Required. Admin account username applied at startup. |
| `ADMIN_PASSWORD` | backend | none | Required. Admin account password applied at startup. |
| `JWT_SECRET` | backend | none | Required. Used to sign auth tokens. |
| `JWT_EXPIRE_MINUTES` | backend | `720` | Token lifetime in minutes. |
| `ALLOWED_ORIGINS` | backend | `http://localhost:8080,http://localhost:5173,http://localhost:3000` | CORS allowlist for direct backend access. |
| `DATA_DIR` | backend | `backend/data` | Base directory for SQLite storage when `DATABASE_URL` is not set. |
| `DATABASE_URL` | backend | SQLite in `DATA_DIR` | Override the default database location. |
| `FORMS_DIR` | backend | `backend/forms` | Override the form schema directory. |
| `LDX_WATCH_DIR` | backend | unset | Default LDX watch directory before an admin saves one in the UI. |
| `LDX_VERIFY_INTERVAL_SECONDS` | backend | `60` | How often the backend re-checks tracked `.ldx` files for missing injected values. |
| `NEXT_PUBLIC_API_URL` | frontend | `http://localhost:8000` | Backend API URL for the frontend. |
| `TELEMETRY_SOURCE` | backend | `auto` | One of `auto`, `serial`, `udp_broadcast`, or `simulated`. |
| `SERIAL_PORT` | backend | empty | Serial device path for the Digi Bee SX receiver. |
| `SERIAL_BAUD` | backend | `9600` | Serial baud rate. |
| `SERIAL_FORMAT` | backend | `csv` | One of `csv`, `motec_binary`, or `auto`. |
| `SERIAL_TIMEOUT` | backend | `2.0` | Serial read timeout in seconds. |
| `SERIAL_RECONNECT` | backend | `5.0` | Serial reconnect interval in seconds. |
| `SERIAL_CSV_CHANNELS` | backend | built-in list | Optional comma-separated channel order for CSV serial frames. |
| `SERIAL_CSV_SEPARATOR` | backend | `,` | CSV separator for serial frames. |
| `UDP_PORT` | backend | `50000` | UDP listener port. Also exposed by Docker Compose. |
| `UDP_BIND_ADDRESS` | backend | `0.0.0.0` | Bind address for UDP telemetry. |
| `UDP_PACKET_FORMAT` | backend | `auto` | One of `csv`, `json`, `raw`, or `auto`. |
| `UDP_CSV_CHANNELS` | backend | built-in list | Optional comma-separated channel order for CSV UDP frames. |
| `UDP_CSV_SEPARATOR` | backend | `,` | CSV separator for UDP frames. |

If you are starting with Docker, `.env.example` is the best reference because
it already reflects the expected production-style wiring for the
frontend, backend, and telemetry inputs.

## Form Schema

Form definitions live in `backend/forms/` and are loaded from YAML. Each file
maps to one subteam role.

Example:

```yaml
form_name: "Aero"
role: "aero"
fields:
  - name: "rear_element_2_position"
    label: "Rear Element 2 Position"
    type: "number"
    unit: "deg"
  - name: "rake_id"
    label: "Rake ID"
    type: "text"
  - name: "notes"
    label: "Notes"
    type: "textarea"
```

Supported field types:

- `text`
- `number`
- `textarea`
- `select`

Common field properties:

- `required`
- `options`
- `placeholder`
- `unit`
- `tab`
- `lookback`
- `validity_window`

## Admin Workflow

The admin area is the operational hub of the app. A typical setup flow is:

1. Log in with the configured admin account.
2. Open `Admin > LDX` and set the watch directory that contains `.ldx` files.
3. Create users and assign their subteam roles.
4. Open `Admin > Sensors` to review or customize telemetry channels.
5. Open `Admin > Modem` to choose the active telemetry source and configure
   serial or UDP input settings.
6. Use `Admin > Audit` to review changes and `Admin > LDX` to export the
   database before any destructive cleanup.

## LDX Lifecycle

The current LDX pipeline behaves like this:

- The watcher scans the configured watch directory for new `.ldx` files every 5
  seconds.
- When a new file is detected, the backend injects the latest stored form
  values.
- Text values are written as `Layers/Details/String` entries.
- Numeric values are written as `Maths/MathConstants/MathConstant` entries.
- Each injected value is recorded in `InjectionLog`, including the exact value
  written and where it was written.
- `Admin > LDX` shows tracked files, per-file injection history, aggregate
  counts, database export, and data-clear actions.
- The `Reinject Values` action replays the stored injection history for one file
  instead of pulling newer values from the database.
- A verification loop runs every `LDX_VERIFY_INTERVAL_SECONDS` seconds
  (60 seconds by default) and restores missing injected values if a later MoTeC
  rewrite removes them.

## Telemetry Operations

Telemetry can come from multiple sources:

- `auto`: prefer serial if connected, then UDP broadcast, otherwise simulated
- `serial`: Digi Bee SX or another serial bridge feeding the backend
- `udp_broadcast`: passive WiFi listener on the configured UDP port
- `simulated`: generated data for testing and demos

Useful operational notes:

- `Admin > Modem` lets admins switch sources, save serial settings, save UDP
  settings, restart listeners, and inspect captured UDP packets.
- UDP packet capture is useful when onboarding a new WiFi telemetry format. Set
  the UDP format to `raw` or `auto`, inspect traffic in the UI, then tighten the
  parser configuration once packet structure is clear.
- The live dashboard reads channel metadata from the backend and connects to
  WebSocket telemetry at `/ws/telemetry?token=<jwt>` under the current API base.
- In Docker, the frontend connects to the backend API via the
  `NEXT_PUBLIC_API_URL` environment variable.

## Troubleshooting

- If the frontend loads but API requests fail in local development, verify that
  `NEXT_PUBLIC_API_URL=http://localhost:8000` is set when running `npm run dev`.
- If no `.ldx` files appear in the admin page, confirm the watch directory is
  set in `Admin > LDX`, the files end in `.ldx`, and the backend process can
  read that directory.
- If telemetry stays on simulated data in `auto` mode, check `Admin > Modem`
  for the serial connection state and UDP listener state.
- If a packet source is new or undocumented, start with UDP capture in `raw` or
  `auto` mode before committing to a parsing format.
- Before using `Clear Data`, export the database from `Admin > LDX` so audit
  logs, form values, and injection history are preserved.

## Repository Layout

```text
Formula_SAE_Dashboard/
├── backend/
│   ├── app/
│   ├── forms/
│   ├── tests/
│   └── requirements.txt
├── frontend/
│   ├── src/
│   ├── public/
│   └── package.json
├── docker-compose.yml
├── DEV_SETUP.md
└── README.md
```
