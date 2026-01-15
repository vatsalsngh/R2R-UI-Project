# Development roadmap

This document tracks active work items for the dev branch.

## TODO

- [ ] Choose UI stack (Vite + React, Next.js, or plain HTML/CSS/JS)
- [ ] Initialize project scaffolding
- [ ] Set up linting/formatting (ESLint, Prettier)
- [ ] Add CI (GitHub Actions)
- [ ] Write a minimal home page

## Branching

- Main: stable, protected. Dev work merges via PRs.
- Dev: active development branch (this branch).

## Collabora Online (WOPI) setup

For full in-browser Office editing/preview, run Collabora Online and the local WOPI host in the API server.

1) Start Collabora:
	- docker compose -f docker-compose.collabora.yml up -d

2) Start the API server (WOPI host):
	- cd server
	- npm run start

3) Open the Delivery Enablers page and click Open.

Notes:
- WOPI token default is dev-token. Override with WOPI_TOKEN env var and set window.R2R_WOPI_TOKEN accordingly.
- Collabora base defaults to http://localhost:9980. Override with window.R2R_COLLABORA_BASE.
- WOPI base defaults to API base with localhost replaced by host.docker.internal. Override with window.R2R_WOPI_BASE.
