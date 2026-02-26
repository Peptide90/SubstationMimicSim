# Substation Mimic Sim

This project was started by Jordan Taylor (@TheElectricBrit) as an educational resource for creation high voltage single line mimic diagrams for use in teaching and media production.

You can access the live version online here:

Planned features include:

- [ ] Drag and Drop component library
- [ ] System for connecting components
- [ ] Component state changing by clicking
- [ ] Simple power flow simulation from source to load with respect to component state

Advanced planned features:

- [ ] Interlocking rules to have sequence of operation of switchgear
- [ ] Tagging to allow group operation of equipment
- [ ] Library of example mimics
- [ ] Automatic labelling of equipment (toggleable and schema selector e.g. BP109, IEC, etc)
- [ ] Better control panel UI/UX
- [ ] Control panel event log (SCADA like)

## How to Build

## How to Run Locally (Multiplayer MVP)

From the `web/` directory (recommended so the server can reuse the same node_modules):

```bash
npm install
npm run dev:client
```

To start the multiplayer server in a separate terminal (this script will ensure the server dependencies are installed):

```bash
npm run dev:server
```

If you prefer running the server directly from the `server/` directory instead:

```bash
cd server
npm install
npm run dev
```

Or run both together:

```bash
npm install
npm run dev:mp
```

By default, the multiplayer server listens on `http://localhost:3001`. Set `VITE_MP_SERVER_URL` to point the client at a different endpoint if needed.

## Hosting & Telemetry (Docker-ready)

- [Multiplayer hosting guide](docs/multiplayer-hosting.md)
- [Telemetry & privacy statement](docs/telemetry-privacy.md)
