import { useState, type FormEvent } from "react";
import { useAuth } from "../auth";

const DEMO_USERS = [
  { email: "alice@ajaia.test", name: "Alice Chen" },
  { email: "bob@ajaia.test", name: "Bob Martinez" },
  { email: "carol@ajaia.test", name: "Carol Singh" },
];
const DEMO_PASSWORD = "password123";

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent | null, creds = { email, password }) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(creds.email, creds.password);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <div className="card login-card">
        <h1 className="brand">📄 Ajaia Docs</h1>
        <p className="muted">Sign in to create, edit and share documents.</p>

        <form onSubmit={submit} className="stack">
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {error && <div className="error">{error}</div>}
          <button className="btn primary" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="divider">or continue as a demo user</div>
        <div className="demo-users">
          {DEMO_USERS.map((u) => (
            <button
              key={u.email}
              className="btn"
              disabled={busy}
              onClick={() => submit(null, { email: u.email, password: DEMO_PASSWORD })}
            >
              <span className="avatar">{u.name[0]}</span>
              <span>
                <strong>{u.name}</strong>
                <br />
                <small className="muted">{u.email}</small>
              </span>
            </button>
          ))}
        </div>
        <p className="muted small">
          All demo accounts use the password <code>{DEMO_PASSWORD}</code>. Open a second browser (or a private window)
          to sign in as another user and test sharing.
        </p>
      </div>
    </div>
  );
}
