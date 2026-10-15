// Run limits for /api/check: a global daily cap on pipeline runs (Firestore
// counter shared by all Cloud Run instances) and a per-IP per-minute cap kept
// in memory. If Firestore is unavailable, an in-memory daily counter is used
// so the cost cap still holds on this instance.
import { DAILY_RUN_LIMIT, RUNS_PER_MINUTE_PER_IP } from "./limits.js";
import { takeDailyRunGlobal } from "./firestore.js";

const MINUTE_MS = 60_000;

let fallbackDay = today();
let fallbackRunsToday = 0;
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

function takeDailyRunLocal() {
  if (today() !== fallbackDay) {
    fallbackDay = today();
    fallbackRunsToday = 0;
  }
  if (fallbackRunsToday >= DAILY_RUN_LIMIT) return false;
  fallbackRunsToday += 1;
  return true;
}

async function takeDailyRun() {
  try {
    return await takeDailyRunGlobal(DAILY_RUN_LIMIT);
  } catch (err) {
    console.warn(JSON.stringify({ event: "run_counter_fallback", message: err.message }));
    return takeDailyRunLocal();
  }
}

/**
 * Checks both limits and, if allowed, counts this run.
 * Returns { allowed: true } or { allowed: false, reason: "daily" | "minute" }.
 */
export async function takeRun(ip) {
  const now = Date.now();
  if (recentByIp.size > 1000) sweep(now);
  // Check the per-minute limit first so a fast caller does not use up the daily budget.
  const recent = recentRuns(ip, now);
  if (recent.length >= RUNS_PER_MINUTE_PER_IP) return { allowed: false, reason: "minute" };
  // Reserve the slot before awaiting Firestore, so concurrent requests cannot all pass.
  recentByIp.set(ip, [...recent, now]);
  if (!(await takeDailyRun())) {
    recentByIp.set(ip, recentRuns(ip, Date.now()).filter((t) => t !== now));
    return { allowed: false, reason: "daily" };
  }
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
