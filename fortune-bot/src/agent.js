// Claude agent loop: sends the conversation with our fortune-telling tools,
// runs the tools Claude asks for, and repeats until Claude gives its answer.
import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT } from "./prompt.js";
import { CUSTOM_TOOLS, runTool } from "./tools/index.js";
import { nowLocal, WEEKDAY_EN, weekdayOf } from "./tools/util.js";

const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";
const EFFORT = process.env.CLAUDE_EFFORT || "medium";
const MAX_STEPS = 15;
const MAX_TURNS_KEPT = Number(process.env.MAX_HISTORY_TURNS || 20);

let client = null; // created on first use; reads ANTHROPIC_API_KEY from the environment
const api = () => (client ||= new Anthropic());
/** Tests can inject a fake client. */
export function setClient(c) {
  client = c;
}

const TOOLS = [
  ...CUSTOM_TOOLS,
  { type: "web_search_20260209", name: "web_search", max_uses: 5 },
  { type: "web_fetch_20260209", name: "web_fetch", max_uses: 3 },
];

/** A user turn that the person typed (not a tool_result message). */
const isRealUserTurn = (m) =>
  m.role === "user" && Array.isArray(m.content) && m.content.some((b) => b.type === "text");

/** Drop the oldest whole exchanges so the history keeps at most `MAX_TURNS_KEPT` user turns. */
function trimHistory(messages) {
  const starts = messages.map((m, i) => (isRealUserTurn(m) ? i : -1)).filter((i) => i >= 0);
  if (starts.length <= MAX_TURNS_KEPT) return messages;
  return messages.slice(starts[starts.length - MAX_TURNS_KEPT]);
}

function contextLine(ctx) {
  const n = nowLocal();
  const parts = [`today=${n.date} (${WEEKDAY_EN[weekdayOf(n.date)]}) ${n.time}`, `timezone=${process.env.TZ}`];
  if (ctx.firstName) parts.push(`telegram_first_name=${ctx.firstName}`);
  if (ctx.languageCode) parts.push(`telegram_language=${ctx.languageCode}`);
  return `<context>${parts.join("; ")}</context>`;
}

/**
 * Run one user message through the agent.
 * @param {object[]} history  conversation so far (mutated: new turns are appended)
 * @param {string} text       what the user wrote
 * @param {object} ctx        { userId, firstName, languageCode, onTool? }
 * @returns {Promise<string>} the reply text
 */
export async function runAgent(history, text, ctx = {}) {
  const trimmed = trimHistory(history);
  if (trimmed !== history) history.splice(0, history.length - trimmed.length);
  history.push({ role: "user", content: [{ type: "text", text: `${contextLine(ctx)}\n${text}` }] });

  for (let step = 0; step < MAX_STEPS; step++) {
    const response = await api().beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages: history,
      cache_control: { type: "ephemeral" },
      output_config: { effort: EFFORT },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });

    history.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "refusal") {
      return "សូមអភ័យទោស ខ្ញុំមិនអាចឆ្លើយសំណួរនេះបានទេ។ សូមសួរម្តងទៀតតាមរបៀបផ្សេង។\nSorry, I can't help with that request. Please try asking in a different way.";
    }
    if (response.stop_reason === "pause_turn") continue; // server tool (web search) wants to keep going

    const toolUses = response.content.filter((b) => b.type === "tool_use");
    if (response.stop_reason === "tool_use" && toolUses.length) {
      const results = toolUses.map((tu) => {
        ctx.onTool?.(tu.name);
        const r = runTool(tu.name, tu.input, ctx);
        return { type: "tool_result", tool_use_id: tu.id, content: r.content, is_error: r.is_error };
      });
      history.push({ role: "user", content: results }); // all results in one message
      continue;
    }

    const reply = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    if (response.stop_reason === "max_tokens") {
      return (reply || "") + "\n\n…(ចម្លើយវែងពេក · reply was cut off — ask me to continue)";
    }
    return reply || "…";
  }
  // Out of steps: close any pending tool calls so the history stays valid.
  const last = history[history.length - 1];
  const pending = last?.role === "assistant" ? last.content.filter((b) => b.type === "tool_use") : [];
  if (pending.length) {
    history.push({
      role: "user",
      content: pending.map((tu) => ({ type: "tool_result", tool_use_id: tu.id, content: "Stopped: step limit reached.", is_error: true })),
    });
    history.push({ role: "assistant", content: [{ type: "text", text: "(stopped)" }] });
  } else if (last?.role === "user") {
    history.push({ role: "assistant", content: [{ type: "text", text: "(stopped)" }] });
  }
  return "សូមអភ័យទោស ការគណនាចំណាយពេលយូរពេក។ សូមសួរម្តងទៀត។\nSorry, that took too many steps. Please ask again.";
}
