// Loads the calculation code from the original Khmer Fortune Teller HTML apps
// and runs it inside a Node `vm` sandbox, so the bot gives exactly the same
// results as the apps. The React UI code is never executed: we replace each
// app's final `render(...)` call with a statement that exports the engine
// functions we need.

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_BUNDLE = path.resolve(here, "../../../Khmer_Fortune_Teller_App.html");

export function bundlePath() {
  return process.env.FORTUNE_SOURCE_HTML || DEFAULT_BUNDLE;
}

let appsCache = null;

/** Decode the 10 sub-apps embedded (base64) inside the combined app HTML. */
export function loadApps(file = bundlePath()) {
  if (appsCache) return appsCache;
  if (!fs.existsSync(file)) {
    throw new Error(
      `Source HTML not found: ${file}. Set FORTUNE_SOURCE_HTML to the path of Khmer_Fortune_Teller_App.html`,
    );
  }
  const html = fs.readFileSync(file, "utf8");
  const m = html.match(/const DATA=(\{[\s\S]*?\});\n/);
  if (!m) throw new Error("Could not find the embedded DATA object in " + file);
  const data = JSON.parse(m[1]);
  appsCache = {};
  for (const [k, b64] of Object.entries(data)) {
    appsCache[k] = Buffer.from(b64, "base64").toString("utf8");
  }
  return appsCache;
}

/** All <script> bodies of one app, in document order (with their attributes). */
export function scriptsOf(appHtml) {
  const out = [];
  const re = /<script([^>]*)>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(appHtml))) out.push({ attrs: m[1], body: m[2] });
  return out;
}

function sandbox(extra = {}) {
  const noop = () => {};
  const React = {
    createElement: () => null,
    useState: (v) => [v, noop],
    useMemo: (f) => f(),
    useEffect: noop,
    useRef: (v) => ({ current: v }),
    useCallback: (f) => f,
    Fragment: "Fragment",
  };
  const ctx = {
    React,
    ReactDOM: { createRoot: () => ({ render: noop }) },
    htm: { bind: () => () => null },
    document: { getElementById: () => null, addEventListener: noop, querySelector: () => null },
    navigator: { userAgent: "node" },
    console,
    atob,
    btoa,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    setImmediate,
    queueMicrotask,
    MessageChannel,
    performance,
    TextEncoder,
    TextDecoder,
    URL,
    Intl,
    ...extra,
  };
  ctx.window = ctx;
  ctx.self = ctx;
  ctx.globalThis = ctx;
  return vm.createContext(ctx);
}

/**
 * Run `code` in a fresh sandbox after replacing the render call matched by
 * `renderRe` with `globalThis.__engine = <exportExpr>;`.
 */
export function runEngine(code, renderRe, exportExpr, extra) {
  const i = code.lastIndexOf("/*! Bundled license");
  if (i > 0) code = code.slice(0, i);
  let src = code;
  if (renderRe) {
    if (!renderRe.test(src)) throw new Error("Render call not found: " + renderRe);
    src = src.replace(renderRe, () => `globalThis.__engine=${exportExpr};`);
  } else {
    src += `\n;globalThis.__engine=${exportExpr};`;
  }
  const ctx = sandbox(extra);
  vm.runInContext(src, ctx, { filename: "engine.js" });
  return ctx.__engine;
}

const RENDER = /ReactDOM\.createRoot\(document\.getElementById\(["'][\w-]+["']\)\)\.render\([^\n]*?\);/;

const cache = new Map();
function memo(name, fn) {
  if (!cache.has(name)) cache.set(name, fn());
  return cache.get(name);
}

const longest = (scripts) => scripts.reduce((a, b) => (b.body.length > a.body.length ? b : a)).body;

/** Khmer astrology (Suriyayatra horoscope engine). */
export const hora = () =>
  memo("hora", () => {
    const code = longest(scriptsOf(loadApps().hora));
    return runEngine(
      code,
      /\(0,C4\.createRoot\)\(document\.getElementById\("root"\)\)\.render\(\(0,g\.jsx\)\(h8,\{\}\)\);/,
      "{M4,Vo,Jo,kn,Uu,s8,f8,v4,m8,R4,r8,o8,u8}",
    );
  });

/** Pythagorean numerology with Khmer texts. */
export const numerology = () =>
  memo("num", () => {
    const code = longest(scriptsOf(loadApps().num));
    return runEngine(
      code,
      /\(0,Qy\.createRoot\)\(document\.getElementById\("root"\)\)\.render\(\(0,S\.jsx\)\(wh,\{\}\)\);/,
      "{Ot,Kh,Jh,Xi,We,qy,By,Yy,Ry}",
    );
  });

/** BaZi + Feng Shui (Kua / flying stars). */
export const bazi = () =>
  memo("bazi", () => {
    const code = longest(scriptsOf(loadApps().bazi));
    return runEngine(
      code,
      RENDER,
      "{D,calc,fsCalc,jieList,STEMS,STEM_PY,BR,BR_PY,ELC,BR_EL,HIDDEN,ZMAX,TS,GRID}",
    );
  });

/** Yam Kam Phleung & Yam Trinet. */
export const yam = () =>
  memo("yam", () => {
    const code = longest(scriptsOf(loadApps().yam));
    return runEngine(code, RENDER, "{KP,WAX,WAN,KQ,TQ,EYE_SEQ_WAN,yamLabel,nowYam}");
  });

/** 78 tarot cards with Khmer meanings. */
export const tarot = () =>
  memo("tarot", () => {
    const code = longest(scriptsOf(loadApps().tarot));
    return runEngine(code, RENDER, "{CARDS,LABEL,SUITS}");
  });

/** I Ching: book data (64 hexagrams, 386 line texts) + Yi Number Oracle. */
export const iching = () =>
  memo("iching", () => {
    const scripts = scriptsOf(loadApps().iching);
    const dataScript = scripts.find((s) => /id=["']data["']/.test(s.attrs));
    const data = JSON.parse(dataScript.body);
    const oracleScript = scripts.find((s) => s.body.includes("const yao="));
    const oracle = runEngine(oracleScript.body, RENDER, "{yao,GR,G}");
    return { data, oracle };
  });

/** He-Luo (河洛) date selection. */
export const heluo = () =>
  memo("heluo", () => {
    const code = longest(scriptsOf(loadApps().heluo));
    return runEngine(code, RENDER, "{judge,pillars,lunarOf,lunarToGreg,MTNS,DIR,NUM,ELN,GRADE,RN,BR,STEM}");
  });

/** Xuan Kong Da Gua (玄空大卦) date selection. */
export const xkdg = () =>
  memo("xkdg", () => {
    const code = scriptsOf(loadApps().xkdg).find((s) => s.body.includes("root.XKDG"));
    return runEngine(code.body, null, "globalThis.XKDG");
  });

/** San He water method (三合水法). */
export const sanhe = () =>
  memo("sanhe", () => {
    const code = scriptsOf(loadApps().sanhe).find((s) => s.body.includes("function analyse"));
    return runEngine(code.body, null, "{analyse,PAIRS,PAIR_PY,STAGES,FRAMES}");
  });

/** San He four frames + 12 growth stages (三合四局 十二长生). */
export const sihe = () =>
  memo("sihe", () => {
    const code = longest(scriptsOf(loadApps().sihe));
    return runEngine(code, RENDER, "{calc,dragon,facingName,M,DB,ST,BUR,QI,GOOD}");
  });

export const ALL_ENGINES = { hora, numerology, bazi, yam, tarot, iching, heluo, xkdg, sanhe, sihe };
