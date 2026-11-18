import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
process.env.TZ = "Asia/Phnom_Penh";
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "fortune-"));
const { runAgent, setClient } = await import("../src/agent.js");
const { toTelegramHtml, splitMessage } = await import("../src/telegramFormat.js");

test("agent runs a tool and returns the final text", async () => {
  const calls = [];
  setClient({
    beta: {
      messages: {
        create: async (req) => {
          calls.push(structuredClone(req.messages));
          if (calls.length === 1) {
            return {
              stop_reason: "tool_use",
              content: [{ type: "tool_use", id: "tu_1", name: "numerology", input: { full_name_latin: "Sok Dara", birth_date: "1990-05-15" } }],
            };
          }
          return { stop_reason: "end_turn", content: [{ type: "text", text: "Life Path **3**" }] };
        },
      },
    },
  });
  const history = [];
  const reply = await runAgent(history, "my numbers?", { userId: 1 });
  assert.equal(reply, "Life Path **3**");
  const toolResult = calls[1].at(-1).content[0];
  assert.equal(toolResult.type, "tool_result");
  assert.match(toolResult.content, /"number":3/);
  assert.deepEqual(history.map((m) => m.role), ["user", "assistant", "user", "assistant"]);
});

test("refusal returns a polite message", async () => {
  setClient({ beta: { messages: { create: async () => ({ stop_reason: "refusal", content: [] }) } } });
  assert.match(await runAgent([], "x", {}), /Sorry/);
});

test("telegram formatting", () => {
  assert.equal(toTelegramHtml("**hi** <x> & - a"), "<b>hi</b> &lt;x&gt; &amp; - a");
  assert.equal(toTelegramHtml("- item"), "• item");
  const parts = splitMessage("a".repeat(3000) + "\n\n" + "b".repeat(3000));
  assert.equal(parts.length, 2);
});
