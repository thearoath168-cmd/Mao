// Tool definitions for Claude, plus the dispatcher that runs them.
import * as C from "./chinese.js";
import * as K from "./khmer.js";
import { getProfile, saveProfile, deleteProfile } from "../store.js";
import { ToolInputError } from "./util.js";

const date = (d) => ({ type: "string", description: d || "Date as YYYY-MM-DD (Gregorian)" });
const time = (d) => ({ type: "string", description: d || "Time as HH:MM, 24-hour, local time" });
const gender = { type: "string", enum: ["male", "female"] };

export const CUSTOM_TOOLS = [
  {
    name: "calendar_info",
    description:
      "Today's (or a given day's) calendar facts: Khmer lunar date (កើត/រោច day and month), weekday, Thai BE and Chula Sakarat years, BaZi year/month/day/hour pillars, and the current Yam Atthakal (យាម) number. Call this whenever a question depends on today's date or the lunar day.",
    input_schema: {
      type: "object",
      properties: { date: date("Optional date; defaults to today in the bot's timezone"), time: time("Optional time; defaults to now") },
    },
  },
  {
    name: "bazi_chart",
    description:
      "Calculate a BaZi (Four Pillars of Destiny 八字) chart: the four pillars with hidden stems, Day Master and its strength (support %), useful gods, five-element weights, the Ten Gods (十神) of every stem with their meanings, Ten God clash patterns, and the eight 10-year luck cycles. Use for questions on personality, career, wealth, relationships, health tendencies, and life periods.",
    input_schema: {
      type: "object",
      properties: { birth_date: date(), birth_time: time("Birth time HH:MM (optional but improves accuracy)"), gender },
      required: ["birth_date", "gender"],
    },
  },
  {
    name: "feng_shui_kua",
    description:
      "Feng Shui personal reading: Kua number (Eight Mansions 八宅), East/West group, the 4 good and 4 bad personal directions, and the annual flying-star chart (center star, stars by direction, Tai Sui, Sui Po) for a chart year. Use for bed/desk/door direction, home layout and yearly feng shui.",
    input_schema: {
      type: "object",
      properties: { birth_date: date(), gender, chart_year: { type: "integer", description: "Year for the annual chart (default: current year)" } },
      required: ["birth_date", "gender"],
    },
  },
  {
    name: "khmer_horoscope",
    description:
      "Khmer astrology (ហោរាសាស្ត្រខ្មែរ) natal chart using the Suriyayatra method: lagna (ascendant) sign, the ten planets with sign, degree, house (តនុ, កុដុម្ព, ...), dignities (ក្សេត្រ, ឧច្ច, ប្រះ, និច ...), house lords, ទក្សា (Taksa: បរិវារ អាយុ តេជៈ សិរី មូលៈ ឧស្សាហៈ មន្ត្រី កាឡកិណី), and Khmer lunar birth date. Optionally adds transit (ភពចរ) positions for another date. Use for Khmer horoscope, life and timing questions.",
    input_schema: {
      type: "object",
      properties: {
        birth_date: date(),
        birth_time: time("Birth time HH:MM (needed for the lagna; default 06:00 if unknown)"),
        province: { type: "string", description: "Cambodian province of birth (Khmer or English, e.g. 'Phnom Penh', 'Siem Reap'). Default Phnom Penh." },
        method: { type: "string", enum: ["traditional", "sunrise"], description: "Lagna reference: traditional 06:00 + province correction (default) or true sunrise" },
        transit_date: date("Optional date for transit planets (e.g. today)"),
        transit_time: time("Optional transit time"),
      },
      required: ["birth_date"],
    },
  },
  {
    name: "numerology",
    description:
      "Pythagorean numerology (លេខសាស្ត្រ) with Khmer interpretations: Life Path, Destiny (Expression), Lucky number with lucky days, and Maturity number, including personality, strengths, shadow, advice, love, career, money and compatible numbers.",
    input_schema: {
      type: "object",
      properties: { full_name_latin: { type: "string", description: "Full name in Latin letters, e.g. 'Sok Dara'" }, birth_date: date() },
      required: ["full_name_latin", "birth_date"],
    },
  },
  {
    name: "yam_divination",
    description:
      "Khmer Yam divination from the book «ប្រជុំតម្រា ឫក្ស-យាម-ជោគ-ជតា»: យាមកាំភ្លើង (method 'kamphleung', 8 questions) or យាមត្រីនេត្រ (method 'trinet', 24 questions, uses the hour). Call first WITHOUT question_index to get the list of questions, pick the closest one, then call again with question_index. Lunar day defaults to today's Khmer lunar date.",
    input_schema: {
      type: "object",
      properties: {
        method: { type: "string", enum: ["kamphleung", "trinet"] },
        question_index: { type: "integer", description: "Index from the question list" },
        lunar_phase: { type: "string", enum: ["waxing", "waning"], description: "Optional; កើត=waxing, រោច=waning" },
        lunar_day: { type: "integer", description: "Optional lunar day 1–15" },
        date: date("Optional Gregorian date to take the lunar day from"),
        time: time("Trinet only: time the question is asked (default now)"),
      },
      required: ["method"],
    },
  },
  {
    name: "tarot",
    description:
      "Tarot (Rider–Waite, 78 cards) with full Khmer meanings for general, work, money, love, health and reversed. action 'draw' shuffles and deals a spread (single, three = past/present/future, situation, love, five, celtic). action 'lookup' returns one named card.",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["draw", "lookup"] },
        spread: { type: "string", enum: ["single", "three", "situation", "love", "five", "celtic"] },
        card: { type: "string", description: "lookup: card name in English or Khmer, e.g. 'The Star', 'Three of Cups'" },
        reversed: { type: "boolean", description: "lookup: show as reversed" },
      },
      required: ["action"],
    },
  },
  {
    name: "iching",
    description:
      "I Ching (易經). action 'cast' throws three coins six times and returns the primary hexagram, changing lines with the book's line texts, commentary and summary, and the relating hexagram. action 'lookup' returns a hexagram (and optionally one line). action 'number_oracle' reads a 4-digit number (0000–9999) with the Yi Number Oracle (Khmer reading), e.g. for phone, house or plate numbers.",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["cast", "lookup", "number_oracle"] },
        hexagram: { type: "integer", description: "lookup: 1–64" },
        line: { type: "integer", description: "lookup: 1–6 (7 = all lines change, hexagrams 1 and 2 only)" },
        number: { type: "string", description: "number_oracle: up to 4 digits (the last 4 digits are used)" },
      },
      required: ["action"],
    },
  },
  {
    name: "he_luo_date",
    description:
      "He-Luo (河洛) date selection for a house sitting mountain: verdict for each 2-hour slot of a date (with killing numbers), or with month_planner=true, every date in a month that has good hours. Use for choosing dates for moving in, opening, construction, ceremonies.",
    input_schema: {
      type: "object",
      properties: {
        sitting: { type: "string", description: "House sitting (back) mountain: palace (Kan, Gen, Zhen, Xun, Li, Kun, Dui, Qian), mountain (子 / Zi, 壬 / Ren ...) or sitting degree" },
        date: date("Date to check (single-date mode)"),
        hour: { type: "string", description: "Optional hour 0–23 to get the detailed verdict of that slot" },
        month_planner: { type: "boolean" },
        year: { type: "integer" },
        month: { type: "integer" },
        month_basis: { type: "string", enum: ["solar", "lunar"] },
        year_basis: { type: "string", enum: ["solar", "lunar"] },
      },
      required: ["sitting"],
    },
  },
  {
    name: "xuan_kong_date",
    description:
      "Xuan Kong Da Gua (玄空大卦) date selection combining the Zhang (張財通) method and the Leyau method: checks a date and time against the house sitting degree and the person's birth year. Without time, scans all 12 hours of the date.",
    input_schema: {
      type: "object",
      properties: {
        date: date(),
        time: time("Optional; omit to scan all hours"),
        site_degree: { type: "number", description: "House sitting degree 0–360 (compass reading of the back of the house)" },
        birth_date: date("Birth date of the main person"),
        tz: { type: "number", description: "UTC offset of the location (default 7)" },
        mode: { type: "string", enum: ["either", "both", "zhang", "leyau"] },
      },
      required: ["date", "site_degree", "birth_date"],
    },
  },
  {
    name: "san_he_water",
    description:
      "San He water method (三合水法): analyses dragon vein direction, water entry and water exit among the 12 double mountains (壬子 癸丑 艮寅 甲卯 乙辰 巽巳 丙午 丁未 坤申 庚酉 辛戌 乾亥): frame, sweep, stages, formation matches and recommended facings.",
    input_schema: {
      type: "object",
      properties: {
        dragon_vein: { type: "string", description: "Mountain of the dragon vein, e.g. 子 or 壬子" },
        water_entry: { type: "string" },
        water_exit: { type: "string" },
      },
      required: ["dragon_vein", "water_entry", "water_exit"],
    },
  },
  {
    name: "san_he_stages",
    description:
      "San He four frames and 12 growth stages (三合四局 十二长生): from sitting, facing and water mouth (exit), finds the frame and the stage of facing, water mouth and sitting. Optional vein_degree gives the 72-dragon (穿山七十二龙) reading.",
    input_schema: {
      type: "object",
      properties: {
        sitting: { type: "string", description: "Sitting mountain (one of 壬子癸丑艮寅甲卯乙辰巽巳丙午丁未坤申庚酉辛戌乾亥) or degree" },
        facing: { type: "string", description: "Optional facing mountain (default: opposite of sitting)" },
        water_mouth: { type: "string", description: "Water exit mountain or degree" },
        flow: { type: "string", enum: ["auto", "L", "R"] },
        vein_degree: { type: "number" },
      },
      required: ["sitting", "water_mouth"],
    },
  },
  {
    name: "get_user_profile",
    description: "Read the birth details this user saved earlier (name, latin name, birth date/time, gender, province, house sitting degree). Call this before asking the user for birth data.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "save_user_profile",
    description: "Save the user's birth details so later readings don't need them again. Only call when the user has given the details and agreed to save them.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        latin_name: { type: "string" },
        birth_date: date(),
        birth_time: time(),
        gender,
        birth_province: { type: "string" },
        house_sitting_degree: { type: "number" },
        notes: { type: "string" },
      },
    },
  },
  {
    name: "delete_user_profile",
    description: "Delete the user's saved profile when they ask to forget their data.",
    input_schema: { type: "object", properties: {} },
  },
];

