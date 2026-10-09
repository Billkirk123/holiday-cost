# The Holiday calculator

A TypeScript monorepo for planning holiday costs, with a React web app, a Node.js
API, and PostgreSQL.

## Prerequisites

- Node.js 20 or newer and npm
- Docker Desktop (or another Docker Compose-compatible runtime)

## Get started

```sh
npm install
docker compose up -d db
```

Copy `apps/api/.env.example` to `apps/api/.env`, then start the API and web app:

```sh
npm run dev
```

Open the Vite URL printed in the terminal (normally `http://localhost:5173`).
The API runs on `http://localhost:3001`; its `/api/health` endpoint also checks
the PostgreSQL connection. The API creates its tables on startup.

Register with an email and password, create a trip, set its currency and number
of travellers, then add manually entered expenses. Trip totals and the rounded
per-person share update automatically. Expenses and totals are stored in the
trip's currency. Individual expenses can be entered in other supported
currencies; the original amount and the daily Frankfurter conversion rate are
saved with each expense. Database schema migrations run automatically when the
API starts. The trip detail view can also display all amounts in another
currency. These are reference-rate estimates, not live trading rates. Scraped
prices are not part of V1.

To stop the database, run `docker compose down`. Its data is kept in a named
volume; use `docker compose down -v` only when you want to delete that local
database data.

## Scripts

- `npm run dev` — start the API and web app together
- `npm run build` — build all workspaces
- `npm run typecheck` — type-check all workspaces

## Repository layout

```text
apps/
  api/       Node.js + Express API
  web/       React + Vite frontend
packages/
  shared/    Types shared between the API and frontend
apps/api/migrations/
             PostgreSQL schema
docker-compose.yml
```
