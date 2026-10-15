import { runCheck } from "@/lib/pipeline/runCheck";
import { LANGUAGES } from "@/lib/pipeline/decide";
import { GeminiError } from "@/lib/gemini";

const MAX_CONVERSATION_CHARS = 8000;

function validate(body) {
  const payeeId = String(body?.payeeId || "").trim();
  const amount = Number(body?.amount);
  const conversation = String(body?.conversation || "").trim();
  const language = body?.language || "en";

  if (!payeeId) return { error: "Please enter the payee." };
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Please enter an amount greater than zero." };
  if (!conversation) return { error: "Please paste the conversation." };
  if (conversation.length > MAX_CONVERSATION_CHARS) {
    return { error: `The conversation is too long (max ${MAX_CONVERSATION_CHARS} characters).` };
  }
  if (!LANGUAGES[language]) return { error: "Unsupported language." };
  return { input: { payeeId, amount, conversation, language } };
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

  try {
    const result = await runCheck(input);
    return Response.json(result);
  } catch (err) {
    console.error(JSON.stringify({ event: "check_failed", step: err.step, message: err.message }));
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
