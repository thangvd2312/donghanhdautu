# Holding voice simulation — 2026-10-28

## Purpose

Exercises the real HoldingDraftsController/Service, Anthropic SDK streaming, auth, quota and existing batch import against PostgreSQL. The single LLM member is a locally authored protocol fixture based on the installed SDK's Messages stream. No owner workspace was searched; this repository has no Postman workspace binding and the test requires no cloud account. The fixture is not evidence of model extraction accuracy.

## Execution

From the repository root, start the mock in a separate terminal (CLI 1.74.0 verified):

```sh
postman simulation run postman/simulations/holding-voice.sim.yaml --port 4917 --output ndjson > /tmp/dautu-voice-simulation.ndjson 2> /tmp/dautu-voice-simulation.err
```

Create a dedicated database once, then build and run (local Docker credentials from `.env.example`):

```sh
docker exec dautu-postgres createdb -U dautu dautu_voice_e2e
cd backend
DATABASE_URL=postgresql://dautu:dautu@localhost:5434/dautu_voice_e2e npx prisma migrate deploy
npm run build:contracts
npx tsc -p tsconfig.build.json --outDir /tmp/dautu-voice-build --incremental false
cd ../frontend
npx vite build --outDir /tmp/dautu-voice-web --emptyOutDir
cd ../backend
NODE_PATH="$PWD/node_modules" DATABASE_URL=postgresql://dautu:dautu@localhost:5434/dautu_voice_e2e LLM_BASE_URL=http://127.0.0.1:4917/llm LLM_API_KEY=local-simulation LLM_MODEL_FAST=fixture VOICE_TEST_BUILD=/tmp/dautu-voice-build VOICE_TEST_WEB=/tmp/dautu-voice-web node scripts/check-voice-holdings.cjs
```

The script starts an ephemeral local HTTP server, creates synthetic users, exercises it and a WebKit mobile page, then closes the server and deletes those users. It emits PASS only after all assertions pass. Inspect `request` events in the log for `/v1/messages`; stop the simulation with Ctrl-C in its terminal. Screenshots are `/tmp/dautu-voice-review.png` and `/tmp/dautu-voice-preview.png`.

## Assumptions

- 2026-10-28: compiled backend outside the repo needs `NODE_PATH` to resolve installed packages. WebKit must be installed for Playwright.
- Market lookup and surrounding portfolio-page reads use fixtures; the changed endpoint, JWT guard, validation, AI usage reservation, streaming client, import preview/commit/undo and PostgreSQL are real. The microphone is a browser API fixture. No actual audio, live model, or real market provider is tested.
- This fixture returns a fixed cash extraction for normal text, malformed JSON structure for `MALFORMED`, and HTTP 400 for `UPSTREAM_ERROR`. It checks client/error behavior, not language comprehension.

## Observations

- 2026-10-28 (final UI): repeated the full run after replacing the mobile table with amount/unit cards; passed again. All four new calls reached `holding-llm` (three HTTP 200 streams, one HTTP 400); no silent members. Final screenshots visually checked at 375px.
- 2026-10-28: four calls reached the only member `holding-llm` (three HTTP 200 streams, one HTTP 400); no silent members. Auth/DTO rejection, invalid model output, upstream failure, quota, foreign-portfolio rejection, read-only draft/preview, mobile mic/edit/confirm, idempotent replay and undo passed with PostgreSQL.

## What didn't work

- 2026-10-28: CLI 1.74.0 rejected a directory in simulation `path` with “must point to a file”; using the mock's `config.yaml` fixed startup.
