import { getCase, decideCase } from "@/lib/firestore";
import { readJsonBody } from "@/lib/http";

const MAX_NOTE_CHARS = 1000;

export async function GET(request, { params }) {
  const { id } = await params;
  try {
    const found = await getCase(id);
    if (!found) return Response.json({ error: "Case not found." }, { status: 404 });
    return Response.json({ case: found });
  } catch (err) {
    console.error(JSON.stringify({ event: "case_get_failed", message: err.message }));
    return Response.json({ error: "Could not load this case. Please try again." }, { status: 500 });
  }
}

// PATCH { decision: "confirm_hold" | "release", note }
export async function PATCH(request, { params }) {
  const { id } = await params;
  const body = await readJsonBody(request);
  if (body.error) return Response.json({ error: body.error }, { status: body.status });

  const note = String(body.data?.note || "").trim().slice(0, MAX_NOTE_CHARS);
  try {
    const result = await decideCase(id, body.data?.decision, note);
    if (result.error) return Response.json({ error: result.error }, { status: result.status });
    console.log(JSON.stringify({ event: "case_decided", id, status: result.case.status }));
    return Response.json({ case: result.case });
  } catch (err) {
    console.error(JSON.stringify({ event: "case_decide_failed", message: err.message }));
    return Response.json({ error: "Could not save the decision. Please try again." }, { status: 500 });
  }
}
