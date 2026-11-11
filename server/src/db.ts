import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import fs from "node:fs";
import path from "node:path";

export type DB = Database.Database;

export const SEED_PASSWORD = "password123";

export const SEED_USERS = [
  { email: "alice@ajaia.test", name: "Alice Chen" },
  { email: "bob@ajaia.test", name: "Bob Martinez" },
  { email: "carol@ajaia.test", name: "Carol Singh" },
];

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS document_shares (
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('viewer', 'editor')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (document_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_documents_owner ON documents(owner_id);
CREATE INDEX IF NOT EXISTS idx_shares_user ON document_shares(user_id);
`;

const WELCOME_DOC = `<h1>Welcome to Ajaia Docs</h1>
<p>This is a <strong>sample document</strong> owned by Alice and shared with Bob as an <em>editor</em>.</p>
<h2>Things to try</h2>
<ul>
  <li><p>Format text with <strong>bold</strong>, <em>italic</em> and <u>underline</u></p></li>
  <li><p>Add headings and lists from the toolbar</p></li>
  <li><p>Share this document with Carol from the <strong>Share</strong> button</p></li>
</ul>
<ol>
  <li><p>Changes autosave as you type</p></li>
  <li><p>Refresh the page — your formatting is preserved</p></li>
</ol>`;

export function openDatabase(file = process.env.DATABASE_PATH ?? "data/app.db"): DB {
  if (file !== ":memory:") {
    fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  }
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  seed(db);
  return db;
}

function seed(db: DB) {
  const count = (db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n;
  if (count > 0) return;

  // Low cost factor: these are demo accounts and seeding runs on every fresh boot / test.
  const hash = bcrypt.hashSync(SEED_PASSWORD, 8);
  const insertUser = db.prepare("INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)");

  db.transaction(() => {
    const ids = SEED_USERS.map((u) => Number(insertUser.run(u.email, u.name, hash).lastInsertRowid));
    const [alice, bob] = ids;
    const docId = db
      .prepare("INSERT INTO documents (owner_id, title, content) VALUES (?, ?, ?)")
      .run(alice, "Welcome to Ajaia Docs", WELCOME_DOC).lastInsertRowid;
    db.prepare("INSERT INTO document_shares (document_id, user_id, role) VALUES (?, ?, 'editor')").run(docId, bob);
    db.prepare("INSERT INTO documents (owner_id, title, content) VALUES (?, ?, ?)").run(
      bob,
      "Bob's meeting notes",
      "<h2>Weekly sync</h2><p>Only Bob can see this until he shares it.</p>",
    );
  })();
}
