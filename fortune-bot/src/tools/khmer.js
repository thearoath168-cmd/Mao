// Khmer astrology (Hora), numerology, Yam Kam Phleung / Trinet, tarot, I Ching
// and calendar tools. Calculations and texts come from the original HTML apps.

import crypto from "node:crypto";
import * as E from "../engines/load.js";
import { plain, need, parseDate, parseTime, nowLocal, kh, WEEKDAY_KM, WEEKDAY_EN, weekdayOf } from "./util.js";

const PLANETS = ["sun", "moon", "mars", "mercury", "jupiter", "venus", "saturn", "rahu", "ketu", "uranus"];
const PLANET_EN = { sun: "Sun", moon: "Moon", mars: "Mars", mercury: "Mercury", jupiter: "Jupiter", venus: "Venus", saturn: "Saturn", rahu: "Rahu", ketu: "Ketu", uranus: "Uranus (Mrityu)" };
const SIGN_EN = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
const HOUSE_EN = ["Self (Tanu)", "Wealth (Kudumba)", "Siblings (Sahaja)", "Home/relatives (Bandhu)", "Children (Putta)", "Enemies/illness (Ari)", "Spouse (Patni)", "Death/hardship (Marana)", "Fortune/merit (Subha)", "Work (Kamma)", "Gains (Labha)", "Loss (Vinasa)"];

function provinceIndex(H, province) {
  if (province === undefined || province === null || province === "") return 0;
  if (/^\d+$/.test(String(province))) {
    const i = +province;
    need(i >= 0 && i < H.Jo.length, "province index out of range");
    return i;
  }
  const s = String(province).toLowerCase();
  const EN = ["phnom penh", "kandal", "kampong cham", "tbong khmum", "prey veng", "svay rieng", "takeo", "kampot", "kep", "sihanoukville", "koh kong", "kampong speu", "kampong chhnang", "pursat", "battambang", "pailin", "banteay meanchey", "oddar meanchey", "siem reap", "kampong thom", "preah vihear", "stung treng", "ratanakiri", "mondulkiri", "kratie"];
  let i = H.Jo.findIndex((p) => p[0].includes(String(province)));
  if (i < 0) i = EN.findIndex((n) => n.replace(/\s/g, "") === s.replace(/[\s-]/g, "") || s.includes(n));
  need(i >= 0, `Unknown Cambodian province '${province}'. Known: ${EN.join(", ")}`);
  return i;
}

function taksa(H, natal, time) {
  const n = natal.calendar.astrologicalWeekday;
  const t = Number(time.split(":")[0]);
  const i = n === 4 && (t >= 18 || t < 6) ? 8 : n;
  const l = H.v4.indexOf(i);
  const res = {};
  H.f8.forEach((name, o) => (res[name] = H.v4[(l + o) % 8]));
  return { born: i === 8 ? "ថ្ងៃពុធពេលយប់ (រាហ៊ូ)" : "ថ្ងៃ" + H.R4[n - 1], groups: res };
}

