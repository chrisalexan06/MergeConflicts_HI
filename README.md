# Sugar Dash
This repository contains the Sugar Dash food delivery application.

**Optional module implemented in Phase IV:** RVW, Ratings & Reviews

## Git Tags
| Tag | What it is |
|---|---|
| `phase3` | Baseline code, measured before any Phase IV change |
| `phase4-refactored` | Phase 3 code after the three refactorings (R1, R2, R3), without RVW |
| `phase4` | Final delivery: refactored code plus the RVW module |

## 1. Platform & Environment Requirements
Before compiling and running the project, ensure your environment meets the following specifications:
| Requirement | Version |
|---|---|
| Operating system | macOS, Linux or Windows 10/11 |
| Node.js | `v20.x` or higher (LTS recommended) |
| Package Manager | `npm` (`v10.x` or higher) |
| Database | PostgreSQL (`v14.x` or higher) running locally or hosted (e.g., Supabase / Neon) |
| Git | `v2.30` or higher |
| Docker (optional) | Docker Engine or Docker Desktop with the `docker compose` plugin |
 
Ports used: **3000** (API server), **5173** (Vite dev server), **8080** (web client in Docker).
 
The client calls the API at `http://localhost:3000`, so the server must run on port 3000 on the same machine as the browser.

## 2. Project Architecture & Directory Structure
The repository is structured to enforce a strict multi-layer separation between the client and server:
```
my-app/
  client/                 React + Vite frontend application (UI / Presentation Layer)
    src/pages/            Dashboards (customer, restaurant, courier, operator)
    src/components/       Login and registration panels
    src/api/              Functions that call the server (including ratings.ts)
    src/ui/               Shared UI pieces (including the rating form)
  server/                 Node.js + Express + TypeScript backend
    config/               Initial city and seed configuration datasets
    src/domain/           Domain models and rules (REG, ORD, DLV, PRC)
    src/application/      Application services, workflows, and session coordination (REG, ORD, DLV, OPR, RAT)
    src/infrastructure/   Technical services, database connection pool, and repository adapters (PostgreSQL)
    src/routes/           HTTP controllers and session verification gate
docs/metrics/             Raw measurement output (see section 7)
docker-compose.yml        Starts the server and the client in containers
DOCKER.md                 Notes on Docker
```

## 4. Run the application
 
Pick **one** option.
 
### Option A: Docker (no `.env` file needed)
 
`DATABASE_URL`, `PORT` and `CLIENT_URL` are set in `docker-compose.yml`.
 
```bash
git clone https://github.com/chrisalexan06/MergeConflicts_HI.git
cd MergeConflicts_HI
git checkout phase4
docker compose up --build
```
 
- Web client: http://localhost:8080
- API: http://localhost:3000
Stop with `Ctrl+C`, or run `docker compose down`. On Linux, if Docker reports "permission denied" on `/var/run/docker.sock`, use `sudo docker compose up --build`. More details in `DOCKER.md`.
 
### Option B: Run locally (development)
 
**1. Install dependencies**:
 
```bash
cd my-app/server
npm install
 
cd ../client
npm install
```
 
**2. Create `my-app/server/.env`:**
 
Create a `.env` file inside `my-app/server/`.

**Important:** Ensure that `.env` and `node_modules/` are included in `.gitignore` to prevent sensitive information and unnecessary dependencies from being committed to Git. `DATABASE_URL` is required. The server stops at startup without it.
 
**3. Start the server**:
 
```bash
cd my-app/server
npm run dev
```
 
**4. Start the client**:
 
```bash
cd my-app/client
npm run dev
```
 
Open the URL (http://localhost:5173).
 
### Production build (without Docker)
 
```bash
cd my-app/server
npm run build
npm start
 
cd ../client
npm run build
```
## 5. Demo accounts
 
The server creates these accounts at startup. All use the password `pass123`.
 
| Role | Username | Email |
|---|---|---|
| Customer | `seed_customer` | cust@montreal.com |
| Restaurant staff | `seed_staff` | staff@montreal.com |
| Courier | `seed_courier` | courier@montreal.com |
| Platform operator | `seed_operator` | op@montreal.com |
 
The operator dashboard has a **Reset** action that restores the initial system state.

## 6. Tests
 
Server tests use Node's built-in test runner through `tsx`.

`DATABASE_URL` must be set (or a `.env` file must exist) because some test files import the database module, which refuses to load without it. The tests do not connect to a real database.

To run a single characterization test file:
 
```bash
npx tsx --test src/infrastructure/order/PostgresOrderStore.test.ts    # Refactoring R1
npx tsx --test src/services/orderService.test.ts                      # Refactoring R2
npx tsx --test src/application/ORD/RestaurantService.test.ts          # Refactoring R3
```

To check the build of each project:
 
```bash
cd my-app/server && npx tsc --noEmit
cd my-app/client && npm run build
```

## 7. Metrics (`docs/metrics`)
 
Code metrics were collected with **Lizard 1.26.1** on TypeScript, over `my-app/server/src` and `my-app/client/src`.
 
| Folder | Snapshot |
|---|---|
| `docs/metrics/phase3/` | Raw output at tag `phase3` |
| `docs/metrics/phase4/` | Raw output at tag `phase4` |
 
Each folder holds the raw Lizard CSV, the class-level inventory, and the exact configuration used. The same tool and settings are used for every snapshot. The comparison table is in the project report.
 
To reproduce a measurement:
 
```bash
pip install lizard==1.26.1
git checkout phase3     # or phase4-refactored, or phase4
python -m lizard -l typescript --csv -V my-app/server/src my-app/client/src
```
