// Telegram front end (grammY). One conversation history per chat, processed
// one message at a time per chat, many chats in parallel.
import { Bot, GrammyError, HttpError } from "grammy";
import { runAgent } from "./agent.js";
import { getProfile, deleteProfile } from "./store.js";
import { toTelegramHtml, splitMessage } from "./telegramFormat.js";

const WELCOME = `🔮 សួស្តី! ខ្ញុំជា ហោរាខ្មែរ AI។

ខ្ញុំអាចមើលជោគវាសនាតាម៖
☸ ហោរាសាស្ត្រខ្មែរ (លគ្ន ភព ទក្សា)
八 បាជឺ (八字) និង ហុងស៊ុយ
🔢 លេខសាស្ត្រ · ☯ គម្ពីរ I Ching · លេខទូរស័ព្ទ/ផ្ទះ
🃏 បៃតារ៉ូ · 👁 យាមកាំភ្លើង និង ត្រីនេត្រ
📅 ជ្រើសថ្ងៃល្អ (He-Luo, 玄空大卦) · 🧭 ទឹក 三合

សួរខ្ញុំបានដោយផ្ទាល់ ឧ. «ខ្ញុំកើត ១៥/០៥/១៩៩០ ម៉ោង ៨:៣០ ព្រឹក នៅសៀមរាប ឆ្នាំនេះការងារយ៉ាងម៉េច?»

Hello! I'm the Khmer Fortune Teller AI. Ask me anything about love, career, money, dates or numbers — in Khmer or English.

/new — ចាប់ផ្តើមថ្មី (new conversation)
/profile — ព័ត៌មានដែលបានរក្សាទុក (saved details)
/forget — លុបព័ត៌មានរបស់ខ្ញុំ (delete my data)

ℹ️ សម្រាប់ការយល់ដឹង និងកម្សាន្ត · for reflection and entertainment.`;

export function createBot(token, opts = {}) {
  const bot = new Bot(token);
  const histories = new Map(); // chatId -> messages[]
  const queues = new Map(); // chatId -> Promise
  const usage = new Map(); // userId -> timestamps
  const allowed = opts.allowedUserIds?.length ? new Set(opts.allowedUserIds.map(String)) : null;
  const perHour = opts.maxMessagesPerHour || 0;

  const historyOf = (chatId) => {
    if (!histories.has(chatId)) histories.set(chatId, []);
    return histories.get(chatId);
  };

  async function sendReply(ctx, text) {
    for (const part of splitMessage(text)) {
      try {
        await ctx.reply(toTelegramHtml(part), { parse_mode: "HTML", link_preview_options: { is_disabled: true } });
      } catch (err) {
        if (err instanceof GrammyError && err.error_code === 400) await ctx.reply(part); // bad HTML → plain text
        else throw err;
      }
    }
  }

  function rateLimited(userId) {
    if (!perHour) return false;
    const now = Date.now();
    const list = (usage.get(userId) || []).filter((t) => now - t < 3600_000);
    if (list.length >= perHour) return true;
    list.push(now);
    usage.set(userId, list);
    return false;
  }

  bot.use(async (ctx, next) => {
    if (allowed && ctx.from && !allowed.has(String(ctx.from.id))) {
      if (ctx.chat?.type === "private") await ctx.reply("This bot is private. ⛔");
      return;
    }
    await next();
  });

  bot.command(["start", "help"], (ctx) => ctx.reply(WELCOME));
  bot.command("new", (ctx) => {
    histories.delete(ctx.chat.id);
    return ctx.reply("🆕 ចាប់ផ្តើមការសន្ទនាថ្មី។ New conversation started.");
  });
  bot.command("profile", (ctx) => {
    const p = getProfile(ctx.from.id);
    if (!p) return ctx.reply("មិនទាន់មានព័ត៌មានរក្សាទុកទេ។ No saved details yet — just tell me your birth date and I can save it.");
    const lines = Object.entries(p).filter(([k]) => k !== "updated").map(([k, v]) => `• ${k}: ${v}`);
    return ctx.reply("📇 ព័ត៌មានរបស់អ្នក / Your saved details:\n" + lines.join("\n"));
  });
  bot.command("forget", (ctx) => {
    const had = deleteProfile(ctx.from.id);
    histories.delete(ctx.chat.id);
    return ctx.reply(had ? "🗑 បានលុបព័ត៌មានរបស់អ្នករួចហើយ។ Your data has been deleted." : "មិនមានព័ត៌មានត្រូវលុបទេ។ Nothing was saved.");
  });

  bot.on("message:text", (ctx) => {
    let text = ctx.message.text;
    if (text.startsWith("/")) return; // unknown command
    const chat = ctx.chat;
    if (chat.type !== "private") {
      // In groups, answer only when mentioned or replied to.
      const me = ctx.me.username;
      const mentioned = me && text.includes("@" + me);
      const repliedToMe = ctx.message.reply_to_message?.from?.id === ctx.me.id;
      if (!mentioned && !repliedToMe) return;
      if (me) text = text.replaceAll("@" + me, "").trim();
    }
    if (rateLimited(ctx.from.id)) {
      return ctx.reply("⏳ សូមរង់ចាំបន្តិច អ្នកបានសួរច្រើនពេកក្នុងមួយម៉ោងនេះ។ Too many questions this hour, please wait a little.");
    }

    // Queue per chat; don't block grammY's update loop while Claude works.
    const prev = queues.get(chat.id) || Promise.resolve();
    const job = prev.then(() => handle(ctx, text)).catch((e) => console.error("handler error", e));
    queues.set(chat.id, job);
    job.finally(() => queues.get(chat.id) === job && queues.delete(chat.id));
  });

  async function handle(ctx, text) {
    const chatId = ctx.chat.id;
    const history = historyOf(chatId);
    const snapshot = history.length;
    const typing = () => ctx.api.sendChatAction(chatId, "typing").catch(() => {});
    typing();
    const timer = setInterval(typing, 4500);
    try {
      const reply = await runAgent(history, text, {
        userId: ctx.from.id,
        firstName: ctx.from.first_name,
        languageCode: ctx.from.language_code,
        onTool: (name) => console.log(`[chat ${chatId}] tool ${name}`),
      });
      await sendReply(ctx, reply);
    } catch (err) {
      history.splice(snapshot); // drop the failed turn so the history stays valid
      console.error(`[chat ${chatId}]`, err);
      await ctx.reply("⚠️ មានបញ្ហាបច្ចេកទេស សូមព្យាយាមម្តងទៀត។ Something went wrong, please try again.").catch(() => {});
    } finally {
      clearInterval(timer);
    }
  }

  bot.catch((err) => {
    const e = err.error;
    if (e instanceof GrammyError) console.error("Telegram error:", e.description);
    else if (e instanceof HttpError) console.error("Network error:", e);
    else console.error("Bot error:", e);
  });

  return bot;
}
