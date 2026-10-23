# yoDeals backend

The frontend in `frontend/index.html` talks to an Express API. The API uses Prisma ORM with PostgreSQL for persistent data.

## Requirements

- Node.js 22.18 or newer
- PostgreSQL 14 or newer
- VS Code (recommended)

## Run the backend

From PowerShell:

```powershell
cd .\backend
npm install
```

Set `DATABASE_URL` and a random `JWT_SECRET` of at least 32 characters in `backend/.env`. Do not share or commit `.env`.

Generate Prisma Client and start the API:

```powershell
npm run db:generate
npm run dev
```

The API runs at `http://localhost:4000`. Check `http://localhost:4000/api/health`; it should report `"status":"ok"` and `"database":"connected"`.

## Database and migrations

The current PostgreSQL database was introspected into `backend/prisma/schema.prisma` and baselined with Prisma Migrate. Existing tables and data were preserved.

For a **new, empty database**, create the database, set its connection string in `.env`, and run:

```powershell
npm run db:migrate:deploy
npm run db:generate
```

For a database that already has the old SQL schema, do not run the baseline migration SQL again. Baseline that database once by marking these migrations as already applied:

```powershell
npx prisma migrate resolve --applied 20261023000000_init
npx prisma migrate resolve --applied 20261023010000_catalog
```

Use `npm run db:migrate:status` to inspect migration state and `npm run db:studio` to open Prisma Studio. Use `npm run db:pull` only when intentionally re-introspecting database changes made outside Prisma; it can rewrite the Prisma schema.

The migration SQL retains PostgreSQL check constraints that Prisma introspection does not represent in the Prisma model.

## Serve the frontend

For local development, serve the `frontend` folder with VS Code Live Server or another static file server. The frontend automatically talks to `http://localhost:4000/api` when opened locally. The backend allowlist defaults to `http://localhost:5500` and `http://127.0.0.1:5500`; if Live Server uses another port, add that origin to `FRONTEND_ORIGIN` in `backend/.env` and restart the API.

In the Render deployment below, the Node service serves the frontend and API from the same origin, so no separate frontend URL or API URL setting is needed.

## Connected workflows

- School registration, login, and current-user lookup use Prisma and PostgreSQL.
- Product catalog, categories, packages, pricing tiers, and the logo fee load from PostgreSQL through the API.
- Order submission re-prices products on the server, then stores the order and audit event in a Prisma transaction.
- Invoice-financing requests are stored for review; submission is not credit approval or a binding offer.
- Catalog seeding uses Prisma: `npm run db:seed:catalog` (add `-- --dry` to preview counts).

## Prepare a shareable Render demo

The root `render.yaml` defines a single Node service that serves both the frontend and `/api`, plus a managed PostgreSQL database. On deploy, the API runs Prisma migrations and seeds the catalog only when the products table is empty. The frontend automatically uses the same origin for the deployed API.

1. Create a **private** GitHub repository and push this project folder. The root `.gitignore` excludes `.env`, dependencies, generated Prisma client files, and local backup copies.
2. In Render, choose **New → Blueprint**, connect the repository, and apply `render.yaml`.
3. Wait for the service to deploy, then open its `onrender.com` URL. Check `/api/health`; it should report `"database":"connected"`.
4. Share the service's frontend URL with your client.

The Blueprint uses Render's free plans for a short demo. Free web services sleep after 15 minutes idle, and free PostgreSQL databases expire after 30 days. The hosted database starts empty: the catalog is seeded automatically, but local accounts, orders, and financing requests are not copied. Upgrade the API and database before relying on the service or storing real customer data. Render's pre-deploy migration command requires a paid service plan, so this demo runs migrations at startup. For a paid production deployment, move `prisma migrate deploy` to a pre-deploy command.

## Before production

- The frontend retains a built-in catalog fallback when the API is unavailable.
- Other dashboard sections such as payments, documents, and team management still need their own persistent API workflows.
- The account token is stored in browser local storage in this prototype. Before public production launch, use secure, HttpOnly cookies with CSRF protection, HTTPS, production secrets, backups, monitoring, and a security review.
- This project does not move money. MTN MoMo/Airtel Money integration requires approved merchant credentials and verified provider callbacks.
- Do not advertise financing as approved or binding until the client/lender has approved rates, eligibility, deposits, fees, repayment terms, and legal disclosures.
- Never expose PostgreSQL directly to the browser. The deployed Express service serves the frontend and API from one origin.
