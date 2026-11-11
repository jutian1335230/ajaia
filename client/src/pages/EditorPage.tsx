import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Link, useParams } from "react-router-dom";
import TurndownService from "turndown";
import { api, ApiError, SUPPORTED_UPLOADS, SUPPORTED_UPLOADS_LABEL, type DocumentDetail, type Share } from "../api";
import { Header } from "../components/Header";
import { ShareDialog } from "../components/ShareDialog";
import { Toolbar } from "../components/Toolbar";
import { formatRelative } from "../format";
import { useAutosave, type SaveStatus } from "../useAutosave";

export function EditorPage() {
  const id = Number(useParams().id);
  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);

  useEffect(() => {
    setDoc(null);
    setError(null);
    if (!Number.isInteger(id) || id <= 0) {
      setError({ status: 404, message: "Document not found" });
      return;
    }
    api
      .getDocument(id)
      .then(setDoc)
      .catch((err: ApiError) => setError({ status: err.status, message: err.message }));
  }, [id]);

  if (error) {
    return (
      <>
        <Header />
        <div className="center stack">
          <h2>{error.status === 404 ? "Document not found" : "Couldn't open document"}</h2>
          <p className="muted">
            {error.status === 404 ? "It may have been deleted, or it hasn't been shared with you." : error.message}
          </p>
          <Link to="/" className="btn">
            Back to documents
          </Link>
        </div>
      </>
    );
  }
  if (!doc) {
    return (
      <>
        <Header />
        <div className="center muted">Loading document…</div>
      </>
    );
  }
  return <DocumentEditor key={doc.id} doc={doc} />;
}

function DocumentEditor({ doc }: { doc: DocumentDetail }) {
  const canEdit = doc.role !== "viewer";
  const [title, setTitle] = useState(doc.title);
  const savedTitle = useRef(doc.title);
  const [shares, setShares] = useState<Share[]>(doc.shares ?? []);
  const [shareOpen, setShareOpen] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const autosave = useAutosave(doc.id, doc.updatedAt);
  const editable = canEdit && autosave.status !== "conflict";

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      Placeholder.configure({ placeholder: canEdit ? "Start writing…" : "This document is empty." }),
    ],
    content: doc.content,
    editable,
    onUpdate: ({ editor }) => autosave.queue({ content: editor.getHTML() }),
  });

  useEffect(() => {
    // emitUpdate=false: toggling editability must not look like a content change to autosave.
    if (editor && editor.isEditable !== editable) editor.setEditable(editable, false);
  }, [editor, editable]);

  useEffect(() => {
    if (canEdit || !editor) return;
    let lastSeen = doc.updatedAt;
    const poll = setInterval(async () => {
      try {
        const latest = await api.getDocument(doc.id);
        if (latest.updatedAt === lastSeen) return;
        lastSeen = latest.updatedAt;
        editor.commands.setContent(latest.content, false);
        setTitle(latest.title);
      } catch {
        // Transient failures are fine; access revocation surfaces on next navigation.
      }
    }, 5000);
    return () => clearInterval(poll);
  }, [canEdit, editor, doc.id, doc.updatedAt]);

  useEffect(() => {
    document.title = `${title || "Untitled"} – Ajaia Docs`;
    return () => {
      document.title = "Ajaia Docs";
    };
  }, [title]);

  function commitTitle() {
    const next = title.trim();
    if (!next) {
      setTitle(savedTitle.current);
      return;
    }
    if (next.length > 200) {
      setTitle(savedTitle.current);
      setImportError("Title is too long (max 200 characters)");
      return;
    }
    setTitle(next);
    if (next !== savedTitle.current) {
      savedTitle.current = next;
      autosave.queue({ title: next }, true);
    }
  }

  async function insertFromFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !editor) return;
    setImporting(true);
    setImportError(null);
    try {
      const { html } = await api.convertFile(file);
      editor.chain().focus().insertContent(html).run();
    } catch (err) {
      setImportError((err as Error).message);
    } finally {
      setImporting(false);
    }
  }

  function exportMarkdown() {
    if (!editor) return;
    const markdown = new TurndownService({ headingStyle: "atx", bulletListMarker: "-" }).turndown(editor.getHTML());
    const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `${title || "document"}.md` });
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <Header>
        <div className="doc-header">
          <input
            className="title-input"
            value={title}
            aria-label="Document title"
            readOnly={!canEdit}
            maxLength={200}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                setTitle(savedTitle.current);
                e.currentTarget.blur();
              }
            }}
          />
          <div className="doc-header-meta">
            {doc.role === "owner" ? (
              <span className="badge owner">Owner</span>
            ) : (
              <span className={`badge ${doc.role}`}>
                {doc.role === "editor" ? "Can edit" : "View only"} · shared by {doc.owner.name}
              </span>
            )}
            {canEdit && <SaveIndicator status={autosave.status} lastSavedAt={autosave.lastSavedAt} onRetry={autosave.retry} />}
          </div>
        </div>
        <div className="doc-header-actions">
          {canEdit && (
            <>
              <button
                className="btn"
                disabled={importing || autosave.status === "conflict"}
                title={`Insert the contents of a ${SUPPORTED_UPLOADS_LABEL} file at the cursor`}
                onClick={() => fileInput.current?.click()}
              >
                {importing ? "Inserting…" : "Insert file"}
              </button>
              <input ref={fileInput} type="file" accept={SUPPORTED_UPLOADS} hidden onChange={insertFromFile} />
            </>
          )}
          <button className="btn" onClick={exportMarkdown} title="Download as Markdown">
            Export .md
          </button>
          {doc.role === "owner" && (
            <button className="btn primary" onClick={() => setShareOpen(true)}>
              Share{shares.length > 0 ? ` (${shares.length})` : ""}
            </button>
          )}
        </div>
      </Header>

      <div className="sticky-bar">
        {autosave.status === "conflict" && (
          <div className="banner warning">
            {autosave.error} Your latest unsaved edits are still visible but won't be saved.
            <button className="btn" onClick={() => window.location.reload()}>
              Reload
            </button>
          </div>
        )}
        {autosave.status === "error" && <div className="banner error-banner">Couldn't save: {autosave.error}</div>}
        {importError && (
          <div className="banner error-banner">
            {importError}
            <button className="btn ghost" onClick={() => setImportError(null)}>
              Dismiss
            </button>
          </div>
        )}
        {!canEdit && <div className="banner info">You have view-only access. Ask {doc.owner.name} for edit access.</div>}
        {editor && editable && <Toolbar editor={editor} />}
      </div>
      <main className="page-wrap">
        <div className="page">
          <EditorContent editor={editor} />
        </div>
      </main>

      {shareOpen && (
        <ShareDialog
          documentId={doc.id}
          owner={doc.owner}
          initialShares={shares}
          onChange={setShares}
          onClose={() => setShareOpen(false)}
        />
      )}
    </>
  );
}

function SaveIndicator({ status, lastSavedAt, onRetry }: { status: SaveStatus; lastSavedAt: string; onRetry: () => void }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  switch (status) {
    case "saving":
      return <span className="save-status">Saving…</span>;
    case "unsaved":
      return <span className="save-status">Unsaved changes</span>;
    case "error":
      return (
        <span className="save-status error-text">
          Save failed ·{" "}
          <button className="link" onClick={onRetry}>
            retry
          </button>
        </span>
      );
    case "conflict":
      return <span className="save-status error-text">Out of date</span>;
    default:
      return <span className="save-status">Saved {formatRelative(lastSavedAt)}</span>;
  }
}
