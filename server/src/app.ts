import express from "express";
import fs from "node:fs";
import path from "node:path";
import { authRouter, requireAuth } from "./auth.js";
import type { DB } from "./db.js";
import { convertRouter, documentsRouter } from "./documents.js";
import { errorHandler, HttpError } from "./errors.js";

export function createApp(db: DB, options: { staticDir?: string } = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "3mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/api/users", requireAuth(db), (req, res) => {
    const users = db.prepare("SELECT id, name, email FROM users WHERE id != ? ORDER BY name").all(req.user!.id);
    res.json({ users });
  });

  app.use("/api/auth", authRouter(db));
  app.use("/api/documents", requireAuth(db), documentsRouter(db));
  app.use("/api/convert", requireAuth(db), convertRouter());

  app.use("/api", (_req, _res, next) => next(new HttpError(404, "Not found")));

  const { staticDir } = options;
  if (staticDir && fs.existsSync(staticDir)) {
    app.use(express.static(staticDir));
    app.get("*", (_req, res) => res.sendFile(path.join(staticDir, "index.html")));
  }

  app.use(errorHandler);
  return app;
}
