import { Router, type NextFunction, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { z } from "zod";
import type { DB } from "./db.js";
import { HttpError } from "./errors.js";

export interface User {
  id: number;
  email: string;
  name: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

function bearerToken(req: Request): string | undefined {
  const header = req.header("authorization");
  if (!header?.startsWith("Bearer ")) return undefined;
  return header.slice("Bearer ".length).trim() || undefined;
}

export function authRouter(db: DB) {
  const router = Router();

  router.post("/login", (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    const row = db
      .prepare("SELECT id, email, name, password_hash FROM users WHERE email = ?")
      .get(email) as (User & { password_hash: string }) | undefined;

    if (!row || !bcrypt.compareSync(password, row.password_hash)) {
      throw new HttpError(401, "Invalid email or password");
    }

    const token = crypto.randomBytes(32).toString("hex");
    db.prepare("INSERT INTO sessions (token, user_id) VALUES (?, ?)").run(token, row.id);
    res.json({ token, user: { id: row.id, email: row.email, name: row.name } });
  });

  router.post("/logout", (req, res) => {
    const token = bearerToken(req);
    if (token) db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
    res.status(204).end();
  });

  router.get("/me", requireAuth(db), (req, res) => {
    res.json({ user: req.user });
  });

  return router;
}

export function requireAuth(db: DB) {
  const lookup = db.prepare(
    "SELECT u.id, u.email, u.name FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?",
  );
  return (req: Request, _res: Response, next: NextFunction) => {
    const token = bearerToken(req);
    const user = token ? (lookup.get(token) as User | undefined) : undefined;
    if (!user) return next(new HttpError(401, "Please sign in"));
    req.user = user;
    next();
  };
}
