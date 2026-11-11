# AI Workflow Note

## Tools used

- **Cursor** in agent mode, using Claude, for scaffolding, implementation, debugging, and drafting documentation.
- **Playwright** (`playwright-core` driving the installed Edge browser) to verify the UI from inside the AI loop instead of trusting that generated code "looks right."

## Where AI materially sped things up

- **Boilerplate and wiring:** the Express app, the Zod schemas, the SQLite schema and seed data, the TipTap toolbar, the CSS layout, and the multer/mammoth/marked upload pipeline. This is the code that is easy to write but slow to type.
- **Test generation:** the API test suite (permission matrix, sanitization, conflict handling, imports) was drafted in one pass and then checked against the behavior I actually wanted.
- **Debugging with evidence:** when autosave misbehaved, the browser test logged the network traffic, which pinned down the cause within minutes (details below).

## What I changed or rejected

- **An autosave infinite loop.** The first editor version called `editor.setEditable()` whenever the save status changed. TipTap's `setEditable` fires an `update` event by default, so every save looked like a new edit and triggered another save. This passed the type checker and looked fine on screen. It only showed up because the e2e script waited for "Saved" and the network log showed a constant stream of PATCH requests. I fixed it by passing `emitUpdate = false` and only toggling when editability actually changes.
- **Dependency incompatibility.** A type package pulled in `htmlparser2` v12, which is ESM-only and broke `sanitize-html` on Node 20.11. I pinned it with an npm `overrides` entry rather than downgrading the whole stack.
- **Scope decisions the AI didn't make for me:**
  - I rejected building real-time collaboration in the timebox and used optimistic concurrency (409 on stale writes) instead, so collaborators can't silently overwrite each other.
  - I chose 404 instead of 403 for unshared documents so document IDs don't leak.
  - I chose HTML instead of ProseMirror JSON as the stored format, so imports and exports share one representation.
- **Security review of the generated code:** I checked that every stored HTML path (save, create, import, insert) goes through the same tag allowlist, and that role checks happen on the server, not just in the UI.

## How I verified correctness, UX, and reliability

1. **Automated API tests** (`npm test`, 8 tests): authentication, create/rename/edit/reopen round trips, stripping of `<script>` tags and `onclick` attributes, validation errors, every role against every action including revocation, 409 on conflicting edits, and file import for `.md`, `.txt`, and unsupported types.
2. **Browser e2e** (`npm run e2e`) against the production build. It runs three users in separate browser contexts:
   - Alice creates and formats a document, reloads, and checks that the formatting and title persisted.
   - Alice shares with Carol as a viewer; an unknown email shows an error.
   - Carol sees the document under "Shared with me," gets no toolbar, and the editor isn't editable. She sees Alice's later edits without reloading.
   - Bob gets "not found" when he opens Alice's URL directly, and he inserts a Markdown file into a document he can edit.
   - When Alice and Bob edit the same document, Alice's stale save shows the conflict banner and locks her editor, and reloading shows Bob's version.
   - An empty title reverts, Markdown export downloads the right content, a revoked viewer loses access, and a deleted document stays deleted after a refresh.
   - The test also caught a real accessibility bug: the icon-only "remove person" and "delete" buttons had no accessible names, so a screen reader would read them as "✕" and "🗑". They now have proper labels.
3. **Manual checks:** a real `.docx` file (generated with python-docx) imported through the API, keeping its heading, bold text, and list.
4. **Visual review** of the screenshots in `docs/screenshots/` for layout, badges, and empty and error states.
5. **`tsc --noEmit`** on both the client and the server, and a production build.
