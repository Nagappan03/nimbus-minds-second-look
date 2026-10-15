import { listCases, STATUS } from "@/lib/firestore";

const FILTERS = new Set([...Object.values(STATUS), "decided"]);

// GET /api/cases?status=pending_review|no_action|hold_confirmed|released|decided
// Newest first, at most 50.
export async function GET(request) {
  const status = new URL(request.url).searchParams.get("status") || null;
  if (status && !FILTERS.has(status)) {
    return Response.json({ error: `Unknown status "${status}".` }, { status: 400 });
  }
  try {
    return Response.json({ cases: await listCases(status) });
  } catch (err) {
    console.error(JSON.stringify({ event: "cases_list_failed", message: err.message }));
    return Response.json({ error: "Could not load cases. Please try again." }, { status: 500 });
  }
}
