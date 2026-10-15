// Masks personal identifiers before any text leaves the server for Gemini.
// Order matters: phones are matched before generic long numbers so a phone is
// not mistaken for an account or card number.

const last4 = (digits) => digits.replace(/\D/g, "").slice(-4);

function passesLuhn(digits) {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

const RULES = [
  {
    name: "email",
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\b/g,
    replace: () => "[EMAIL]",
  },
  {
    // UPI-style handles such as name@okbank (no dot after the @).
    name: "upi",
    pattern: /\b[A-Za-z0-9._-]{2,}@[A-Za-z]{2,}\b/g,
    replace: () => "[UPI_ID]",
  },
  {
    // OTP-like codes: 4 to 8 digits shortly after a word such as OTP, code, PIN.
    name: "otp",
    pattern: /\b(otp|one[- ]time (?:password|code)|verification code|code|pin|kode)\b([^\d\n]{0,20})(\d{4,8})\b/gi,
    replace: (_m, word, gap) => `${word}${gap}[OTP]`,
  },
  {
    // International (+CC ...) or 10-digit Indian mobile numbers starting 6 to 9.
    name: "phone",
    pattern: /(?:\+\d{1,3}[ -]?\d{2,5}(?:[ -]?\d{2,5}){1,3})|\b[6-9]\d{4}[ -]?\d{5}\b/g,
    replace: () => "[PHONE]",
  },
  {
    // Long digit runs (optionally grouped): card if 13-19 digits and Luhn-valid,
    // otherwise treated as a bank account number.
    name: "number",
    pattern: /\b\d(?:[ -]?\d){8,18}\b/g,
    replace: (m) => {
      const digits = m.replace(/\D/g, "");
      const isCard = digits.length >= 13 && passesLuhn(digits);
      return isCard ? `[CARD ••${last4(m)}]` : `[ACCOUNT ••${last4(m)}]`;
    },
  },
];

/** Returns { text, counts } where counts says how many of each kind were masked. */
export function maskText(input = "") {
  const counts = {};
  let text = String(input);
  for (const rule of RULES) {
    text = text.replace(rule.pattern, (...args) => {
      counts[rule.name] = (counts[rule.name] || 0) + 1;
      return rule.replace(...args);
    });
  }
  return { text, counts };
}
