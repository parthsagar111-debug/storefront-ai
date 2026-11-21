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

const inr = (n: number) => "₹" + n.toLocaleString("en-IN");

/** SPEC v5 V6: WhatsApp prefill with title + price, in the store's language. */
export function waText(kind: "buy" | "ask", name: string, title: string, price: number, language: "en" | "hinglish" = "en") {
  const item = `"${title}" (${inr(price)})`;
  if (language === "hinglish")
    return kind === "buy" ? `Hi ${name}, mujhe ${item} lena hai.` : `Hi ${name}, ${item} ke baare mein ek sawaal hai.`;
  return kind === "buy" ? `Hi ${name}, I'd like to buy ${item}.` : `Hi ${name}, I have a question about ${item}.`;
}

export function waLink(number: string, name: string, title: string, price: number, language: "en" | "hinglish" = "en") {
  return `https://wa.me/91${number}?text=${encodeURIComponent(waText("buy", name, title, price, language))}`;
}

export function waAskLink(number: string, name: string, title: string, price: number, language: "en" | "hinglish" = "en") {
  return `https://wa.me/91${number}?text=${encodeURIComponent(waText("ask", name, title, price, language))}`;
}
