export type Role = "owner" | "editor" | "viewer";

export interface User {
  id: number;
  name: string;
  email: string;
}

export interface DocumentSummary {
  id: number;
  title: string;
  role: Role;
  owner: User;
  createdAt: string;
  updatedAt: string;
}

export interface Share extends User {
  role: Exclude<Role, "owner">;
}

export interface DocumentDetail extends DocumentSummary {
  content: string;
  shares?: Share[];
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const TOKEN_KEY = "ajaia.token";

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

let onUnauthorized: () => void = () => {};
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = tokenStore.get();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");

  let res: Response;
  try {
    res = await fetch(`/api${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your connection.");
  }

  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && path !== "/auth/login") onUnauthorized();
    throw new ApiError(res.status, body.error ?? `Request failed (${res.status})`);
  }
  return body as T;
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});

function uploadForm(file: File) {
  const form = new FormData();
  form.append("file", file);
  return { method: "POST", body: form };
}

export const api = {
  login: (email: string, password: string) =>
    request<{ token: string; user: User }>("/auth/login", json("POST", { email, password })),
  logout: () => request<void>("/auth/logout", json("POST")),
  me: () => request<{ user: User }>("/auth/me"),
  users: () => request<{ users: User[] }>("/users"),

  listDocuments: () => request<{ owned: DocumentSummary[]; shared: DocumentSummary[] }>("/documents"),
  createDocument: (title?: string) => request<DocumentDetail>("/documents", json("POST", { title })),
  getDocument: (id: number) => request<DocumentDetail>(`/documents/${id}`),
  updateDocument: (id: number, patch: { title?: string; content?: string; baseUpdatedAt?: string }) =>
    request<DocumentDetail>(`/documents/${id}`, json("PATCH", patch)),
  deleteDocument: (id: number) => request<void>(`/documents/${id}`, json("DELETE")),
  importDocument: (file: File) => request<DocumentDetail>("/documents/import", uploadForm(file)),
  convertFile: (file: File) => request<{ title: string; html: string }>("/convert", uploadForm(file)),

  shareDocument: (id: number, email: string, role: Share["role"]) =>
    request<{ shares: Share[] }>(`/documents/${id}/shares`, json("POST", { email, role })),
  unshareDocument: (id: number, userId: number) =>
    request<{ shares: Share[] }>(`/documents/${id}/shares/${userId}`, json("DELETE")),
};

export const SUPPORTED_UPLOADS = ".txt,.md,.markdown,.docx";
export const SUPPORTED_UPLOADS_LABEL = ".txt, .md or .docx (max 5 MB)";
