// Display helpers shared by the ops pages.

export function formatTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

export function formatAmount(amount) {
  return Number(amount).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}
