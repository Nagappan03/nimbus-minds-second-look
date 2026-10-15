import { getCase } from "@/lib/firestore";
import { draftCaseSummary } from "@/lib/caseSummary";
import { takeRun, clientIp } from "@/lib/rateLimit";
import { readJsonBody } from "@/lib/http";

// POST {}: draft a short SAR-style summary of the case with Gemini. Not saved.
// It is a Gemini call, so it counts towards the same run limits as /api/check:
// the per-IP per-minute limit and the global Firestore daily counter.
export async function POST(request, { params }) {
  const { id } = await params;
  // Same 50 KB body limit as the other routes, checked before anything else.
  const body = await readJsonBody(request);
  if (body.error) return Response.json({ error: body.error }, { status: body.status });

  let found;
  try {
    found = await getCase(id);
  } catch (err) {
    console.error(JSON.stringify({ event: "case_get_failed", message: err.message }));
    return Response.json({ error: "Could not load this case. Please try again." }, { status: 500 });
  }
  if (!found) return Response.json({ error: "Case not found." }, { status: 404 });

  const run = await takeRun(clientIp(request));
  if (!run.allowed) {
    const error =
      run.reason === "daily"
        ? "Today's limit of AI requests has been reached. Please write the summary by hand or try tomorrow."
        : "Too many requests. Please wait a minute and try again.";
    return Response.json({ error }, { status: 429 });
  }

  try {
    return Response.json(await draftCaseSummary(found));
  } catch {
    return Response.json({ error: "The AI service could not draft a summary. Please try again." }, { status: 502 });
  }
}
