"use client";
// Device memory (SPEC T11, T22, T27). Everything is wrapped: storage can be blocked.

export interface SavedStore {
  token: string;
  clientRequestId: string;
  name: string;
  createdAt: number;
  slug?: string;
  /** false until POST /api/stores answered; an unconfirmed entry is re-sent on the next visit (lost response). */
  confirmed: boolean;
  input?: unknown;
}

const KEY = "sf.stores.v1";

export function storageAvailable(): boolean {
  try {
    const k = "__sf_test";
    localStorage.setItem(k, "1");
    localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

export function listStores(): SavedStore[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as SavedStore[]) : [];
    return Array.isArray(list) ? list.sort((a, b) => b.createdAt - a.createdAt) : [];
  } catch {
    return [];
  }
}

function write(list: SavedStore[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 20)));
    return true;
  } catch {
    return false;
  }
}

export function saveStore(s: SavedStore): boolean {
  return write([s, ...listStores().filter((x) => x.token !== s.token)]);
}

export function updateStore(token: string, patch: Partial<SavedStore>) {
  write(listStores().map((s) => (s.token === token ? { ...s, ...patch } : s)));
}

/** 24 random bytes → base64url (32 chars). Generated in the browser; the server only stores sha256 (T11). */
export function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function newClientRequestId(): string {
  return crypto.randomUUID();
}

/** POST /api/stores with retries on network failure / 5xx, always with the same ids (E9 lost response). */
export async function submitStore(
  s: SavedStore,
): Promise<{ ok: true; slug: string } | { ok: false; status: number; error?: string; issues?: string[] }> {
  let last: { ok: false; status: number; error?: string; issues?: string[] } = { ok: false, status: 0, error: "network" };
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch("/api/stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientRequestId: s.clientRequestId, token: s.token, input: s.input }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) return { ok: true, slug: body.slug };
      last = { ok: false, status: res.status, error: body.error, issues: Array.isArray(body.issues) ? body.issues : undefined };
      if (res.status < 500) return last; // 4xx: retrying the same body won't help
    } catch {
      last = { ok: false, status: 0, error: "network" };
    }
    await new Promise((r) => setTimeout(r, 800 * (i + 1)));
  }
  return last;
}
