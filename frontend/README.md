# Frontend Notes

The frontend is a Next.js 14 App Router application for the Formula SAE
Dashboard.

For the current project-level setup, deployment, telemetry, and LDX workflow
documentation, use the repository root README:

- [../README.md](../README.md)

Quick local reminder:

```bash
cd frontend
npm install
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev
```

If `NEXT_PUBLIC_API_URL` is omitted, the frontend will
try to call relative `/api` routes which may not exist.
