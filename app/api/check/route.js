import { runCheck } from "@/lib/pipeline/runCheck";
import { LANGUAGES } from "@/lib/pipeline/decide";
import { payeeName } from "@/lib/pipeline/payeeRisk";
import { GeminiError } from "@/lib/gemini";
import { takeRun, clientIp } from "@/lib/rateLimit";
import { findDemoResult, listDemoResults } from "@/lib/demoResults";
import { readJsonBody } from "@/lib/http";
import { saveCase } from "@/lib/firestore";
import { CURRENCIES } from "@/lib/currency";

const LIMIT_MESSAGES = {
  daily: "Second Look has reached today's limit of live checks. Please try again tomorrow. You can still see saved example results.",
  minute: "You're checking faster than we can keep up with. Please wait a minute and try again. You can still see saved example results.",
};

function validate(body) {
  const payeeId = String(body?.payeeId || "").trim();
  const amount = Number(body?.amount);
  const conversation = String(body?.conversation || "").trim();
  const language = body?.language || "en";
  const currency = body?.currency || "INR";

  if (!payeeId) return { error: "Please enter the payee." };
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Please enter an amount greater than zero." };
  if (!conversation) return { error: "Please paste the conversation." };
  if (!LANGUAGES[language]) return { error: "Unsupported language." };
  if (!CURRENCIES.includes(currency)) return { error: `Currency must be one of ${CURRENCIES.join(", ")}.` };
  // Long text is truncated (not rejected) inside runCheck.
  return { input: { payeeId, amount, currency, conversation, language } };
}

/** When a limit is hit: the saved result for a demo scenario, or all saved examples. */
function limitedResponse(reason, conversation) {
  const message = LIMIT_MESSAGES[reason];
  const demo = findDemoResult(conversation);
  if (demo) return Response.json({ ...demo, limited: reason, notice: message, saved_example: true });
  return Response.json({ error: message, limited: reason, examples: listDemoResults() }, { status: 429 });
}

/** Saves the case; a storage failure must not stop the customer seeing their verdict. */
async function trySaveCase(input, result) {
  try {
    const name = result.payee.display_name || payeeName(result.payee.payee_id);
    return await saveCase({ input, maskedConversation: result.masked_conversation, result, payeeName: name });
  } catch (err) {
    console.error(JSON.stringify({ event: "case_save_failed", message: err.message }));
    return null;
  }
}

export async function POST(request) {
  const body = await readJsonBody(request);
  if (body.error) return Response.json({ error: body.error }, { status: body.status });

  const { error, input } = validate(body.data);
  if (error) return Response.json({ error }, { status: 400 });

  const run = await takeRun(clientIp(request));
  if (!run.allowed) {
    console.log(JSON.stringify({ event: "rate_limited", reason: run.reason }));
    return limitedResponse(run.reason, input.conversation);
  }

  let result;
  try {
    result = await runCheck(input);
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

  const caseId = await trySaveCase(input, result);
  // Risk signals stay on the server: the customer gets the verdict and the payee's id and name only.
  return Response.json({
    case_id: caseId,
    decision: result.decision,
    payee: { payee_id: result.payee.payee_id, display_name: result.payee.display_name },
    truncated: result.truncated,
    timings_ms: result.timings_ms,
    tokens: result.tokens,
  });
}