// ---------------------------------------------------------------- Hora
export function khmerHoroscope({ birth_date, birth_time, province, method, transit_date, transit_time }) {
  const { y } = parseDate(birth_date, "birth_date");
  need(y >= 1600 && y <= 2400, "birth year must be 1600–2400");
  const t = parseTime(birth_time || "06:00", "birth_time");
  const H = E.hora();
  const prov = provinceIndex(H, province);
  const mode = method === "sunrise" ? "sunrise" : "traditional";
  const natal = plain(H.M4({ date: birth_date, time: t.str, prov, mode }));
  let transit = null;
  if (transit_date) {
    parseDate(transit_date, "transit_date");
    transit = plain(H.M4({ date: transit_date, time: parseTime(transit_time || "12:00").str, prov, mode }));
  }
  const asc = natal.points.ascendant;
  const deg = (p) => `${p.degrees}°${String(Math.floor(p.minutes)).padStart(2, "0")}′`;
  const c = natal.calendar.thaiLunarDate;
  const planets = PLANETS.map((k) => {
    const p = natal.points[k];
    const row = {
      planet: `${p.number} ${H.u8[k]} (${PLANET_EN[k]})`,
      sign: `${H.kn[p.sign]} (${SIGN_EN[p.sign]})`,
      degree: deg(p),
      house: `${p.house}. ${H.Uu[p.house - 1]} — ${HOUSE_EN[p.house - 1]}`,
      dignities: H.s8(p.number, p.sign).map((x) => `${x.n} (${x.g > 0 ? "good" : "bad"})`),
      rules_houses: p.ruledHouses,
      nakshatra: p.nakshatraName,
    };
    if (transit) {
      const q = transit.points[k];
      row.transit = `${H.kn[q.sign]} ${deg(q)} → house ${((q.sign - asc.sign + 12) % 12) + 1} from natal lagna`;
    }
    return row;
  });
  return {
    input: { birth_date, birth_time: t.str, province: H.Jo[prov][0], method: mode },
    born: `ថ្ងៃ${H.R4[natal.calendar.civilWeekday - 1]} (${WEEKDAY_EN[natal.calendar.civilWeekday - 1]})`,
    lunar_date: c
      ? `ថ្ងៃ ${kh(c.day)} ${c.phase === "waxing" ? "កើត" : "រោច"} ខែ${c.secondEighthMonth ? "ទុតិយាសាឍ" : H.o8[c.month]} (${c.phase}, day ${c.day}, lunar month ${c.month})`
      : null,
    chula_sakarat: natal.calendar.chulaSakarat,
    lagna: {
      sign: `${H.kn[asc.sign]} (${SIGN_EN[asc.sign]})`,
      degree: deg(asc),
      nakshatra: asc.nakshatraName,
      navamsa_sign: SIGN_EN[asc.navamsaSign],
      lagna_lord: natal.factors.ascendantRuler,
      planets_in_lagna: natal.factors.ascendantOccupants,
      tanuseth: `${natal.factors.tanuseth.number} ${H.u8[natal.factors.tanuseth.key]} (${PLANET_EN[natal.factors.tanuseth.key]})`,
    },
    planets,
    houses: natal.houses.map((h) => ({
      house: `${h.number}. ${H.Uu[h.number - 1]} — ${HOUSE_EN[h.number - 1]}`,
      sign: `${H.kn[h.sign]} (${SIGN_EN[h.sign]})`,
      lord: `${h.ruler.number} ${H.u8[h.ruler.key]} in house ${h.ruler.house}`,
      occupants: h.occupants.map((k) => H.u8[k]),
    })),
    taksa: taksa(H, natal, t.str),
    reference_time: natal.timing ? natal.timing.referenceTimeMinutes : null,
    note: "Suriyayatra method, whole-sign houses. Planet numbers: 1 Sun, 2 Moon, 3 Mars, 4 Mercury, 5 Jupiter, 6 Venus, 7 Saturn, 8 Rahu, 9 Ketu, 0 Uranus.",
  };
}

