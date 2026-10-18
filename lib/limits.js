// Cost guardrails on input size (see "Cost guardrails" in CLAUDE.md).
export const MAX_CONVERSATION_CHARS = 6000;
export const MAX_IMAGE_PX = 1024; // longest side; the browser downscales before upload
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const MAX_UPLOAD_FILE_BYTES = 8 * 1024 * 1024; // rejected in the browser before processing
export const MAX_BODY_BYTES = 50 * 1024; // text-only requests
export const MAX_IMAGE_BODY_BYTES = 700 * 1024; // whole request when a screenshot is attached
export const MAX_AUDIO_SECONDS = 60; // used from Stage 2 (voice notes)

// Rate limits for /api/check.
export const DAILY_RUN_LIMIT = Number(process.env.DAILY_RUN_LIMIT) || 200;
export const RUNS_PER_MINUTE_PER_IP = 5;
