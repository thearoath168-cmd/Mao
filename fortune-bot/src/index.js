// Entry point: node --env-file-if-exists=.env src/index.js
process.env.TZ = process.env.BOT_TZ || "Asia/Phnom_Penh";

const { createBot } = await import("./bot.js");
const { ALL_ENGINES } = await import("./engines/load.js");

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error("Missing TELEGRAM_BOT_TOKEN (get one from @BotFather). See README.md.");
  process.exit(1);
}
if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
  console.error("Missing ANTHROPIC_API_KEY (create one at https://console.anthropic.com). See README.md.");
  process.exit(1);
}

// Load every calculator once at startup so a broken source file fails fast.
for (const [name, load] of Object.entries(ALL_ENGINES)) load();
console.log("Engines loaded:", Object.keys(ALL_ENGINES).join(", "));

const bot = createBot(token, {
  allowedUserIds: (process.env.ALLOWED_USER_IDS || "").split(",").map((s) => s.trim()).filter(Boolean),
  maxMessagesPerHour: Number(process.env.MAX_MESSAGES_PER_HOUR || 30),
});

await bot.api.setMyCommands([
  { command: "start", description: "ណែនាំ · Welcome" },
  { command: "new", description: "ចាប់ផ្តើមថ្មី · New conversation" },
  { command: "profile", description: "ព័ត៌មានរបស់ខ្ញុំ · My saved details" },
  { command: "forget", description: "លុបព័ត៌មាន · Delete my data" },
]);

const stop = () => bot.stop();
process.once("SIGINT", stop);
process.once("SIGTERM", stop);

console.log("Khmer Fortune Teller bot is running…");
await bot.start({ drop_pending_updates: true, onStart: (me) => console.log(`Logged in as @${me.username}`) });