// ---------------------------------------------------------------- Numerology
export function numerology({ full_name_latin, birth_date }) {
  const { y, m, d } = parseDate(birth_date, "birth_date");
  const letters = String(full_name_latin || "").replace(/[^A-Za-z]/g, "");
  need(letters.length >= 2, "full_name_latin must be the full name written in Latin letters (e.g. Sok Dara)");
  const N = E.numerology();
  const L = plain(N.Kh(y, m, d));
  const D = plain(N.Jh(full_name_latin));
  const [luck, luckSteps] = plain(N.Ot(d, false));
  const [mat, matSteps] = plain(N.Ot(L.lp + D.n));
  const lp = N.Yy[L.lp], lpq = N.qy[L.lp];
  const desc = (n) => `${N.We[n]} · ${N.Xi[n]}`;
  return plain({
    name: full_name_latin,
    life_path: {
      number: L.lp,
      keywords: desc(L.lp),
      steps: L.steps,
      personality: lp.about,
      positive_traits: lp.pos,
      watch_out: lp.neg,
      strength: lpq[0],
      shadow: lpq[1],
      advice: lpq[2],
      love: lp.love,
      career: lp.work,
      money: lp.money,
      compatible_numbers: lp.match,
    },
    destiny: { number: D.n, keywords: desc(D.n), essence: N.By[D.n][0], challenge: N.By[D.n][1], per_word: D.parts.map((p) => `${p.w}=${p.r}`) },
    lucky_number: {
      number: luck,
      steps: luckSteps,
      meaning: N.Ry[luck],
      lucky_days_each_month: Array.from({ length: 31 }, (_, i) => i + 1).filter((x) => N.Ot(x, false)[0] === luck),
    },
    maturity: { number: mat, keywords: desc(mat), steps: matSteps, note: "Emerges gradually from about age 35–50." },
    method: "Pythagorean: A J S=1 · B K T=2 · C L U=3 · D M V=4 · E N W=5 · F O X=6 · G P Y=7 · H Q Z=8 · I R=9. Master numbers 11, 22, 33 are kept.",
  });
}

// ---------------------------------------------------------------- Calendar
function yamOf(h, mi) {
  const m = (h * 60 + mi - 360 + 1440) % 1440;
  return Math.floor(m / 90) + 1;
}

export function lunarDateOf(date) {
  const H = E.hora();
  const r = H.M4({ date, time: "12:00", prov: 0, mode: "traditional" });
  return plain(r.calendar);
}

export function calendarInfo({ date, time }) {
  const now = nowLocal();
  const ds = date || now.date;
  const { y } = parseDate(ds);
  const t = parseTime(time || (date ? "12:00" : now.time));
  const cal = lunarDateOf(ds);
  const c = cal.thaiLunarDate;
  const H = E.hora();
  const B = E.bazi();
  const r = plain(B.calc(ds, t.str, "male"));
  const pil = (p) => (p.s === null ? null : B.STEMS[p.s] + B.BR[p.b]);
  const Y = E.yam();
  const yam = yamOf(t.h, t.mi);
  const wd = weekdayOf(ds);
  return {
    date: ds,
    time: t.str,
    weekday: `${WEEKDAY_KM[wd]} / ${WEEKDAY_EN[wd]}`,
    khmer_lunar: c
      ? {
          phase: c.phase === "waxing" ? "កើត (waxing)" : "រោច (waning)",
          day: c.day,
          month: c.secondEighthMonth ? "ទុតិយាសាឍ" : H.o8[c.month],
          label_km: `ថ្ងៃ${WEEKDAY_KM[wd]} ${kh(c.day)} ${c.phase === "waxing" ? "កើត" : "រោច"} ខែ${c.secondEighthMonth ? "ទុតិយាសាឍ" : H.o8[c.month]}`,
          note: "Lunar date from the Suriyayatra engine (shared Thai/Khmer reckoning); local almanacs can differ by a day in rare years.",
        }
      : null,
    buddhist_era_thai: y + 543,
    chula_sakarat: cal.chulaSakarat,
    bazi: { year: pil(r.pillars[0]), month: pil(r.pillars[1]), day: pil(r.pillars[2]), hour: pil(r.pillars[3]) },
    yam_atthakal: { number: yam, label: Y.yamLabel(yam) },
  };
}

