# Formula SAE Dashboard

Formula SAE Dashboard is a combined forms, LDX injection, and live telemetry
system for a race team. It gives subteams their own role-scoped forms, keeps a
full audit trail of updates, injects the latest configuration values into MoTeC
`.ldx` files, and streams live telemetry into a browser dashboard.

The project is split into a FastAPI backend and a Next.js frontend, with SQLite
used for persistence and Caddy used as the reverse proxy in Docker deployments.

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
- Deployment: Docker Compose, Caddy
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

`NEXT_PUBLIC_API_URL` should stay empty when the frontend is served behind
Caddy, because the app uses relative `/api` requests in that mode.

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
| Dashboard | `http://localhost` |
| Backend API through Caddy | `http://localhost/api` |
| Backend health check through Caddy | `http://localhost/api/health` |
| UDP telemetry listener | `udp://<host>:50000` by default |

### 5. Stop the stack

```bash
docker compose down
```

To remove persistent container state as well:

```bash
docker compose down -v
```

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
├── Caddyfile
├── DEV_SETUP.md
└── README.md
```
