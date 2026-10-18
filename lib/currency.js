// Currencies the customer can pick, the default per language, and display formatting.
// Shared by the customer page, the API and the ops console.

export const CURRENCIES = ["INR", "IDR", "SGD", "USD"];

const DEFAULT_BY_LANGUAGE = { en: "INR", hi: "INR", ta: "INR", id: "IDR" };

export const defaultCurrency = (language) => DEFAULT_BY_LANGUAGE[language] || "INR";

/** "INR 95,000" (Indian grouping for INR, international grouping otherwise). Older cases have no currency. */
export function formatAmount(amount, currency) {
  const locale = currency === "INR" ? "en-IN" : "en-US";
  const number = Number(amount).toLocaleString(locale, { maximumFractionDigits: 2 });
  return currency ? `${currency} ${number}` : number;
}
