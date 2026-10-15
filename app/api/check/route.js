import { runCheck } from "@/lib/pipeline/runCheck";
import { LANGUAGES } from "@/lib/pipeline/decide";
import { GeminiError } from "@/lib/gemini";
import { takeRun, clientIp } from "@/lib/rateLimit";
import { findDemoResult, listDemoResults } from "@/lib/demoResults";

const LIMIT_MESSAGES = {
  daily: "Second Look has reached today's limit of live checks. Please try again tomorrow. You can still see saved example results.",
  minute: "You're checking faster than we can keep up with. Please wait a minute and try again. You can still see saved example results.",
};

function validate(body) {
  const payeeId = String(body?.payeeId || "").trim();
  const amount = Number(body?.amount);
  const conversation = String(body?.conversation || "").trim();
  const language = body?.language || "en";

  if (!payeeId) return { error: "Please enter the payee." };
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Please enter an amount greater than zero." };
  if (!conversation) return { error: "Please paste the conversation." };
  if (!LANGUAGES[language]) return { error: "Unsupported language." };
  // Long text is truncated (not rejected) inside runCheck.
  return { input: { payeeId, amount, conversation, language } };
}

/** When a limit is hit: the saved result for a demo scenario, or all saved examples. */
function limitedResponse(reason, conversation) {
  const message = LIMIT_MESSAGES[reason];
  const demo = findDemoResult(conversation);
  if (demo) return Response.json({ ...demo, limited: reason, notice: message, saved_example: true });
  return Response.json({ error: message, limited: reason, examples: listDemoResults() }, { status: 429 });
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const { error, input } = validate(body);
  if (error) return Response.json({ error }, { status: 400 });

  const ip = clientIp(request);
  const run = takeRun(ip);
  if (!run.allowed) {
    console.log(JSON.stringify({ event: "rate_limited", reason: run.reason }));
    return limitedResponse(run.reason, input.conversation);
  }

  try {
    return Response.json(await runCheck(input));
  } catch (err) {
    // runCheck has already logged the failure with its token usage.
    const isGemini = err instanceof GeminiError;
    return Response.json(
      {
        error: isGemini
          ? "The AI review service did not respond properly. Please try again."
          : "Something went wrong while checking this payment. Please try again.",
        step: err.step || null,
        retryable: true,
      },
      { status: isGemini ? 502 : 500 }
    );
  }
}
