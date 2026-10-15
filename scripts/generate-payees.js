// Generates data/payees-seed.json: about 300 synthetic payees for the BigQuery
// payee risk table. Deterministic (seeded), so re-running gives the same file.
// Mix: ~70% low, ~20% medium, ~10% high risk. High-risk payees follow mule-like
// patterns (very new account, many senders, high pass-through, prior reports).
// Display names are neutral for every risk level, so a name never hints at the verdict.
// Run: node scripts/generate-payees.js
import { writeFileSync } from "node:fs";

// Small seeded PRNG (mulberry32) so the output is stable between runs.
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20261015);
const int = (min, max) => min + Math.floor(rand() * (max - min + 1));
const ratio = (min, max) => Number((min + rand() * (max - min)).toFixed(2));
const pick = (list) => list[Math.floor(rand() * list.length)];

const FIRST_IN = ["Aarav", "Ananya", "Arjun", "Deepa", "Farhan", "Gita", "Harish", "Ishaan", "Kavya", "Lakshmi", "Manoj",
  "Meena", "Naveen", "Pooja", "Rajesh", "Sana", "Suresh", "Divya", "Vikram", "Anjali", "Karthik", "Priya", "Rohit",
  "Sneha", "Arun", "Bhavna", "Dinesh", "Nisha", "Sanjay", "Usha"];
const FIRST_ID = ["Ayu", "Budi", "Dewi", "Eko", "Fitri", "Hendra", "Indah", "Joko", "Putri", "Rizki", "Siti", "Wahyu",
  "Yusuf", "Lestari", "Agus"];
const LAST_IN = ["Iyer", "Menon", "Sharma", "Patel", "Reddy", "Nair", "Rao", "Gupta", "Kumar", "Pillai", "Das", "Joshi",
  "Verma", "Desai", "Krishnan", "Bose", "Shetty", "Mehta", "Subramanian", "Chandran"];
const LAST_ID = ["Santoso", "Wijaya", "Pratama", "Saputra", "Hidayat", "Nugroho", "Kusuma", "Setiawan", "Halim", "Gunawan"];
const BIZ_A = ["Sri", "Anand", "Sai", "Green Leaf", "Sunrise", "Harbour", "Lotus", "Kaveri", "Nusantara", "Coastal",
  "Metro", "Blue Hill", "Ganesh", "Mitra", "Silver Oak"];
const BIZ_B = ["Traders", "Textiles", "Electricals", "Stores", "Pharma", "Hardware", "Catering", "Motors", "Bakery",
  "Furnishings", "Tours", "Enterprises", "Printers", "Agencies"];

const usedNames = new Set();
function uniqueName(make) {
  for (;;) {
    const name = make();
    if (!usedNames.has(name)) {
      usedNames.add(name);
      return name;
    }
  }
}
const personName = () =>
  uniqueName(() => {
    const indian = rand() < 0.75;
    return indian ? `${pick(FIRST_IN)} ${pick(LAST_IN)}` : `${pick(FIRST_ID)} ${pick(LAST_ID)}`;
  });
const businessName = () => uniqueName(() => `${pick(BIZ_A)} ${pick(BIZ_B)}`);

function lowPayee() {
  const business = rand() < 0.3;
  return {
    display_name: business ? businessName() : personName(),
    account_age_days: int(365, 4000),
    prior_reports: 0,
    inbound_senders_24h: business ? int(3, 40) : int(0, 4),
    pass_through_ratio: ratio(0, 0.3),
    flags: business ? ["registered_business"] : [],
    risk_level: "low",
  };
}

function mediumPayee() {
  // One or two moderate warning signs, never the full mule pattern.
  const p = {
    display_name: personName(),
    account_age_days: int(200, 2000),
    prior_reports: 0,
    inbound_senders_24h: int(0, 6),
    pass_through_ratio: ratio(0.05, 0.4),
    flags: [],
    risk_level: "medium",
  };
  const signs = ["young", "report", "senders", "passthrough"].sort(() => rand() - 0.5).slice(0, int(1, 2));
  if (signs.includes("young")) {
    p.account_age_days = int(30, 180);
    p.flags.push("new_account");
  }
  if (signs.includes("report")) {
    p.prior_reports = 1;
    p.flags.push("prior_fraud_report");
  }
  if (signs.includes("senders")) {
    p.inbound_senders_24h = int(8, 14);
    p.flags.push("many_unrelated_senders_24h");
  }
  if (signs.includes("passthrough")) {
    p.pass_through_ratio = ratio(0.55, 0.75);
    p.flags.push("high_pass_through");
  }
  return p;
}

