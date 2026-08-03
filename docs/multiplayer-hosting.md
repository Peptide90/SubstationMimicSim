# Multiplayer hosting guide

This document covers the two intended deployment options for the multiplayer server:

- **Self-hosted Docker** for local testing or LAN sessions.
- **Online server (Ubuntu/Docker or Windows Docker Desktop)** for public multiplayer rooms.

The multiplayer server is still a stateless Socket.IO app today. The database and telemetry schema below are optional foundations for the future leaderboard/statistics features.

## Prerequisites

- Docker Desktop (Windows/macOS) or Docker Engine + Compose (Linux).
- Node.js (only needed if you run the server without Docker).

## Local Docker (self-hosted)

1. From the repo root, start the services:

   ```bash
   docker compose up --build
   ```

2. The multiplayer server listens on `http://localhost:3001`.
3. Point the web client at the server:

   ```bash
   # From ./web
   VITE_MP_SERVER_URL=http://localhost:3001 npm run dev
   ```

4. The Postgres service is available on `localhost:5432` with the default credentials from `docker-compose.yml`.

## Online server (Ubuntu or Windows Docker Desktop)

### 1) Prepare environment variables

Copy the example env file and set a strong password:

```bash
cp ops/.env.example .env
```

### 2) Build and run

```bash
docker compose -f docker-compose.prod.yml --env-file .env up --build -d
```

### 3) Configure the web client

Update your hosted web client to target the public multiplayer host:

```bash
VITE_MP_SERVER_URL=https://your-domain-or-ip:3001
```

If you are serving the client from a different domain, ensure that your reverse proxy and HTTPS settings allow WebSocket traffic on port 3001.

## Database & telemetry foundations

- The Docker Postgres service loads `ops/postgres/init.sql` on first boot.
- The schema includes tables for a leaderboard and optional telemetry rollups (see the privacy statement for details).
- You can connect a migration tool later (Prisma, Drizzle, Flyway, etc.) without changing the Docker setup.

## Environment variables (server)

| Variable | Purpose | Default |
| --- | --- | --- |
| `MP_SERVER_PORT` | Socket.IO server port | `3001` |
| `DATABASE_URL` | Postgres connection string | unset |

## Notes for production hardening

- Put the multiplayer server behind an HTTPS reverse proxy (Caddy, Nginx, Traefik) to avoid mixed-content WebSocket issues.
- For Windows Docker Desktop, ensure the Docker daemon is set to Linux containers.
- Consider enabling Postgres backups and setting resource limits for the containers.
