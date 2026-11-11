import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { openDatabase, SEED_PASSWORD } from "./db.js";

type App = ReturnType<typeof createApp>;

async function login(app: App, email: string) {
  const res = await request(app).post("/api/auth/login").send({ email, password: SEED_PASSWORD }).expect(200);
  return `Bearer ${res.body.token}`;
}

describe("documents API", () => {
  let app: App;
  let alice: string;
  let bob: string;
  let carol: string;

  beforeEach(async () => {
    app = createApp(openDatabase(":memory:"));
    [alice, bob, carol] = await Promise.all([
      login(app, "alice@ajaia.test"),
      login(app, "bob@ajaia.test"),
      login(app, "carol@ajaia.test"),
    ]);
  });

  it("rejects unauthenticated requests and bad credentials", async () => {
    await request(app).get("/api/documents").expect(401);
    await request(app).post("/api/auth/login").send({ email: "alice@ajaia.test", password: "nope" }).expect(401);
    await request(app).post("/api/auth/login").send({ email: "not-an-email", password: "x" }).expect(400);
  });

  it("creates, renames, edits and reopens a document with formatting preserved", async () => {
    const created = await request(app).post("/api/documents").set("Authorization", alice).send({}).expect(201);
    expect(created.body.title).toBe("Untitled document");

    const html = "<h1>Plan</h1><p><strong>bold</strong> <em>it</em> <u>under</u></p><ul><li><p>one</p></li></ul>";
    await request(app)
      .patch(`/api/documents/${created.body.id}`)
      .set("Authorization", alice)
      .send({ title: "Q3 plan", content: html })
      .expect(200);

    const reopened = await request(app).get(`/api/documents/${created.body.id}`).set("Authorization", alice).expect(200);
    expect(reopened.body.title).toBe("Q3 plan");
    expect(reopened.body.content).toBe(html);
  });

  it("strips unsafe HTML from saved content", async () => {
    const created = await request(app).post("/api/documents").set("Authorization", alice).send({}).expect(201);
    const res = await request(app)
      .patch(`/api/documents/${created.body.id}`)
      .set("Authorization", alice)
      .send({ content: '<p onclick="x()">hi<script>alert(1)</script></p>' })
      .expect(200);
    expect(res.body.content).toBe("<p>hi</p>");
  });

  it("validates input", async () => {
    const created = await request(app).post("/api/documents").set("Authorization", alice).send({}).expect(201);
    const res = await request(app)
      .patch(`/api/documents/${created.body.id}`)
      .set("Authorization", alice)
      .send({ title: "   " })
      .expect(400);
    expect(res.body.error).toMatch(/title/i);
    await request(app).get("/api/documents/abc").set("Authorization", alice).expect(400);
  });

  it("enforces sharing: hidden until shared, viewer is read-only, editor can edit, revoke removes access", async () => {
    const { body: doc } = await request(app)
      .post("/api/documents")
      .set("Authorization", alice)
      .send({ title: "Private" })
      .expect(201);
    const url = `/api/documents/${doc.id}`;

    // Not shared yet: Carol can't see it, and it 404s rather than leaking existence.
    await request(app).get(url).set("Authorization", carol).expect(404);

    // Only the owner can share.
    await request(app).post(`${url}/shares`).set("Authorization", carol).send({ email: "carol@ajaia.test" }).expect(404);

    await request(app)
      .post(`${url}/shares`)
      .set("Authorization", alice)
      .send({ email: "carol@ajaia.test", role: "viewer" })
      .expect(201);

    const list = await request(app).get("/api/documents").set("Authorization", carol).expect(200);
    expect(list.body.shared.map((d: { id: number }) => d.id)).toContain(doc.id);
    expect(list.body.owned.map((d: { id: number }) => d.id)).not.toContain(doc.id);

    const asViewer = await request(app).get(url).set("Authorization", carol).expect(200);
    expect(asViewer.body.role).toBe("viewer");
    expect(asViewer.body.shares).toBeUndefined();
    await request(app).patch(url).set("Authorization", carol).send({ content: "<p>hack</p>" }).expect(403);

    // Upgrade to editor.
    await request(app)
      .post(`${url}/shares`)
      .set("Authorization", alice)
      .send({ email: "carol@ajaia.test", role: "editor" })
      .expect(201);
    await request(app).patch(url).set("Authorization", carol).send({ content: "<p>edit</p>" }).expect(200);
    await request(app).delete(url).set("Authorization", carol).expect(403);
    await request(app).post(`${url}/shares`).set("Authorization", carol).send({ email: "bob@ajaia.test" }).expect(403);

    // Revoke.
    const carolId = (await request(app).get("/api/auth/me").set("Authorization", carol)).body.user.id;
    await request(app).delete(`${url}/shares/${carolId}`).set("Authorization", alice).expect(200);
    await request(app).get(url).set("Authorization", carol).expect(404);

    // Bob was never involved.
    await request(app).get(url).set("Authorization", bob).expect(404);
  });

  it("rejects sharing with unknown users or the owner", async () => {
    const { body: doc } = await request(app).post("/api/documents").set("Authorization", alice).send({}).expect(201);
    await request(app)
      .post(`/api/documents/${doc.id}/shares`)
      .set("Authorization", alice)
      .send({ email: "nobody@ajaia.test" })
      .expect(404);
    await request(app)
      .post(`/api/documents/${doc.id}/shares`)
      .set("Authorization", alice)
      .send({ email: "alice@ajaia.test" })
      .expect(400);
  });

  it("detects conflicting edits instead of silently overwriting", async () => {
    const { body: doc } = await request(app).post("/api/documents").set("Authorization", alice).send({}).expect(201);
    await request(app)
      .post(`/api/documents/${doc.id}/shares`)
      .set("Authorization", alice)
      .send({ email: "bob@ajaia.test", role: "editor" })
      .expect(201);

    const first = await request(app)
      .patch(`/api/documents/${doc.id}`)
      .set("Authorization", bob)
      .send({ content: "<p>bob</p>", baseUpdatedAt: doc.updatedAt })
      .expect(200);
    expect(first.body.updatedAt).not.toBe(doc.updatedAt);

    // Alice still holds the stale version.
    await request(app)
      .patch(`/api/documents/${doc.id}`)
      .set("Authorization", alice)
      .send({ content: "<p>alice</p>", baseUpdatedAt: doc.updatedAt })
      .expect(409);
  });

  it("imports .md, .txt files into new documents and rejects unsupported types", async () => {
    const md = await request(app)
      .post("/api/documents/import")
      .set("Authorization", alice)
      .attach("file", Buffer.from("# Title\n\nSome **bold** text\n\n- a\n- b"), "notes.md")
      .expect(201);
    expect(md.body.title).toBe("notes");
    expect(md.body.content).toContain("<h1>Title</h1>");
    expect(md.body.content).toContain("<strong>bold</strong>");
    expect(md.body.content).toContain("<li>a</li>");

    const txt = await request(app)
      .post("/api/documents/import")
      .set("Authorization", alice)
      .attach("file", Buffer.from("line one\nline two\n\n<b>not html</b>"), "plain.txt")
      .expect(201);
    expect(txt.body.content).toBe("<p>line one<br />line two</p><p>&lt;b&gt;not html&lt;/b&gt;</p>");

    const bad = await request(app)
      .post("/api/documents/import")
      .set("Authorization", alice)
      .attach("file", Buffer.from("x"), "image.png")
      .expect(400);
    expect(bad.body.error).toMatch(/unsupported/i);
  });
});