function highPayee() {
  return {
    display_name: personName(),
    account_age_days: int(3, 45),
    prior_reports: int(1, 6),
    inbound_senders_24h: int(15, 80),
    pass_through_ratio: ratio(0.85, 0.99),
    flags: ["new_account", "many_unrelated_senders_24h", "high_pass_through", "prior_fraud_report"],
    risk_level: "high",
  };
}

// The original 10 payees, replaced with neutral names. PAYEE-1001 (landlord),
// PAYEE-1004 (officer demo) and PAYEE-1005 (investment demo) back the demo scenarios.
const FIXED = [
  { payee_id: "PAYEE-1001", display_name: "Meera Iyer", account_age_days: 2920, prior_reports: 0, inbound_senders_24h: 1, pass_through_ratio: 0.02, flags: [], risk_level: "low" },
  { payee_id: "PAYEE-1002", display_name: "Sharma Electricals", account_age_days: 1825, prior_reports: 0, inbound_senders_24h: 9, pass_through_ratio: 0.12, flags: ["registered_business"], risk_level: "low" },
  { payee_id: "PAYEE-1003", display_name: "Arjun Menon", account_age_days: 1460, prior_reports: 0, inbound_senders_24h: 0, pass_through_ratio: 0.05, flags: [], risk_level: "low" },
  { payee_id: "PAYEE-1004", display_name: "Vikram Rao", account_age_days: 9, prior_reports: 4, inbound_senders_24h: 47, pass_through_ratio: 0.97, flags: ["new_account", "many_unrelated_senders_24h", "high_pass_through", "prior_fraud_report"], risk_level: "high" },
  { payee_id: "PAYEE-1005", display_name: "Nikhil Desai", account_age_days: 23, prior_reports: 2, inbound_senders_24h: 31, pass_through_ratio: 0.93, flags: ["new_account", "many_unrelated_senders_24h", "high_pass_through", "prior_fraud_report"], risk_level: "high" },
  { payee_id: "PAYEE-1006", display_name: "Rahul Kumar", account_age_days: 41, prior_reports: 1, inbound_senders_24h: 18, pass_through_ratio: 0.88, flags: ["new_account", "many_unrelated_senders_24h", "high_pass_through", "prior_fraud_report"], risk_level: "high" },
  { payee_id: "PAYEE-1007", display_name: "Budi Santoso", account_age_days: 2190, prior_reports: 0, inbound_senders_24h: 2, pass_through_ratio: 0.08, flags: [], risk_level: "low" },
  { payee_id: "PAYEE-1008", display_name: "Deepak Joshi", account_age_days: 15, prior_reports: 3, inbound_senders_24h: 26, pass_through_ratio: 0.95, flags: ["new_account", "many_unrelated_senders_24h", "high_pass_through", "prior_fraud_report"], risk_level: "high" },
  { payee_id: "PAYEE-1009", display_name: "Lakshmi Textiles", account_age_days: 3650, prior_reports: 0, inbound_senders_24h: 14, pass_through_ratio: 0.1, flags: ["registered_business"], risk_level: "low" },
  { payee_id: "PAYEE-1010", display_name: "Priya Subramanian", account_age_days: 120, prior_reports: 0, inbound_senders_24h: 2, pass_through_ratio: 0.15, flags: ["new_account"], risk_level: "medium" },
];
FIXED.forEach((p) => usedNames.add(p.display_name));

// 290 generated payees: 203 low, 58 medium, 29 high (plus the fixed 10 gives ~70/20/10).
const generated = [
  ...Array.from({ length: 203 }, lowPayee),
  ...Array.from({ length: 58 }, mediumPayee),
  ...Array.from({ length: 29 }, highPayee),
].sort(() => rand() - 0.5); // shuffle so ids do not reveal the risk level

const payees = [
  ...FIXED,
  ...generated.map((p, i) => ({ payee_id: `PAYEE-${1011 + i}`, ...p })),
];

writeFileSync(new URL("../data/payees-seed.json", import.meta.url), JSON.stringify(payees, null, 2) + "\n");
const counts = payees.reduce((c, p) => ({ ...c, [p.risk_level]: (c[p.risk_level] || 0) + 1 }), {});
console.log(`Wrote ${payees.length} payees`, counts);
