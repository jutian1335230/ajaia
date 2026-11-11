import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { z } from "zod";
import { convertUpload, MAX_UPLOAD_BYTES, sanitizeDocumentHtml } from "./convert.js";
import type { DB } from "./db.js";
import { HttpError } from "./errors.js";

export type Role = "owner" | "editor" | "viewer";

interface DocumentRow {
  id: number;
  owner_id: number;
  owner_name: string;
  owner_email: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}

const titleSchema = z.string().trim().min(1, "Title cannot be empty").max(200, "Title is too long (max 200 characters)");

const createSchema = z.object({
  title: titleSchema.optional(),
  content: z.string().max(2_000_000).optional(),
});

const updateSchema = z
  .object({
    title: titleSchema.optional(),
    content: z.string().max(2_000_000, "Document is too large to save").optional(),
    // Optimistic concurrency: the updatedAt the client last saw. If someone else
    // saved in the meantime we reject instead of silently overwriting their work.
    baseUpdatedAt: z.string().optional(),
  })
  .refine((v) => v.title !== undefined || v.content !== undefined, "Nothing to update");

const shareSchema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  role: z.enum(["viewer", "editor"]).default("editor"),
});

const idParam = z.coerce.number().int().positive();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });

const asyncHandler =
  (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

function toSummary(row: DocumentRow, role: Role) {
  return {
    id: row.id,
    title: row.title,
    role,
    owner: { id: row.owner_id, name: row.owner_name, email: row.owner_email },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function documentsRouter(db: DB) {
  const router = Router();

  const selectDoc = `
    SELECT d.id, d.owner_id, u.name AS owner_name, u.email AS owner_email,
           d.title, d.content, d.created_at, d.updated_at
    FROM documents d JOIN users u ON u.id = d.owner_id`;

  const getDoc = db.prepare(`${selectDoc} WHERE d.id = ?`);
  const getShareRole = db.prepare("SELECT role FROM document_shares WHERE document_id = ? AND user_id = ?");

  /** Resolves the caller's role on a document. Missing and forbidden both 404 so ids don't leak. */
  function loadWithRole(req: Request): { doc: DocumentRow; role: Role } {
    const id = idParam.parse(req.params.id);
    const doc = getDoc.get(id) as DocumentRow | undefined;
    const userId = req.user!.id;
    if (doc) {
      if (doc.owner_id === userId) return { doc, role: "owner" };
      const share = getShareRole.get(id, userId) as { role: Role } | undefined;
      if (share) return { doc, role: share.role };
    }
    throw new HttpError(404, "Document not found");
  }

  function requireRole(role: Role, allowed: Role[], message: string) {
    if (!allowed.includes(role)) throw new HttpError(403, message);
  }

  function listShares(documentId: number) {
    return db
      .prepare(
        `SELECT u.id, u.name, u.email, s.role FROM document_shares s
         JOIN users u ON u.id = s.user_id WHERE s.document_id = ? ORDER BY u.name`,
      )
      .all(documentId);
  }

  function createDocument(ownerId: number, title: string, content: string) {
    const id = db
      .prepare("INSERT INTO documents (owner_id, title, content) VALUES (?, ?, ?)")
      .run(ownerId, title, sanitizeDocumentHtml(content)).lastInsertRowid;
    return getDoc.get(id) as DocumentRow;
  }

  router.get("/", (req, res) => {
    const userId = req.user!.id;
    const owned = db.prepare(`${selectDoc} WHERE d.owner_id = ? ORDER BY d.updated_at DESC`).all(userId) as DocumentRow[];
    const shared = db
      .prepare(
        `${selectDoc} JOIN document_shares s ON s.document_id = d.id
         WHERE s.user_id = ? ORDER BY d.updated_at DESC`,
      )
      .all(userId) as DocumentRow[];
    const roles = new Map(
      (db.prepare("SELECT document_id, role FROM document_shares WHERE user_id = ?").all(userId) as {
        document_id: number;
        role: Role;
      }[]).map((r) => [r.document_id, r.role]),
    );
    res.json({
      owned: owned.map((d) => toSummary(d, "owner")),
      shared: shared.map((d) => toSummary(d, roles.get(d.id) ?? "viewer")),
    });
  });

  router.post("/", (req, res) => {
    const { title, content } = createSchema.parse(req.body ?? {});
    const doc = createDocument(req.user!.id, title ?? "Untitled document", content ?? "");
    res.status(201).json({ ...toSummary(doc, "owner"), content: doc.content });
  });

  router.post(
    "/import",
    upload.single("file"),
    asyncHandler(async (req, res) => {
      if (!req.file) throw new HttpError(400, "Choose a file to upload");
      const { title, html } = await convertUpload(req.file.originalname, req.file.buffer);
      const doc = createDocument(req.user!.id, title, html);
      res.status(201).json({ ...toSummary(doc, "owner"), content: doc.content });
    }),
  );

  router.get("/:id", (req, res) => {
    const { doc, role } = loadWithRole(req);
    res.json({
      ...toSummary(doc, role),
      content: doc.content,
      shares: role === "owner" ? listShares(doc.id) : undefined,
    });
  });

  router.patch("/:id", (req, res) => {
    const { doc, role } = loadWithRole(req);
    requireRole(role, ["owner", "editor"], "You have view-only access to this document");
    const { title, content, baseUpdatedAt } = updateSchema.parse(req.body);

    if (baseUpdatedAt && baseUpdatedAt !== doc.updated_at) {
      throw new HttpError(409, "This document was changed by someone else. Reload to get the latest version.");
    }

    db.prepare(
      `UPDATE documents SET
         title = COALESCE(?, title),
         content = COALESCE(?, content),
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ?`,
    ).run(title ?? null, content !== undefined ? sanitizeDocumentHtml(content) : null, doc.id);

    const updated = getDoc.get(doc.id) as DocumentRow;
    res.json({ ...toSummary(updated, role), content: updated.content });
  });

  router.delete("/:id", (req, res) => {
    const { doc, role } = loadWithRole(req);
    requireRole(role, ["owner"], "Only the owner can delete this document");
    db.prepare("DELETE FROM documents WHERE id = ?").run(doc.id);
    res.status(204).end();
  });

  router.get("/:id/shares", (req, res) => {
    const { doc, role } = loadWithRole(req);
    requireRole(role, ["owner"], "Only the owner can manage sharing");
    res.json({ shares: listShares(doc.id) });
  });

  router.post("/:id/shares", (req, res) => {
    const { doc, role } = loadWithRole(req);
    requireRole(role, ["owner"], "Only the owner can manage sharing");
    const { email, role: shareRole } = shareSchema.parse(req.body);

    const target = db.prepare("SELECT id FROM users WHERE email = ?").get(email) as { id: number } | undefined;
    if (!target) throw new HttpError(404, `No user found with email ${email}`);
    if (target.id === doc.owner_id) throw new HttpError(400, "You already own this document");

    db.prepare(
      `INSERT INTO document_shares (document_id, user_id, role) VALUES (?, ?, ?)
       ON CONFLICT (document_id, user_id) DO UPDATE SET role = excluded.role`,
    ).run(doc.id, target.id, shareRole);
    res.status(201).json({ shares: listShares(doc.id) });
  });

  router.delete("/:id/shares/:userId", (req, res) => {
    const { doc, role } = loadWithRole(req);
    requireRole(role, ["owner"], "Only the owner can manage sharing");
    const userId = idParam.parse(req.params.userId);
    db.prepare("DELETE FROM document_shares WHERE document_id = ? AND user_id = ?").run(doc.id, userId);
    res.json({ shares: listShares(doc.id) });
  });

  return router;
}

export function convertRouter() {
  const router = Router();
  // Converts a file to editor HTML without creating a document — used to insert
  // file contents into an existing draft.
  router.post(
    "/",
    upload.single("file"),
    asyncHandler(async (req, res) => {
      if (!req.file) throw new HttpError(400, "Choose a file to upload");
      res.json(await convertUpload(req.file.originalname, req.file.buffer));
    }),
  );
  return router;
}
