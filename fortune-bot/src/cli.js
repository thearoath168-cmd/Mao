// Chat with the agent in the terminal (no Telegram needed):
//   node --env-file-if-exists=.env src/cli.js
process.env.TZ = process.env.BOT_TZ || "Asia/Phnom_Penh";
const readline = await import("node:readline/promises");
const { runAgent } = await import("./agent.js");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const history = [];
console.log("🔮 Khmer Fortune Teller AI — type a question (Ctrl+C to quit)\n");
for (;;) {
  const q = (await rl.question("> ")).trim();
  if (!q) continue;
  const snapshot = history.length;
  try {
    const reply = await runAgent(history, q, { userId: "cli", onTool: (n) => console.log(`  · ${n}`) });
    console.log("\n" + reply + "\n");
  } catch (err) {
    history.splice(snapshot);
    console.error("Error:", err.message);
  }
}
