// Renders the three demo conversations as synthetic chat screenshots in
// public/samples/ (rent.png, officer.png, investment.png), using a simple HTML
// chat layout and the locally installed Google Chrome in headless mode.
// No new dependencies. All names and numbers are synthetic.
// Run: npm run make-samples   (set CHROME_PATH if Chrome is installed elsewhere)
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEMO_SCENARIOS } from "../lib/demoScenarios.js";

const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUT_DIR = fileURLToPath(new URL("../public/samples/", import.meta.url));
const FILES = { rent: "rent.png", authority: "officer.png", investment: "investment.png" };
const WIDTH = 390;

const escapeHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Splits "[10:02] Name: text" lines into messages; a line without "Name:" becomes the chat title. */
function parse(conversation) {
  let title = null;
  const messages = [];
  for (const line of conversation.split("\n")) {
    const m = line.match(/^(?:\[(\d\d:\d\d)\]\s*)?([^:]{1,40}):\s(.*)$/);
    if (m) messages.push({ time: m[1], speaker: m[2].trim(), text: m[3] });
    else if (!title) title = line.trim();
  }
  messages.forEach((msg, i) => (msg.time ||= `10:${String(14 + i * 2).padStart(2, "0")}`));
  title ||= messages.find((msg) => msg.speaker !== "Me")?.speaker || "Chat";
  return { title, messages };
}

function bubble({ speaker, text, time }) {
  const mine = speaker === "Me";
  return `<div class="row ${mine ? "mine" : ""}"><div class="bubble">
    ${mine ? "" : `<div class="name">${escapeHtml(speaker)}</div>`}
    <div>${escapeHtml(text)}</div><div class="time">${time}${mine ? " ✓✓" : ""}</div>
  </div></div>`;
}

function page({ title, messages }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; }
  body { margin: 0; width: ${WIDTH}px; font: 15px/1.4 -apple-system, "Segoe UI", Roboto, sans-serif; background: #e9e4dc; }
  .bar { background: #1f6f5c; color: #fff; padding: 14px 16px; font-weight: 600; display: flex; gap: 10px; align-items: center; }
  .avatar { width: 34px; height: 34px; border-radius: 50%; background: #b9d6cc; color: #1f6f5c; display: grid; place-items: center; font-size: 15px; }
  .sub { font-size: 12px; font-weight: 400; opacity: 0.8; }
  .chat { padding: 12px 10px 18px; display: flex; flex-direction: column; gap: 8px; }
  .row { display: flex; }
  .row.mine { justify-content: flex-end; }
  .bubble { max-width: 78%; background: #fff; padding: 7px 10px 5px; border-radius: 10px; box-shadow: 0 1px 1px rgba(0,0,0,.08); }
  .mine .bubble { background: #d9fdd3; }
  .name { font-size: 13px; font-weight: 600; color: #1f6f5c; margin-bottom: 2px; }
  .time { font-size: 11px; color: #667; text-align: right; margin-top: 2px; }
  </style></head><body>
  <div class="bar"><div class="avatar">${escapeHtml(title[0])}</div><div>${escapeHtml(title)}<div class="sub">online</div></div></div>
  <div class="chat">${messages.map(bubble).join("")}</div></body></html>`;
}

// Rough height so the whole chat fits: about 34 characters per bubble line.
function estimateHeight(messages) {
  return 70 + messages.reduce((h, m) => h + 52 + Math.ceil(m.text.length / 34) * 21 + (m.speaker === "Me" ? 0 : 18), 0);
}

mkdirSync(OUT_DIR, { recursive: true });
const dir = mkdtempSync(join(tmpdir(), "samples-"));
try {
  for (const demo of DEMO_SCENARIOS) {
    const chat = parse(demo.conversation);
    const html = join(dir, `${demo.id}.html`);
    writeFileSync(html, page(chat));
    const out = join(OUT_DIR, FILES[demo.id]);
    execFileSync(CHROME, [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--force-device-scale-factor=2",
      `--window-size=${WIDTH},${estimateHeight(chat.messages)}`,
      `--screenshot=${out}`,
      `file://${html}`,
    ], { stdio: "ignore" });
    console.log(`Wrote public/samples/${FILES[demo.id]}`);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
