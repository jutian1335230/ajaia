import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, SUPPORTED_UPLOADS, SUPPORTED_UPLOADS_LABEL, type DocumentSummary } from "../api";
import { Header } from "../components/Header";
import { formatRelative } from "../format";

export function DashboardPage() {
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);
  const [docs, setDocs] = useState<{ owned: DocumentSummary[]; shared: DocumentSummary[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"create" | "import" | null>(null);

  useEffect(() => {
    api
      .listDocuments()
      .then(setDocs)
      .catch((err) => setError(err.message));
  }, []);

  async function createDoc() {
    setBusy("create");
    setError(null);
    try {
      const doc = await api.createDocument();
      navigate(`/docs/${doc.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
    }
  }

  async function importFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy("import");
    setError(null);
    try {
      const doc = await api.importDocument(file);
      navigate(`/docs/${doc.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
    }
  }

  async function deleteDoc(doc: DocumentSummary) {
    if (!confirm(`Delete "${doc.title}"? This can't be undone.`)) return;
    try {
      await api.deleteDocument(doc.id);
      setDocs((d) => d && { ...d, owned: d.owned.filter((x) => x.id !== doc.id) });
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <>
      <Header />
      <main className="dashboard">
        <section className="actions">
          <button className="btn primary" onClick={createDoc} disabled={busy !== null}>
            {busy === "create" ? "Creating…" : "+ New document"}
          </button>
          <button className="btn" onClick={() => fileInput.current?.click()} disabled={busy !== null}>
            {busy === "import" ? "Importing…" : "⬆ Import file"}
          </button>
          <span className="muted small">Import {SUPPORTED_UPLOADS_LABEL} as a new editable document</span>
          <input ref={fileInput} type="file" accept={SUPPORTED_UPLOADS} hidden onChange={importFile} />
        </section>

        {error && <div className="error">{error}</div>}

        {!docs && !error && <p className="muted">Loading documents…</p>}
        {docs && (
          <>
            <DocList
              title="My documents"
              empty="You don't own any documents yet. Create one or import a file."
              docs={docs.owned}
              onDelete={deleteDoc}
            />
            <DocList title="Shared with me" empty="Nothing has been shared with you yet." docs={docs.shared} />
          </>
        )}
      </main>
    </>
  );
}

function DocList({
  title,
  empty,
  docs,
  onDelete,
}: {
  title: string;
  empty: string;
  docs: DocumentSummary[];
  onDelete?: (doc: DocumentSummary) => void;
}) {
  return (
    <section className="doc-section">
      <h2>
        {title} <span className="count">{docs.length}</span>
      </h2>
      {docs.length === 0 ? (
        <p className="muted empty">{empty}</p>
      ) : (
        <ul className="doc-list">
          {docs.map((doc) => (
            <li key={doc.id} className="doc-row">
              <Link to={`/docs/${doc.id}`} className="doc-link">
                <span className="doc-icon">📄</span>
                <span className="doc-title">{doc.title}</span>
              </Link>
              <span className="doc-meta">
                {doc.role === "owner" ? (
                  <span className="badge owner">Owner</span>
                ) : (
                  <>
                    <span className={`badge ${doc.role}`}>{doc.role === "editor" ? "Can edit" : "View only"}</span>
                    <span className="muted small hide-sm">from {doc.owner.name}</span>
                  </>
                )}
                <span className="muted small">{formatRelative(doc.updatedAt)}</span>
                {onDelete && (
                  <button className="btn ghost icon" title="Delete document" aria-label={`Delete ${doc.title}`} onClick={() => onDelete(doc)}>
                    🗑
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
