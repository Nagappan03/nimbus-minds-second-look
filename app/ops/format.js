// Display helpers shared by the ops pages.

export function formatTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

export { formatAmount } from "@/lib/currency";
