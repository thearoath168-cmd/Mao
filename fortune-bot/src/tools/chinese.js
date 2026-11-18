// BaZi, Ten Gods, Feng Shui (Kua + flying stars), He-Luo, Xuan Kong Da Gua,
// San He water and San He 12-stages tools. All calculations come from the
// original HTML engines (see ../engines/load.js).

import * as E from "../engines/load.js";
import { tenGod, GODS, FAMILIES, CLASHES, WEAK_DM_CLASH } from "../knowledge/tenGods.js";
import { plain, need, parseDate, parseTime, ToolInputError } from "./util.js";

const ELEMENTS = ["Wood", "Fire", "Earth", "Metal", "Water"];
const ELEMENTS_ZH = ["木", "火", "土", "金", "水"];
const ANIMALS = ["Rat", "Ox", "Tiger", "Rabbit", "Dragon", "Snake", "Horse", "Goat", "Monkey", "Rooster", "Dog", "Pig"];
const ANIMALS_KM = ["ជូត", "ឆ្លូវ", "ខាល", "ថោះ", "រោង", "ម្សាញ់", "មមី", "មមែ", "វក", "រកា", "ច", "កុរ"];
const PILLAR_NAMES = ["Year", "Month", "Day", "Hour"];

function gender(g) {
  const v = String(g || "").toLowerCase();
  if (["male", "m", "man", "ប្រុស"].includes(v)) return "male";
  if (["female", "f", "woman", "ស្រី"].includes(v)) return "female";
  throw new ToolInputError("gender must be 'male' or 'female'");
}

function stemInfo(B, s) {
  return { stem: B.STEMS[s], stem_pinyin: B.STEM_PY[s], stem_element: ELEMENTS[Math.floor(s / 2)], stem_polarity: s % 2 ? "Yin" : "Yang" };
}
function branchInfo(B, b) {
  return {
    branch: B.BR[b],
    branch_pinyin: B.BR_PY[b],
    animal: ANIMALS[b],
    animal_km: ANIMALS_KM[b],
    branch_element: ELEMENTS[B.BR_EL[b]],
    hidden_stems: B.HIDDEN[b].map((h) => B.STEMS[h]),
  };
}

