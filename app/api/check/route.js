import { runCheck } from "@/lib/pipeline/runCheck";
import { LANGUAGES } from "@/lib/pipeline/decide";
import { payeeName } from "@/lib/pipeline/payeeRisk";
import { GeminiError } from "@/lib/gemini";
import { takeRun, clientIp } from "@/lib/rateLimit";
import { findDemoResult, listDemoResults } from "@/lib/demoResults";
import { readJsonBody } from "@/lib/http";
import { validateImage } from "@/lib/image";
import { MAX_BODY_BYTES, MAX_IMAGE_BODY_BYTES } from "@/lib/limits";
import { saveCase } from "@/lib/firestore";
import { CURRENCIES } from "@/lib/currency";

const UNREADABLE =
  "We could not read a conversation from this image. Please try a clearer screenshot of the chat, or paste the text instead.";

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
  if (!LANGUAGES[language]) return { error: "Unsupported language." };
  if (!CURRENCIES.includes(currency)) return { error: `Currency must be one of ${CURRENCIES.join(", ")}.` };

  // A screenshot replaces the pasted text.
  if (body?.image) {
    const checked = validateImage(body.image);
    if (checked.error) return checked;
    return { input: { payeeId, amount, currency, language, image: checked.image } };
  }
  if (!conversation) return { error: "Please paste the conversation." };
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
  // Up to 700 KB when a screenshot is attached; text-only requests keep the 50 KB limit.
  const body = await readJsonBody(request, MAX_IMAGE_BODY_BYTES);
  if (body.error) {
    const error = body.status === 413 ? "The screenshot is too large to send. Please try a smaller or cropped image." : body.error;
    return Response.json({ error }, { status: body.status });
  }
  if (!body.data?.image && body.bytes > MAX_BODY_BYTES) {
    return Response.json({ error: "Request is too large (max 50 KB)." }, { status: 413 });
  }

  const { error, status, input } = validate(body.data);
  if (error) return Response.json({ error }, { status: status || 400 });

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

  // Counted against the limits like any check, but nothing to save.
  if (result.unreadable) return Response.json({ error: UNREADABLE, unreadable: true }, { status: 422 });

  const caseId = await trySaveCase(input, result);
  // Risk signals stay on the server: the customer gets the verdict and the payee's id and name only.
  return Response.json({
    case_id: caseId,
    decision: result.decision,
    payee: { payee_id: result.payee.payee_id, display_name: result.payee.display_name },
    source: result.source,
    transcript: result.source === "screenshot" ? result.masked_conversation : null, // masked
    truncated: result.truncated,
    timings_ms: result.timings_ms,
    tokens: result.tokens,
  });
}
