import { Firestore, Timestamp } from "@google-cloud/firestore";

// Cost guardrails: every read is limited (one document, or at most 50 in a list).
const LIST_LIMIT = 50;
const COUNTERS = "run_counters";
const REVIEWER = "demo-analyst";

export const STATUS = {
  pending: "pending_review",
  noAction: "no_action",
  holdConfirmed: "hold_confirmed",
  released: "released",
};
const DECIDED = [STATUS.holdConfirmed, STATUS.released];
const DECISIONS = { confirm_hold: STATUS.holdConfirmed, release: STATUS.released };

let db;

function getDb() {
  if (!db) db = new Firestore({ projectId: process.env.GOOGLE_CLOUD_PROJECT });
  return db;
}

const cases = () => getDb().collection(process.env.FIRESTORE_COLLECTION || "cases");

/** Firestore Timestamps become ISO strings so the case can be sent as JSON. */
function toCase(doc) {
  const data = doc.data();
  return {
    ...data,
    id: doc.id,
    createdAt: data.createdAt?.toDate().toISOString() ?? null,
    reviewed_at: data.reviewed_at?.toDate().toISOString() ?? null,
  };
}

/** Saves one checked payment as a case and returns its id. */
export async function saveCase({ input, maskedConversation, result, payeeName }) {
  const { decision } = result;
  const ref = cases().doc();
  await ref.set({
    createdAt: Timestamp.now(),
    payee_id: result.payee.payee_id,
    payee_name: payeeName,
    amount: input.amount,
    language: input.language,
    conversation_masked: maskedConversation, // never the raw text
    truncated: result.truncated,
    verdict: decision.verdict,
    score: decision.score,
    decision,
    evidence: result.evidence,
    payee_signals: result.payee,
    patterns: result.patterns,
    timings_ms: result.timings_ms,
    tokens: result.tokens,
    status: decision.verdict === "PROCEED" ? STATUS.noAction : STATUS.pending,
    reviewer: null,
    reviewed_at: null,
    review_note: null,
  });
  return ref.id;
}

/**
 * Newest cases first, at most 50. `status` may be a single status or "decided"
 * (hold_confirmed or released). Filtering by status needs the composite index
 * on (status, createdAt desc) described in the README.
 */
export async function listCases(status) {
  let query = cases();
  if (status === "decided") query = query.where("status", "in", DECIDED);
  else if (status) query = query.where("status", "==", status);
  const snapshot = await query.orderBy("createdAt", "desc").limit(LIST_LIMIT).get();
  return snapshot.docs.map(toCase);
}

export async function getCase(id) {
  const doc = await cases().doc(id).get();
  return doc.exists ? toCase(doc) : null;
}

/**
 * Records a reviewer decision. Only pending_review cases can be decided.
 * Returns { case } or { error, status } for a missing case or an invalid transition.
 */
export async function decideCase(id, decision, note) {
  const newStatus = DECISIONS[decision];
  if (!newStatus) return { error: 'decision must be "confirm_hold" or "release"', status: 400 };
  const ref = cases().doc(id);
  return getDb().runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (!doc.exists) return { error: "Case not found.", status: 404 };
    const current = doc.data().status;
    if (current !== STATUS.pending) {
      return { error: `This case is ${current.replace("_", " ")} and cannot be changed.`, status: 409 };
    }
    const update = { status: newStatus, reviewer: REVIEWER, reviewed_at: Timestamp.now(), review_note: note || null };
    tx.update(ref, update);
    return { case: { ...toCase(doc), ...update, reviewed_at: update.reviewed_at.toDate().toISOString() } };
  });
}

/**
 * Global daily run counter: one document per UTC day, updated in a transaction.
 * Returns true and counts the run if today's total is below the limit.
 */
export async function takeDailyRunGlobal(limit) {
  const day = new Date().toISOString().slice(0, 10);
  const ref = getDb().collection(COUNTERS).doc(day);
  return getDb().runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    const count = doc.exists ? doc.data().count : 0;
    if (count >= limit) return false;
    tx.set(ref, { count: count + 1, updatedAt: Timestamp.now() });
    return true;
  });
}
