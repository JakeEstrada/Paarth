# Paarth (Liminnality)

Operations CRM for San Clemente Woodworking — pipeline jobs, customers, calendar, tasks, finance, payroll, and messaging.

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React 19, Vite, Material UI, React Router, Axios, Socket.IO client |
| Backend | Node.js, Express 5, Mongoose, JWT auth, Socket.IO |
| Database | MongoDB (multi-tenant) |
| Files | Local disk or AWS S3 (production) |

## Repository layout

```
Paarth/
├── frontend/          React SPA (pages, components, hooks)
├── backend/           Express API (routes → controllers → models)
├── docs/              Human-readable codebase documentation (start here)
├── local-crm/         Liminnality Lite reference (SQLite schema + spec only)
├── documents/         Deployment and feature notes
└── scripts/           Device integrations (e.g. Raspberry Pi RFID)
```

## Quick start

```bash
# Backend
cd backend && npm install && npm run dev

# Frontend (separate terminal)
cd frontend && npm install && npm run dev
```

Set `VITE_API_URL` in `frontend/.env` and MongoDB + JWT vars in `backend/.env`.

## Documentation

| Doc | Contents |
|-----|----------|
| [docs/CODEBASE.md](docs/CODEBASE.md) | Architecture, auth, tenants, conventions |
| [docs/PAGES.md](docs/PAGES.md) | Every page: route, purpose, APIs, key logic |
| [docs/BACKEND.md](docs/BACKEND.md) | REST routes and controllers |
| [docs/COMPONENTS.md](docs/COMPONENTS.md) | Shared UI building blocks |
| [docs/CLEANUP.md](docs/CLEANUP.md) | Dead code removed and redirect map |

Each page file under `frontend/src/pages/` has a short header comment pointing to `docs/PAGES.md`.

## Related

- **Liminnality Lite** (desktop, SQLite): see `local-crm/Liminnality.md` — separate product, do not mix with this deploy.