// ---------------------------------------------------------------- BaZi
export function baziChart({ birth_date, birth_time, gender: g }) {
  const { y } = parseDate(birth_date, "birth_date");
  need(y >= 1901 && y <= 2100, "BaZi supports birth years 1901–2100");
  const time = birth_time ? parseTime(birth_time, "birth_time").str : "";
  const sex = gender(g);
  const B = E.bazi();
  const r = plain(B.calc(birth_date, time, sex));
  const dm = r.pillars[2].s;
  const zones = ["Very weak", "Weak", "Balanced", "Strong", "Very strong"];
  const roles = B.D.en.roles;

  const counts = {};
  const main = {}; // visible stems + main qi only, used for pattern checks
  const bump = (god, w) => {
    counts[god] = +((counts[god] || 0) + w).toFixed(2);
    if (w >= 1) main[god] = (main[god] || 0) + 1;
  };
  const pillars = r.pillars.map((p, i) => {
    if (p.s === null) return { pillar: PILLAR_NAMES[i], missing: "no birth time given" };
    const hidden = B.HIDDEN[p.b];
    const out = {
      pillar: PILLAR_NAMES[i],
      ...stemInfo(B, p.s),
      ...branchInfo(B, p.b),
      stem_ten_god: i === 2 ? "Day Master 日主" : tenGod(dm, p.s),
      hidden_ten_gods: hidden.map((h) => `${B.STEMS[h]} ${tenGod(dm, h)}`),
    };
    if (i !== 2) bump(tenGod(dm, p.s), 1);
    hidden.forEach((h, k) => bump(tenGod(dm, h), k === 0 ? 1 : 0.5));
    return out;
  });

  const present = (list) => list.some((god) => main[god]);
  const clashes = CLASHES.filter((c) => c.need.every(present)).map((c) => ({ pattern: c.key, meaning: c.text }));
  const wealthOrAuth = ["正财", "偏财", "正官", "七杀"].reduce((a, k) => a + (main[k] || 0), 0);
  if (r.pct <= 45 && wealthOrAuth >= 2) clashes.push({ pattern: WEAK_DM_CLASH.key, meaning: WEAK_DM_CLASH.text });

  const tenGods = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([zh, n]) => ({
      star: zh,
      name: GODS[zh].en,
      family: FAMILIES[GODS[zh].family].name,
      weight: n,
      when_useful: GODS[zh].useful,
      when_too_many: GODS[zh].tooMany,
    }));

  return {
    input: { birth_date, birth_time: time || null, gender: sex },
    pillars_note: "Traditional order is Year, Month, Day, Hour. Hidden stems are listed main qi first.",
    pillars,
    day_master: { ...stemInfo(B, dm), symbol: ELEMENTS_ZH[Math.floor(dm / 2)] },
    strength: { support_percent: r.pct, zone: zones[r.zi] },
    useful_gods: r.gods.map((x) => ({ element: ELEMENTS[x.e], role: roles[x.r] })),
    five_elements_weight: Object.fromEntries(ELEMENTS.map((e, i) => [e, +r.el[i].toFixed(2)])),
    ten_gods: tenGods,
    ten_god_patterns_present: clashes,
    ten_god_patterns_note: "Checked on visible stems and main hidden qi only; weigh against Day Master strength before concluding.",
    luck_cycles: {
      direction: r.fwd ? "forward" : "backward",
      start_age: +r.startAge.toFixed(1),
      cycles: r.cycles.map((c) => ({
        pillar: B.STEMS[c.s] + B.BR[c.b],
        pinyin: `${B.STEM_PY[c.s]} ${B.BR_PY[c.b]}`,
        stem_ten_god: tenGod(dm, c.s),
        element: ELEMENTS[Math.floor(c.s / 2)],
        animal: ANIMALS[c.b],
        age_from: Math.floor(c.age),
        age_to: Math.floor(c.age) + 9,
        years: `${c.year}–${c.year + 9}`,
      })),
    },
    caveats: [B.D.en.disc, r.hasHour ? null : B.D.en.tip].filter(Boolean),
  };
}

// ---------------------------------------------------------------- Feng Shui
export function fengShui({ birth_date, gender: g, chart_year }) {
  const { y } = parseDate(birth_date, "birth_date");
  need(y >= 1901 && y <= 2100, "Feng Shui supports birth years 1901–2100");
  const cy = chart_year ? Number(chart_year) : new Date().getFullYear();
  need(cy >= 1901 && cy <= 2100, "chart_year must be 1901–2100");
  const B = E.bazi();
  const r = plain(B.fsCalc(birth_date, gender(g), cy));
  const en = B.D.en;
  const dirs = en.dirs, dn = en.dn, stars = en.stars;
  const personal = r.byRule.map((d, i) => ({
    direction: dirs[d],
    star: dn[i].n,
    meaning: dn[i].m,
    quality: i < 4 ? "good" : "bad",
  }));
  return {
    kua_number: r.kua,
    group: r.east ? "East group" : "West group",
    good_directions: personal.slice(0, 4),
    bad_directions: personal.slice(4),
    annual_chart: {
      year: r.cy,
      year_pillar: B.STEMS[r.ys] + B.BR[r.yb],
      animal: ANIMALS[r.yb],
      center_star: r.c,
      tai_sui: dirs[r.ts],
      sui_po: dirs[(r.ts + 4) % 8],
      stars_by_direction: Object.fromEntries(dirs.map((d, i) => [d, { star: r.star[i], meaning: stars[r.star[i] - 1] }])),
      good_stars: [1, 4, 6, 8, 9],
    },
    note: en.fsDisc,
  };
}

// ---------------------------------------------------------------- He-Luo
const PALACES = ["Kan", "Gen", "Zhen", "Xun", "Li", "Kun", "Dui", "Qian"];

