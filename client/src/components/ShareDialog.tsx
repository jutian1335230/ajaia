import { useEffect, useState, type FormEvent } from "react";
import { api, type Share, type User } from "../api";

interface Props {
  documentId: number;
  owner: User;
  initialShares: Share[];
  onChange: (shares: Share[]) => void;
  onClose: () => void;
}

export function ShareDialog({ documentId, owner, initialShares, onChange, onClose }: Props) {
  const [shares, setShares] = useState(initialShares);
  const [users, setUsers] = useState<User[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Share["role"]>("editor");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.users().then(({ users }) => setUsers(users)).catch(() => {});
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function run(action: () => Promise<{ shares: Share[] }>) {
    setBusy(true);
    setError(null);
    try {
      const { shares } = await action();
      setShares(shares);
      onChange(shares);
      return true;
    } catch (err) {
      setError((err as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    if (await run(() => api.shareDocument(documentId, email, role))) setEmail("");
  }

  const sharedIds = new Set(shares.map((s) => s.id));
  const suggestions = users.filter((u) => !sharedIds.has(u.id));

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="card modal" role="dialog" aria-modal="true" aria-labelledby="share-title" onMouseDown={(e) => e.stopPropagation()}>
        <h2 id="share-title">Share document</h2>

        <form onSubmit={add} className="share-form">
          <input
            type="email"
            list="share-users"
            placeholder="Add people by email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
          <datalist id="share-users">
            {suggestions.map((u) => (
              <option key={u.id} value={u.email}>
                {u.name}
              </option>
            ))}
          </datalist>
          <select value={role} onChange={(e) => setRole(e.target.value as Share["role"])} aria-label="Access level">
            <option value="editor">Can edit</option>
            <option value="viewer">View only</option>
          </select>
          <button className="btn primary" disabled={busy}>
            Share
          </button>
        </form>
        {suggestions.length > 0 && (
          <p className="muted small">Demo users: {suggestions.map((u) => u.email).join(", ")}</p>
        )}
        {error && <div className="error">{error}</div>}

        <h3>People with access</h3>
        <ul className="share-list">
          <li>
            <span className="avatar">{owner.name[0]}</span>
            <span className="grow">
              {owner.name}
              <br />
              <small className="muted">{owner.email}</small>
            </span>
            <span className="badge owner">Owner</span>
          </li>
          {shares.map((s) => (
            <li key={s.id}>
              <span className="avatar">{s.name[0]}</span>
              <span className="grow">
                {s.name}
                <br />
                <small className="muted">{s.email}</small>
              </span>
              <select
                value={s.role}
                disabled={busy}
                aria-label={`Access level for ${s.name}`}
                onChange={(e) => run(() => api.shareDocument(documentId, s.email, e.target.value as Share["role"]))}
              >
                <option value="editor">Can edit</option>
                <option value="viewer">View only</option>
              </select>
              <button
                className="btn ghost icon"
                title={`Remove ${s.name}`}
                aria-label={`Remove ${s.name}`}
                disabled={busy}
                onClick={() => run(() => api.unshareDocument(documentId, s.id))}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
