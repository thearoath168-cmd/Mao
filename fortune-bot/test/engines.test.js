import { test } from "node:test";
import assert from "node:assert/strict";
process.env.TZ = "Asia/Phnom_Penh";
const { ALL_ENGINES } = await import("../src/engines/load.js");
const C = await import("../src/tools/chinese.js");
const K = await import("../src/tools/khmer.js");
const { runTool, CUSTOM_TOOLS } = await import("../src/tools/index.js");
const { tenGod } = await import("../src/knowledge/tenGods.js");

test("all 10 engines load from the source HTML", () => {
  for (const [name, load] of Object.entries(ALL_ENGINES)) assert.ok(load(), name);
});

test("BaZi pillars for 1990-05-15 08:30", () => {
  const r = C.baziChart({ birth_date: "1990-05-15", birth_time: "08:30", gender: "male" });
  assert.equal(r.pillars.map((p) => p.stem + p.branch).join(" "), "庚午 辛巳 庚辰 庚辰");
  assert.equal(r.day_master.stem_element, "Metal");
  assert.equal(r.luck_cycles.cycles.length, 8);
});

test("Ten Gods relations", () => {
  assert.equal(tenGod(6, 6), "比肩"); // 庚 vs 庚
  assert.equal(tenGod(6, 7), "劫财"); // 庚 vs 辛
  assert.equal(tenGod(6, 3), "正官"); // 庚 vs 丁 (fire controls metal, opposite polarity)
  assert.equal(tenGod(6, 2), "七杀"); // 庚 vs 丙
  assert.equal(tenGod(6, 5), "正印"); // 庚 vs 己
  assert.equal(tenGod(6, 0), "偏财"); // 庚 vs 甲
  assert.equal(tenGod(6, 8), "食神"); // 庚 vs 壬
});

test("Kua number", () => {
  assert.equal(C.fengShui({ birth_date: "1990-05-15", gender: "female", chart_year: 2026 }).kua_number, 8);
});

test("Khmer horoscope returns lagna, 10 planets, 12 houses", () => {
  const r = K.khmerHoroscope({ birth_date: "1990-05-15", birth_time: "08:30", province: "Phnom Penh" });
  assert.match(r.lagna.sign, /Gemini/);
  assert.equal(r.planets.length, 10);
  assert.equal(r.houses.length, 12);
  assert.match(r.lunar_date, /រោច/);
});

test("Numerology Sok Dara", () => {
  const r = K.numerology({ full_name_latin: "Sok Dara", birth_date: "1990-05-15" });
  assert.equal(r.life_path.number, 3);
  assert.ok(r.destiny.number >= 1);
});

test("Yam, tarot, I Ching", () => {
  const y = K.yamDivination({ method: "kamphleung", question_index: 4, lunar_phase: "waxing", lunar_day: 9 });
  assert.equal(y.position, "គល់កាំភ្លើង");
  assert.equal(K.tarot({ action: "draw", spread: "celtic" }).cards.length, 10);
  assert.match(K.tarot({ action: "lookup", card: "The Star" }).card, /ផ្កាយ/);
  const c = K.iching({ action: "cast" });
  assert.ok(c.primary.number >= 1 && c.primary.number <= 64);
  assert.equal(K.iching({ action: "number_oracle", number: "1688" }).grade, "ល្អបំផុត");
});

test("date selection and water tools", () => {
  assert.equal(C.heLuoDate({ date: "2026-11-20", sitting: "子" }).all_hours.length, 12);
  assert.equal(C.xuanKongDate({ date: "2026-11-20", site_degree: 180, birth_date: "1985-03-02" }).hours.length, 12);
  assert.match(C.sanHeWater({ dragon_vein: "子", water_entry: "坤", water_exit: "乙" }).frame, /Water/);
  assert.equal(C.sanHeStages({ sitting: "子", water_mouth: "辰" }).water_mouth_stage, "墓");
});

test("runTool reports bad input as a tool error", () => {
  const r = runTool("bazi_chart", { birth_date: "1990-13-40", gender: "male" });
  assert.equal(r.is_error, true);
  assert.match(r.content, /date/);
  assert.equal(runTool("nope", {}).is_error, true);
});

test("every tool definition has a handler", () => {
  for (const t of CUSTOM_TOOLS) assert.equal(runTool(t.name, null).content.startsWith("Unknown tool"), false, t.name);
});
