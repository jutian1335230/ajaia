import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "./api";

export type SaveStatus = "saved" | "unsaved" | "saving" | "error" | "conflict";

interface Patch {
  title?: string;
  content?: string;
}

const DEBOUNCE_MS = 800;

/**
 * Debounced, serialized autosave. At most one request is in flight; edits made
 * while saving are merged and sent afterwards. Each save carries the last
 * known updatedAt so the server can reject writes based on a stale copy.
 */
export function useAutosave(documentId: number, initialUpdatedAt: string) {
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [error, setError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState(initialUpdatedAt);

  const pending = useRef<Patch>({});
  const baseUpdatedAt = useRef(initialUpdatedAt);
  const inFlight = useRef(false);
  const conflicted = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const hasPending = () => pending.current.title !== undefined || pending.current.content !== undefined;

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    if (inFlight.current || conflicted.current || !hasPending()) return;

    const patch = pending.current;
    pending.current = {};
    inFlight.current = true;
    setStatus("saving");

    try {
      const updated = await api.updateDocument(documentId, { ...patch, baseUpdatedAt: baseUpdatedAt.current });
      baseUpdatedAt.current = updated.updatedAt;
      setLastSavedAt(updated.updatedAt);
      setError(null);
      setStatus(hasPending() ? "unsaved" : "saved");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        conflicted.current = true;
        setStatus("conflict");
      } else {
        // Keep the failed edits so the next attempt includes them.
        pending.current = { ...patch, ...pending.current };
        setStatus("error");
      }
      setError((err as Error).message);
    } finally {
      inFlight.current = false;
    }

    if (hasPending() && !conflicted.current) timer.current = setTimeout(flush, DEBOUNCE_MS);
  }, [documentId]);

  const queue = useCallback(
    (patch: Patch, immediate = false) => {
      if (conflicted.current) return;
      pending.current = { ...pending.current, ...patch };
      setStatus((s) => (s === "saving" ? s : "unsaved"));
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, immediate ? 0 : DEBOUNCE_MS);
    },
    [flush],
  );

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (hasPending() || inFlight.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      void flush();
    };
  }, [flush]);

  return { status, error, lastSavedAt, queue, retry: flush };
}