const HANDLERS = {
  calendar_info: K.calendarInfo,
  bazi_chart: C.baziChart,
  feng_shui_kua: C.fengShui,
  khmer_horoscope: K.khmerHoroscope,
  numerology: K.numerology,
  yam_divination: K.yamDivination,
  tarot: K.tarot,
  iching: K.iching,
  he_luo_date: C.heLuoDate,
  xuan_kong_date: C.xuanKongDate,
  san_he_water: C.sanHeWater,
  san_he_stages: C.sanHeStages,
  get_user_profile: (_, ctx) => getProfile(ctx.userId) || { saved: false },
  save_user_profile: (input, ctx) => ({ saved: true, profile: saveProfile(ctx.userId, input) }),
  delete_user_profile: (_, ctx) => ({ deleted: deleteProfile(ctx.userId) }),
};

/** Run one tool; returns { content, is_error }. */
export function runTool(name, input, ctx = {}) {
  const fn = HANDLERS[name];
  if (!fn) return { content: `Unknown tool: ${name}`, is_error: true };
  try {
    const out = fn(input || {}, ctx);
    return { content: JSON.stringify(out), is_error: false };
  } catch (err) {
    // Errors thrown inside the vm sandbox come from another realm, so match by name.
    const inputErr = err instanceof ToolInputError || ["RangeError", "HoroscopeInputError"].includes(err?.name);
    const msg = inputErr ? err.message : `Tool failed: ${err?.message || err}`;
    if (!inputErr) console.error(`[tool ${name}]`, err);
    return { content: `Error: ${msg}`, is_error: true };
  }
}
