// In-memory run limits for /api/check: a daily cap on pipeline runs and a
// per-IP per-minute cap. Counters live in this server instance only, so with
// several Cloud Run instances each has its own count. Stage 2 moves this to
// Firestore so the limit is global.
import { DAILY_RUN_LIMIT, RUNS_PER_MINUTE_PER_IP } from "./limits.js";

const MINUTE_MS = 60_000;

let currentDay = today();
let runsToday = 0;
const recentByIp = new Map(); // ip -> timestamps (ms) of runs in the last minute

function today() {
  return new Date().toISOString().slice(0, 10); // UTC date
}

function recentRuns(ip, now) {
  const fresh = (recentByIp.get(ip) || []).filter((t) => now - t < MINUTE_MS);
  if (fresh.length) recentByIp.set(ip, fresh);
  else recentByIp.delete(ip);
  return fresh;
}

// Drops IPs with no runs in the last minute so the map cannot grow without bound.
function sweep(now) {
  for (const ip of recentByIp.keys()) recentRuns(ip, now);
}

/**
 * Checks both limits and, if allowed, counts this run.
 * Returns { allowed: true } or { allowed: false, reason: "daily" | "minute" }.
 */
export function takeRun(ip) {
  const now = Date.now();
  if (today() !== currentDay) {
    currentDay = today();
    runsToday = 0;
  }
  if (runsToday >= DAILY_RUN_LIMIT) return { allowed: false, reason: "daily" };
  if (recentByIp.size > 1000) sweep(now);

  const recent = recentRuns(ip, now);
  if (recent.length >= RUNS_PER_MINUTE_PER_IP) return { allowed: false, reason: "minute" };

  runsToday += 1;
  recentByIp.set(ip, [...recent, now]);
  return { allowed: true };
}

/**
 * Client IP for rate limiting. Google's front end appends the address it saw
 * to X-Forwarded-For: "[<supplied-value>,]<client-ip>" (plus ",<load-balancer-ip>"
 * when an external load balancer is in front). Callers can forge the leading
 * entries, so we use the last one, which Google wrote. If a load balancer is
 * ever added in front of the service, use the second-to-last entry instead.
 */
export function clientIp(request) {
  const entries = (request.headers.get("x-forwarded-for") || "").split(",").map((s) => s.trim()).filter(Boolean);
  return entries.at(-1) || "unknown";
}