// ---------------------------------------------------------------- Yam
export function yamDivination({ method, question_index, lunar_phase, lunar_day, date, time }) {
  const Y = E.yam();
  const gun = method !== "trinet";
  const qs = gun ? Y.KQ : Y.TQ;
  if (question_index === undefined || question_index === null || question_index === "") {
    return {
      method: gun ? "យាមកាំភ្លើង (Yam Kam Phleung)" : "យាមត្រីនេត្រ (Yam Trinet)",
      questions: qs.map((q, i) => `${i}: ${q[0]}`),
      note: "Call again with question_index set to the closest question.",
    };
  }
  const qi = Number(question_index);
  need(qi >= 0 && qi < qs.length, `question_index must be 0–${qs.length - 1}`);
  const now = nowLocal();
  let phase = lunar_phase, day = lunar_day ? Number(lunar_day) : null;
  let source = "given";
  if (!phase || !day) {
    const c = lunarDateOf(date || now.date).thaiLunarDate;
    phase = c.phase;
    day = c.day;
    source = `Khmer lunar date of ${date || now.date}`;
  }
  const wax = phase === "waxing" || phase === "កើត" || phase === "wax";
  need(day >= 1 && day <= 15, "lunar_day must be 1–15");
  const side = wax ? "ថ្ងៃខ្នើត" : "ថ្ងៃរនោច";
  if (gun) {
    const seq = wax ? Y.WAX : Y.WAN;
    const pos = seq[(day - 1) % 4];
    return {
      method: "យាមកាំភ្លើង",
      lunar: `${side} ${kh(day)} (${source})`,
      question: Y.KQ[qi][0],
      position: Y.KP[pos],
      answer: Y.KQ[qi][1][pos],
      how: `${side} ${kh(day)} → រាប់ជុំ ៤ (${seq.map((i) => Y.KP[i]).join(" → ")}) ត្រូវ «${Y.KP[pos]}»`,
      source: "ប្រជុំតម្រា ឫក្ស-យាម-ជោគ-ជតា ទំព័រ ២៨–៣៨",
    };
  }
  const t = time ? parseTime(time) : { h: now.hour, mi: now.minute };
  const yam = yamOf(t.h, t.mi);
  const start = wax ? ((day - 1) % 3) + 1 : Y.EYE_SEQ_WAN[(day - 1) % 3];
  const n = ((start - 1 + (yam - 1)) % 3) + 1;
  return {
    method: "យាមត្រីនេត្រ",
    lunar: `${side} ${kh(day)} (${source})`,
    yam: Y.yamLabel(yam),
    eye: n,
    question: Y.TQ[qi][0],
    answer: Y.TQ[qi][n],
    how: `${side} ${kh(day)} → ភ្នែកលេខ ${kh(start)} រាប់តាមយាមដល់យាមទី ${kh(yam)} → ត្រូវលេខ ${kh(n)}`,
    source: "ប្រជុំតម្រា ឫក្ស-យាម-ជោគ-ជតា ទំព័រ ២៨–៣៨",
  };
}

// ---------------------------------------------------------------- Tarot
const SPREADS = {
  single: ["Answer / message"],
  three: ["Past", "Present", "Future"],
  situation: ["Situation", "Challenge", "Advice"],
  love: ["You", "The other person", "The relationship"],
  five: ["Present", "Challenge", "Past influence", "Future", "Outcome"],
  celtic: ["Present", "Challenge", "Foundation", "Recent past", "Best outcome", "Near future", "Your attitude", "Environment", "Hopes & fears", "Final outcome"],
};

function cardView(c, reversed) {
  return {
    card: `${c.kh} (${c.en})`,
    orientation: reversed ? "reversed បៃត្រឡប់" : "upright បៃត្រង់",
    meanings: Object.fromEntries(c.rows.map(([k, t]) => [k, t])),
    reversed_meaning: c.rev,
    note: c.bySuit ? "Work/money/love/health rows are read from the suit and the card's tone." : undefined,
  };
}

