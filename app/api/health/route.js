export async function GET() {
  return Response.json({ status: "ok", model: process.env.GEMINI_MODEL || null });
}
