# Sugar Dash
For now since only Phase 2 is implemented, this is the flow we have

## 1. Platform & Environment Requirements
Before compiling and running the project, ensure your environment meets the following specifications:
* **Operating System**: macOS, Linux, or Windows 10/11
* **Node.js**: `v20.x` or higher (LTS recommended)
* **Package Manager**: `npm` (`v10.x` or higher)
* **Database**: PostgreSQL (`v14.x` or higher) running locally or hosted (e.g., Supabase / Neon)
* **Git**: `v2.30` or higher (tagged with `phase2` for submission)

## 2. Project Architecture & Directory Structure
The repository is structured to enforce a strict multi-layer separation between the client and server:
* `my-app/client/`: React + Vite frontend application (UI / Presentation Layer)
* `my-app/server/`: Node.js + Express + TypeScript backend
  * `src/domain/`: Pure domain models, enums, and lifecycle invariants (ORD, REG)
  * `src/application/`: Application services, workflows, and session coordination
  * `src/infrastructure/`: Technical services, database connection pool, and repository adapters
  * `src/routes/`: HTTP controllers and session verification gate
  * `config/`: Initial city and seed configuration datasets
    
## 3. Installation & Dependency Setup
Clone the repository and install dependencies for both the backend server and frontend client.
### A. Clone and Checkout Submission Tag
```bash
git checkout