function resolveMountain(H, sitting) {
  const s = String(sitting || "").trim();
  for (const pal of PALACES) {
    if (s.toLowerCase() === pal.toLowerCase()) return { pal, mi: 1 };
    const i = H.MTNS[pal].findIndex(([py, zh]) => s === zh || s.toLowerCase() === py.toLowerCase());
    if (i >= 0) return { pal, mi: i };
  }
  const deg = Number(s);
  if (s !== "" && Number.isFinite(deg)) {
    // 24 mountains, starting with 壬 at 337.5°–352.5°
    const k = Math.floor((((deg - 337.5) % 360) + 360) % 360 / 15);
    return { pal: PALACES[Math.floor(k / 3)], mi: k % 3 };
  }
  throw new ToolInputError(`Unknown sitting mountain '${sitting}'. Use a palace (Kan, Gen, Zhen, Xun, Li, Kun, Dui, Qian), a mountain like 子/Zi/壬/Ren, or a sitting degree.`);
}

export function heLuoDate({ date, hour, sitting, month_planner, year, month, month_basis, year_basis }) {
  const H = E.heluo();
  const { pal, mi } = resolveMountain(H, sitting);
  const o = { monthBasis: month_basis === "lunar" ? "lunar" : "solar", yearBasis: year_basis === "lunar" ? "lunar" : "solar" };
  const word = (s) => (s >= 1 ? "Good" : s === 0 ? "Neutral" : "Bad");
  const slotLabel = (i) => `${H.BR[i]} hour ${String((i * 2 + 23) % 24).padStart(2, "0")}:00–${String((i * 2 + 1) % 24).padStart(2, "0")}:00`;
  const mountain = `${H.MTNS[pal][mi][0]} ${H.MTNS[pal][mi][1]} (${pal}, ${H.DIR[pal]})`;

  if (month_planner) {
    const Y = Number(year), M = Number(month);
    need(Y >= 1901 && Y <= 2099 && M >= 1 && M <= 12, "month planner needs year (1901–2099) and month (1–12)");
    const n = new Date(Y, M, 0).getDate();
    const rows = [];
    for (let d = 1; d <= n; d++) {
      const ds = `${Y}-${String(M).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const good = [];
      for (let i = 0; i < 12; i++) {
        const j = H.judge(ds, i, pal, o);
        if (j.s >= 1) good.push(`${slotLabel(i)} (${H.GRADE[j.s]})`);
      }
      if (good.length) rows.push({ date: ds, good_hours: good });
    }
    return { mountain, month: `${Y}-${M}`, dates_with_good_hours: rows, total_days: n };
  }

  parseDate(date);
  const one = (i) => {
    const j = H.judge(date, i, pal, o);
    return {
      slot: slotLabel(i),
      verdict: word(j.s),
      grade: H.GRADE[j.s] + (j.spoiled ? " (spoiled by killing numbers)" : ""),
      text: j.text,
      note: j.note || undefined,
      numbers: j.nums,
      relations: j.rels.map((x) => H.RN[x]),
      killing_hits: j.hits.map((x) => `${x[0]} ${x[1]} (${x[2]})`),
      exempt_from_killing: j.exempt,
    };
  };
  const base = H.judge(date, 0, pal, o);
  const p = base.p;
  const out = {
    mountain,
    mountain_element: `${base.me} ${base.mt}`,
    pillars: `Year ${H.STEM[p.ys]} ${H.BR[p.yb]}, Month ${H.STEM[p.ms]} ${H.BR[p.mb]}, Day ${H.STEM[p.ds]} ${H.BR[p.db]}`,
    lunar_date: p.LU ? `${p.LU.y}-${p.LU.leap ? "leap " : ""}${p.LU.m}-${p.LU.d}` : null,
    killing_numbers_to_avoid: base.kills.map(([k, v]) => `${k}: ${v}`),
    all_hours: Array.from({ length: 12 }, (_, i) => {
      const j = H.judge(date, i, pal, o);
      return `${slotLabel(i)}: ${word(j.s)} (${H.GRADE[j.s]})`;
    }),
  };
  if (hour !== undefined && hour !== null && hour !== "") {
    const h = Number(String(hour).split(":")[0]);
    need(h >= 0 && h <= 23, "hour must be 0–23");
    out.selected = one(Math.floor(((h + 1) % 24) / 2));
  }
  out.note = "Relations are measured from the mountain's own element. Early and late Zi hours are not split. For study and entertainment.";
  return plain(out);
}

// ---------------------------------------------------------------- Xuan Kong Da Gua
export function xuanKongDate({ date, time, site_degree, birth_date, tz, mode, scan_hours }) {
  const X = E.xkdg();
  const { y, m, d } = parseDate(date);
  const b = parseDate(birth_date, "birth_date");
  const deg = Number(site_degree);
  need(Number.isFinite(deg), "site_degree (house sitting degree 0–360) is required");
  const siteDeg = ((deg % 360) + 360) % 360;
  const site = X.HEX[Math.floor(siteDeg / 5.625)].name;
  const personJz = X.pillars(b.y, b.m, b.d, 12, 0, 7).year;
  const zone = tz === undefined ? 7 : Number(tz);
  const md = ["either", "both", "zhang", "leyau"].includes(mode) ? mode : "either";
  const brief = (r) => ({
    grade: r.grade,
    ok: r.ok,
    zhang_method_ok: r.zOK,
    leyau_method_ok: r.lOK,
    avoid_ok: r.avoidOK,
  });
  const hourStart = (k) => (k === 0 ? 0 : k * 2 - 1);

  if (scan_hours || !time) {
    const rows = [];
    for (let k = 0; k < 12; k++) {
      const p = X.pillars(y, m, d, hourStart(k), 30, zone);
      const r = X.combined(p, site, siteDeg, personJz, "auto", md);
      rows.push({ hour_branch: X.BRANCHES[k], from: `${String((k * 2 + 23) % 24).padStart(2, "0")}:00`, hour_pillar: p.hour, ...brief(r) });
    }
    const noon = X.pillars(y, m, d, 12, 0, zone);
    return plain({
      site: `${site} · ${X.BY[site].label} · sits ${X.DIR_NAME[X.card4(siteDeg)]}, mountain ${X.MOUNTAINS[X.mountainOf(siteDeg)]} (${siteDeg.toFixed(1)}°)`,
      person: `Birth year pillar ${personJz} → ${X.JZ_HEX[personJz].join(" / ")}`,
      day_pillars: `${noon.year} ${noon.month} ${noon.day}`,
      day_flags: X.dayFlags(noon, siteDeg, personJz),
      hours: rows,
      mode: md,
    });
  }
  const t = parseTime(time);
  const p = X.pillars(y, m, d, t.h, t.mi, zone);
  const r = X.combined(p, site, siteDeg, personJz, "auto", md);
  const item = (x) => ({ ok: x.ok, title: x.title, detail: x.detail });
  return plain({
    site: `${site} · ${X.BY[site].label} · sits ${X.DIR_NAME[X.card4(siteDeg)]}, mountain ${X.MOUNTAINS[X.mountainOf(siteDeg)]} (${siteDeg.toFixed(1)}°)`,
    person: `Birth year pillar ${personJz}; Zhang uses ${r.z.person}`,
    pillars: { year: p.year, month: p.month, day: p.day, hour: p.hour },
    ...brief(r),
    zhang: {
      chart_hexagrams: r.z.chart.map((c) => `${c.jz}→${c.hex}`),
      issues: r.z.result.issues,
      notes: r.z.result.notes,
      purposes: r.z.result.purposes,
      pure_period: r.z.result.purePeriod,
      pure_element: r.z.result.pureElem,
    },
    leyau: {
      critical: (r.L.crit || []).map(item),
      preferred: (r.L.pref || []).map(item),
      avoid: (r.L.avoid || []).map(item),
      san_sha_on_sitting: r.L.isSanSha,
    },
    mode: md,
  });
}

// ---------------------------------------------------------------- San He water
function pairIndex(S, v, field) {
  const s = String(v ?? "").trim();
  need(s, `${field} is required`);
  if (/^\d+$/.test(s) && +s < 12) return +s;
  let i = S.PAIRS.findIndex((p) => p === s || p.includes(s));
  if (i < 0) i = S.PAIR_PY.findIndex((p) => p === s.toLowerCase() || p.split("-").includes(s.toLowerCase()));
  need(i >= 0, `${field}: unknown direction '${s}'. Use one of ${S.PAIRS.join(" ")}`);
  return i;
}

export function sanHeWater({ dragon_vein, water_entry, water_exit }) {
  const S = E.sanhe();
  const v = pairIndex(S, dragon_vein, "dragon_vein");
  const i = pairIndex(S, water_entry, "water_entry");
  const e = pairIndex(S, water_exit, "water_exit");
  const r = plain(S.analyse(v, i, e));
  if (r.error) return r;
  const st = (k) => `${S.STAGES[k].zh} ${S.STAGES[k].en}`;
  return {
    input: { dragon_vein: S.PAIRS[v], water_entry: S.PAIRS[i], water_exit: S.PAIRS[e] },
    frame: `${r.frame} ${S.FRAMES[r.frame].zh} (${S.FRAMES[r.frame].mn})`,
    frame_rule: r.frameRule,
    sweep: r.sweep,
    entry_stage: st(r.si),
    exit_stage: st(r.se),
    checks: r.checks,
    matching_formations: r.exact,
    near_formations: r.near,
    recommended_facings: r.facings,
    peak_vein: r.peakVein,
    dragon_lines: r.dragons,
  };
}

// ---------------------------------------------------------------- San He 12 stages
function mountainIndex(Sh, v, field) {
  const s = String(v ?? "").trim();
  need(s, `${field} is required`);
  const deg = Number(s);
  if (Number.isFinite(deg) && !/^[一-鿿]/.test(s)) return Math.floor((((deg + 7.5 - 345) % 360) + 360) % 360 / 15);
  const i = Sh.M.indexOf(s.slice(-1));
  need(i >= 0, `${field}: unknown mountain '${s}'. Use one of ${Sh.M.join("")} or a degree`);
  return i;
}

export function sanHeStages({ sitting, facing, water_mouth, flow, vein_degree }) {
  const Sh = E.sihe();
  const sit = mountainIndex(Sh, sitting, "sitting");
  const fac = facing !== undefined && facing !== null && facing !== "" ? mountainIndex(Sh, facing, "facing") : (sit + 12) % 24;
  const mouth = mountainIndex(Sh, water_mouth, "water_mouth");
  const fl = ["L", "R"].includes(flow) ? flow : "auto";
  const r = Sh.calc(sit, fac, mouth, fl);
  const out = {
    sitting: Sh.M[sit],
    facing: Sh.M[fac],
    water_mouth: Sh.M[mouth],
    frame: `${r.bu.n} (${r.bu.t})`,
    water_flow: r.left ? "left-turning (clockwise from the starting stem)" : "right-turning",
    birth_stem: `${r.stem} ${Sh.QI[r.stem]}`,
    facing_stage: Sh.ST[r.fs],
    facing_name: Sh.facingName(r.fs),
    water_mouth_stage: Sh.ST[r.ms],
    sitting_stage: Sh.ST[r.ss],
    stages_by_direction: r.rows.map((x) => `${x.n}: ${Sh.DB[x.d]}`),
    good_stages: Sh.GOOD.map((k) => Sh.ST[k]),
  };
  if (vein_degree !== undefined && vein_degree !== null && vein_degree !== "") {
    const br = Number(vein_degree);
    const dsl = Math.floor((((br - 352.5) % 360) + 360) % 360 / 5);
    out.dragon_72 = Sh.dragon(dsl);
  }
  return plain(out);
}