export function tarot({ action, spread, card, reversed }) {
  const T = E.tarot();
  const cards = T.CARDS;
  if (action === "lookup") {
    const q = String(card || "").toLowerCase().trim();
    need(q, "card name is required for lookup");
    const c = cards.find((x) => x.en.toLowerCase() === q || x.kh === card || x.id === q) ||
      cards.find((x) => x.en.toLowerCase().includes(q) || x.kh.includes(card));
    need(c, `No tarot card matches '${card}'`);
    return plain(cardView(c, !!reversed));
  }
  const positions = SPREADS[spread] || SPREADS.single;
  const deck = [...cards];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return plain({
    spread: spread in SPREADS ? spread : "single",
    cards: positions.map((pos, i) => ({ position: pos, ...cardView(deck[i], crypto.randomInt(10) < 3) })),
    source: "Rider–Waite meanings in Khmer from the Khmer Fortune Teller tarot app",
  });
}

// ---------------------------------------------------------------- I Ching
function lineView(D, n, k) {
  const L = D.L[`${n}.${k}`];
  if (!L) return null;
  return {
    line: k === 7 ? "All lines change" : `Line ${k}`,
    name: L[0],
    text: L[1],
    plain_meaning: L[2],
    summary: L[6],
    commentary: L[3],
  };
}

function hexView(D, n) {
  const H = D.H[n - 1];
  return { number: n, name: `${H[0]} ${H[1]} — ${H[2]}`, trigrams: `${D.T[H[3]]} over ${D.T[H[4]]}`, lines_bottom_to_top: H[5] };
}

export function iching({ action, hexagram, line, number }) {
  const { data: D, oracle: O } = E.iching();
  if (action === "number_oracle") {
    const n = Number(String(number ?? "").replace(/\D/g, "").slice(-4));
    need(Number.isFinite(n) && n >= 0 && n <= 9999, "number must be 0000–9999");
    const y = O.yao(n);
    const g = +O.G[y - 1];
    const gr = O.GR[g];
    return { method: "Yi Number Oracle", number: String(n).padStart(4, "0"), yao: y, grade: gr[0], stars: g, reading: gr[2], book_page: 279 + y };
  }
  if (action === "lookup") {
    const n = Number(hexagram);
    need(n >= 1 && n <= 64, "hexagram must be 1–64");
    const out = { hexagram: hexView(D, n) };
    if (line) out.line = lineView(D, n, Number(line));
    else out.all_lines = [1, 2, 3, 4, 5, 6, 7].map((k) => D.L[`${n}.${k}`] && { line: k, summary: D.L[`${n}.${k}`][6] }).filter(Boolean);
    return out;
  }
  // Three-coin cast: 6 old yin, 7 young yang, 8 young yin, 9 old yang (bottom line first)
  const vals = Array.from({ length: 6 }, () => [0, 0, 0].reduce((a) => a + (crypto.randomInt(2) ? 3 : 2), 0));
  const bits = vals.map((v) => (v === 7 || v === 9 ? "1" : "0")).join("");
  const moved = vals.map((v, i) => (v === 6 ? "1" : v === 9 ? "0" : bits[i])).join("");
  const find = (b) => D.H.findIndex((h) => h[5] === b) + 1;
  const n = find(bits);
  const changing = vals.map((v, i) => (v === 6 || v === 9 ? i + 1 : 0)).filter(Boolean);
  const out = {
    method: "Three-coin cast",
    coin_values_bottom_to_top: vals,
    primary: hexView(D, n),
    changing_lines: changing,
  };
  if (changing.length === 6 && (n === 1 || n === 2)) out.line_readings = [lineView(D, n, 7)];
  else out.line_readings = changing.map((k) => lineView(D, n, k));
  if (!changing.length) out.all_lines_summary = [1, 2, 3, 4, 5, 6].map((k) => ({ line: k, summary: D.L[`${n}.${k}`][6] }));
  if (changing.length) out.relating = hexView(D, find(moved));
  out.source = "Line texts from the supplied I Ching book (ISBN 978-1-990227-10-3)";
  return out;
}
