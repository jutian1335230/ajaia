# Architecture Note

## Shape of the system

```
Browser (React + TipTap)  ──HTTP/JSON──▶  Express API  ──▶  SQLite (better-sqlite3)
         ▲                                     │
         └──────── static files ───────────────┘   (one process, one container)
```

- **Frontend:** React 18, Vite, React Router, and TipTap (built on ProseMirror) for the editor. Plain CSS.
- **Backend:** Express and TypeScript. Zod validates every request body, multer handles uploads, mammoth converts `.docx`, marked converts Markdown, and sanitize-html cleans all stored HTML.
- **Storage:** SQLite with four tables: `users`, `sessions`, `documents`, and `document_shares (document_id, user_id, role)`.

One process serves both the API and the built frontend. That means one deploy target, no CORS setup, and a reviewer can run everything with `npm install && npm run dev`.

## What I prioritized and why

The prompt asks for depth over breadth, so I put the effort into making the **core loop reliable**: write, format, save, share, and come back later to find it intact.

1. **The editor has to feel trustworthy.**
   - TipTap gives correct rich-text behavior (selection, lists, undo, keyboard shortcuts) without me hand-rolling a `contentEditable` editor, which is the classic way to burn hours.
   - Autosave is debounced and *serialized*: only one save request is in flight at a time, and edits made during a save are merged into the next one. That avoids out-of-order writes.
   - The save status (Saving, Saved, Failed with retry) is always visible, and the browser warns before you close a tab with unsaved changes.
2. **Access control lives on the server.**
   - Every document route goes through one function, `loadWithRole()`, which returns `owner`, `editor`, or `viewer`, or throws a 404.
   - Unshared documents return 404 rather than 403, so their IDs don't leak.
   - The UI hides controls based on role, but the server enforces everything, and the tests check every role against every action.
3. **Shared documents shouldn't lose work.**
   - Real-time co-editing (CRDTs or operational transforms, plus WebSockets) is too big for this timebox. Last-write-wins, though, would silently delete a collaborator's edits.
   - I used **optimistic concurrency** instead: every save sends the `updatedAt` value the client last saw, and the server rejects stale writes with a 409. The editor then locks and asks the user to reload.
   - Viewers poll every 5 s so they see the owner's changes without refreshing.
4. **File upload is something a user would actually do.** Importing `.txt`, `.md`, or `.docx` creates a new document, and "Insert file" adds a file's contents into the current draft. Conversion happens on the server, and the output goes through the same sanitizer as normal saves.

## Key decisions

| Decision | Why | Tradeoff |
| --- | --- | --- |
| Store content as **sanitized HTML** | TipTap reads and writes HTML natively, and every import format converts to HTML. One representation for editing, importing, and exporting. A strict tag allowlist protects against stored XSS. | Less structured than ProseMirror JSON. Fine for this scope. |
| **SQLite** | Zero setup for reviewers, synchronous API, real SQL with foreign keys and cascades. | Writes come from a single machine, and free hosts with ephemeral disks reset the data (documented in the README). The data layer is small, so moving to Postgres would be easy. |
| **Mock auth** (seeded users, bcrypt-hashed passwords, random bearer tokens stored in `sessions`) | Shows a real auth boundary without building sign-up or password reset. | No registration, and sessions never expire. |
| **Bearer token in localStorage**, not a cookie | Avoids needing CSRF protection. | Readable by any XSS. Mitigated by sanitizing all stored HTML and by React escaping output. |
| **Viewer/editor roles** (the optional stretch) | Very cheap once sharing exists (one column), and it makes the sharing model meaningfully more realistic. | No "commenter" role. |

## What I intentionally left out

- **Real-time co-editing and presence.** This is the biggest gap. The next step would be Yjs with TipTap's Collaboration extension over a WebSocket provider, with the Yjs document persisted alongside the HTML.
- **Version history, comments, and suggestion mode.**
- **Images, tables, and attachments in documents.** These are stripped on save and on import.
- **Sign-up, password reset, and session expiry.**
- **Pagination and search on the dashboard.**

## What I'd build next with 2–4 more hours

1. Persistent hosted storage (Postgres on Neon, or a mounted volume) so the demo's data survives restarts.
2. Version history: snapshot the content on each save, with a side panel to preview and restore.
3. Session expiry, and moving the session token to an httpOnly cookie.
4. Start on real-time collaboration with Yjs.
