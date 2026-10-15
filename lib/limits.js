// Cost guardrails on input size (see "Cost guardrails" in CLAUDE.md).
export const MAX_CONVERSATION_CHARS = 6000;
export const MAX_IMAGE_PX = 1024; // longest side; used from Stage 2 (screenshots)
export const MAX_AUDIO_SECONDS = 60; // used from Stage 2 (voice notes)

// Rate limits for /api/check.
export const DAILY_RUN_LIMIT = Number(process.env.DAILY_RUN_LIMIT) || 200;
export const RUNS_PER_MINUTE_PER_IP = 5;
