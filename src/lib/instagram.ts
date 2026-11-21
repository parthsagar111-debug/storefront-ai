// QA-02: accept what creators actually paste — "@handle", "handle", or a profile URL — and reduce it to the handle.

const URL_PREFIX = /^(?:https?:\/\/)?(?:www\.|m\.)?instagram\.com\//i;
export const HANDLE_RE = /^[A-Za-z0-9._]{1,30}$/;
export const INSTAGRAM_HINT = "Use just your handle, like @ananyas.kitchen";
const BAD_URL = "\u0000"; // never a valid handle: a profile URL with nothing after the domain

/** Strip a profile-URL prefix (plus its query string / fragment and trailing "/") and a leading "@". Does not validate. */
export function normalizeInstagram(raw: string): string {
  let s = raw.trim();
  if (URL_PREFIX.test(s)) {
    s = s.replace(URL_PREFIX, "").replace(/[?#].*$/, "").replace(/\/+$/, "");
    if (s === "") return BAD_URL;
  }
  return s.replace(/^@/, "").trim();
}

/** "" for empty input, the handle if valid, or null if it still isn't a valid handle. */
export function parseInstagram(raw: string | undefined | null): string | null {
  const h = normalizeInstagram(raw ?? "");
  if (h === "") return "";
  return HANDLE_RE.test(h) ? h : null;
}
