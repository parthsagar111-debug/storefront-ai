import "server-only";
import { createHash, randomBytes } from "node:crypto";

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** Client token: 24 random bytes, base64url → exactly 32 chars (SPEC T11). */
export const TOKEN_RE = /^[A-Za-z0-9_-]{32}$/;
export const isValidToken = (t: unknown): t is string => typeof t === "string" && TOKEN_RE.test(t);
export const tokenHash = (token: string) => sha256(token);

export function ipHash(req: Request): string {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  return sha256(ip + (process.env.IP_HASH_SALT ?? ""));
}

const B36 = "0123456789abcdefghijklmnopqrstuvwxyz";
export function makeSlug(name: string): string {
  const base =
    name
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40)
      .replace(/-+$/g, "") || "store";
  const suffix = Array.from(randomBytes(4), (b) => B36[b % 36]).join("");
  return `${base}-${suffix}`;
}

export const newProductId = () => randomBytes(6).toString("base64url");
