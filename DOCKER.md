# Run Sugar Dash with Docker Compose

Compose builds the production client and backend as separate containers. The server's `DATABASE_URL`, `PORT`, and `CLIENT_URL` are set directly in `docker-compose.yml` and passed to the container at runtime. The TA does not need a separate `.env` file.

1. Ensure the database referenced by `DATABASE_URL` is accessible to the TA and already has the Sugar Dash schema. Startup seeders populate city data and demo accounts, but this repository does not include schema migrations or create tables.
2. From the repository root, run:

   ```bash
   docker compose up --build
   ```

3. Open [http://localhost:8080](http://localhost:8080). The API is available at [http://localhost:3000](http://localhost:3000).

Stop the containers with `Ctrl+C`, or run `docker compose down` in another terminal. PostgreSQL is external to Compose, so these containers do not own or delete database data.

The database URL is now part of the submitted Compose file so the TA can start the app without creating an `.env` file. Anyone who can read that file can use the configured database credentials; restrict access to the repository and rotate the credential after the evaluation if appropriate. The URL is passed at container runtime and is not copied into the image during its build.

## Linux: Docker socket permission denied

If Docker reports `permission denied` for `/var/run/docker.sock`, run Compose with sudo:

```bash
sudo docker compose up --build
```

To stop it from another terminal, use `sudo docker compose down`. If the TA cannot use sudo, their system administrator must grant their account Docker access (for example, by adding it to the `docker` group); they must then sign out and back in before retrying.
