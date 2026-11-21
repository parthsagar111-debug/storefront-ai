/** 10-digit Indian mobile (starts 6–9). Accepts "+91 98765 43210", "09876543210", etc. Returns 10 digits or null. */
export function normalizeIndianMobile(raw: string | undefined | null): string | null {
  if (!raw) return null;
  // IQA-06: only digits plus spaces, "+", "-" and brackets are allowed — any letter (or other character) is rejected
  // before normalising, so "abc9876543210xyz" can't be read as a valid number.
  if (!/^[\d\s+\-()]+$/.test(raw)) return null;
  let d = raw.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

export function waLink(number: string, name: string, title: string) {
  const text = `Hi ${name}, I'd like to buy "${title}"`;
  return `https://wa.me/91${number}?text=${encodeURIComponent(text)}`;
}

export function waAskLink(number: string, name: string, title: string) {
  const text = `Hi ${name}, I have a question about "${title}"`;
  return `https://wa.me/91${number}?text=${encodeURIComponent(text)}`;
}
