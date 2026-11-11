# Ajaia Docs

A lightweight collaborative document editor: create and format documents in the browser, import files, and share with other users as editors or viewers.

**Live demo:** _TODO: add deployed URL_

## Demo accounts

All accounts use the password **`password123`**. The login page also has one-click buttons for each.

| User         | Email              | Seeded data                                          |
| ------------ | ------------------ | ---------------------------------------------------- |
| Alice Chen   | `alice@ajaia.test` | Owns "Welcome to Ajaia Docs" (shared with Bob as editor) |
| Bob Martinez | `bob@ajaia.test`   | Owns "Bob's meeting notes" (not shared)              |
| Carol Singh  | `carol@ajaia.test` | Nothing yet. Use her to test sharing from scratch   |

To try sharing, open a second browser or a private window so you can be signed in as two users at once.

## Features

- **Documents:** create, rename (click the title), edit, delete (owner only). Changes autosave about 0.8 s after you stop typing, and a status indicator shows Saving, Saved, or Failed with a retry link.
- **Rich text:** bold, italic, underline, strikethrough, headings (H1–H3), bulleted and numbered lists, quotes, code blocks, and undo/redo. Standard shortcuts work (Ctrl+B, Ctrl+I, Ctrl+U).
- **File upload:** supports **`.txt`, `.md`, and `.docx`, up to 5 MB**.
  - On the dashboard, **Import file** turns a file into a new editable document.
  - In the editor, **Insert file** inserts a file's contents at the cursor.
  - Other file types are rejected with a clear error. `.docx` import keeps headings, bold, italic, underline, and lists; images and tables are dropped.
- **Sharing:** the owner shares by email with either *Can edit* or *View only* access, can change a person's role, and can revoke access.
  - The dashboard splits documents into **My documents** and **Shared with me**, with role badges.
  - Viewers get a read-only editor that refreshes automatically when the owner makes changes.
- **Conflict safety:** if two editors change the same document, a save based on an older version is rejected with a "reload" banner instead of silently overwriting the other person's work.
- **Export:** download any document as Markdown.

## Run locally

Requires **Node.js 20+**.

```bash
npm install
npm run dev
```

- App: http://localhost:5173 (Vite dev server; it proxies `/api` to the backend)
- API: http://localhost:3001

The SQLite database is created and seeded automatically at `data/app.db`. Delete that file to reset to the seed data.

### Production build

```bash
npm run build
npm start          # serves the API and built frontend on http://localhost:3001
```

### Tests

```bash
npm test           # API integration tests (Vitest + Supertest, in-memory SQLite)
npm run typecheck
npm run e2e        # browser smoke test; needs `npm start` running and Edge or Chrome installed
```

- The **API tests** cover authentication, create/rename/edit/reopen with formatting preserved, HTML sanitization, input validation, the full sharing permission matrix (owner, editor, viewer, unshared, revoked), conflict detection, and file import.
- The **e2e script** drives a real browser through the main flows and writes screenshots to `docs/screenshots/`. Set `E2E_BROWSER=chrome` to use Chrome instead of Edge, or `E2E_BASE_URL` to point it at a deployed instance.

### Configuration

| Variable        | Default       | Purpose                  |
| --------------- | ------------- | ------------------------ |
| `PORT`          | `3001`        | HTTP port                |
| `DATABASE_PATH` | `data/app.db` | SQLite file location     |

## Deployment

The app ships as a single Docker container that serves both the API and the frontend (see `Dockerfile`).

- **Render:** `render.yaml` is included. Create a new Blueprint from the repo and it deploys on the free plan.
  - Render's free plan has no persistent disk, so documents are reset to the seed data whenever the instance restarts. Instances also sleep after about 15 minutes idle, and the first request after that takes around 30 s.
  - Data does persist across page refreshes and between users while the instance is running.
  - To keep data permanently, attach a disk at `/data` (see the comment in `render.yaml`).
- **Railway or Fly.io:** deploy the Dockerfile and mount a volume at `/data` for durable storage.

## Project layout

```
server/src/
  app.ts          Express app wiring (also used by the tests)
  db.ts           SQLite schema and seed data
  auth.ts         Login, sessions, auth middleware
  documents.ts    Document CRUD, sharing, import endpoints, access checks
  convert.ts      .txt / .md / .docx to sanitized HTML
  api.test.ts     API integration tests
client/src/
  pages/          Login, Dashboard, Editor
  components/     Toolbar, ShareDialog, Header
  useAutosave.ts  Debounced, serialized autosave with conflict detection
scripts/e2e-smoke.mjs   Browser smoke test
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for design decisions and [AI_WORKFLOW.md](AI_WORKFLOW.md) for how AI tools were used.
