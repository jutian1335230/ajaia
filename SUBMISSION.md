# Submission: Tony Tian (jt3640@columbia.edu)

## Links

- **Live app:** https://ajaia-docs-zfwp.onrender.com (the first load after a period of inactivity can take about 30 s while the free instance wakes up)
- **Source:** https://github.com/jutian1335230/ajaia
- **Walkthrough video:** https://youtu.be/dkskjSA6tlA

## Test accounts

The password for all accounts is `password123`, and the login page has one-click buttons for each.

- `alice@ajaia.test`: owns a welcome document that is shared with Bob as an editor
- `bob@ajaia.test`: owns a private document
- `carol@ajaia.test`: starts empty; use her to test sharing from scratch

## What's included

| Item | Location |
| --- | --- |
| Source code | `server/` (Express API), `client/` (React app), `scripts/` (e2e smoke test) |
| Setup and run instructions | [`README.md`](README.md) |
| Architecture note | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| AI workflow note | [`AI_WORKFLOW.md`](AI_WORKFLOW.md) |
| Walkthrough video link | [`VIDEO_URL.txt`](VIDEO_URL.txt) |
| Screenshots | [`docs/screenshots/`](docs/screenshots) |
| Automated tests | `server/src/api.test.ts` (`npm test`) and `scripts/e2e-smoke.mjs` (`npm run e2e`) |
| Deployment config | `Dockerfile`, `render.yaml` |

## Status

**Working end to end**

- Create, rename, edit, autosave, reopen, and delete documents, with rich-text formatting preserved after a refresh.
- Import `.txt`, `.md`, or `.docx` as a new document, or insert a file into an existing one.
- Share by email with *Can edit* or *View only* access, change roles, and revoke access. Owned and shared documents are listed separately on the dashboard.
- All permissions are enforced on the server.
- Conflict detection: a stale save is rejected instead of overwriting newer work.
- Viewers see the owner's changes automatically.
- Markdown export.

**Incomplete or intentionally out of scope**

- No real-time co-editing or presence indicators. Concurrent editors are protected by conflict detection rather than merged live.
- No version history or comments.
- Images and tables are not supported in documents or imports.
- Mock authentication only: no sign-up, and sessions never expire.
- On Render's free tier, data resets to the seed data when the instance restarts, because there is no persistent disk.

**Next 2–4 hours:** persistent hosted database, version history with restore, httpOnly session cookies with expiry, then real-time collaboration with Yjs.
