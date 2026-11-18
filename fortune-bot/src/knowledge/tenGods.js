// The 10 Gods 十神 (Shi Shen) — transcribed from the "BaZi · Module Seven" course
// summary sheet supplied by the user (Simplified Bazi Foundation Course, © 2020 Jenson Goh).
// Five families, two stars each — how every element in a chart relates to the Day Master 我.

export const FAMILIES = {
  input: {
    name: "Input 印星",
    relation: "the element that produces the Day Master",
    people: "Mother · step-mother · elders",
    useful: "Support & nobleman",
    notUseful: "Bad habits, burden",
  },
  self: {
    name: "Self 比劫",
    relation: "the same element as the Day Master",
    people: "Brothers · sisters · peers",
    useful: "Helpful friends",
    notUseful: "Competitors, villains",
  },
  output: {
    name: "Output 食伤",
    relation: "the element the Day Master produces",
    people: "Children (in a woman's chart)",
    useful: "Talent & skill",
    notUseful: "Mistakes, responsibility",
  },
  wealth: {
    name: "Wealth 财星",
    relation: "the element the Day Master controls",
    people: "Wife / girlfriend · father",
    useful: "Wealth & career",
    notUseful: "Poor health, sickness",
  },
  authority: {
    name: "Authority 官杀",
    relation: "the element that controls the Day Master",
    people: "Husband / boyfriend · children (in a man's chart)",
    useful: "Nobleman & power",
    notUseful: "Villains, sabotage",
  },
};

export const FLOW = "Input 印 → Self 比劫 → Output 食伤 → Wealth 财 → Authority 官杀";

export const GODS = {
  正印: { family: "input", en: "Support (Direct Resource)", useful: "kind-hearted, upright", tooMany: "ordinary, unproductive" },
  偏印: { family: "input", en: "Resource (Indirect Resource)", useful: "mentally sharp, capable", tooMany: "greedy, stingy" },
  比肩: { family: "self", en: "Friends Star (Companion)", useful: "steady, harmonious", tooMany: "odd, overly curious, unsociable" },
  劫财: { family: "self", en: "Competitor Star (Rob Wealth)", useful: "enthusiastic, straightforward", tooMany: "reckless, disorganised, unstable" },
  食神: { family: "output", en: "Intelligent Star (Eating God)", useful: "gentle, kind-hearted", tooMany: "lazy, stubborn, inflexible" },
  伤官: { family: "output", en: "Expression Star (Hurting Officer)", useful: "intelligent, sharp-witted", tooMany: "arrogant, rebellious, stubborn" },
  正财: { family: "wealth", en: "Direct Wealth (Steady Income)", useful: "hardworking, efficient, thrifty", tooMany: "weak, indecisive" },
  偏财: { family: "wealth", en: "Business (Indirect Wealth)", useful: "dynamic, clever, creative, resourceful", tooMany: "pampered, complacent, luxurious" },
  正官: { family: "authority", en: "Status Star (Direct Officer)", useful: "bright, upright", tooMany: "lacks determination" },
  七杀: { family: "authority", en: "Seven Power (7 Killings)", useful: "heroic, competitive", tooMany: "weak, discouraged, depressed" },
};

export const CLASHES = [
  { key: "伤官见官", need: [["伤官"], ["正官"]], text: "Expression meets Status → order breaks, trouble with authority & relationships." },
  { key: "劫财夺财", need: [["劫财"], ["正财", "偏财"]], text: "Competitor seizes Wealth → money gets split, shared or lost." },
  { key: "财坏印", need: [["正财", "偏财"], ["正印", "偏印"]], text: "Wealth overcomes Input → greed drains support and nurturing." },
  { key: "枭印夺食", need: [["偏印"], ["食神"]], text: "Indirect Resource seizes Eating God → creativity blocked, setbacks, betrayal." },
  { key: "官杀制比劫", need: [["正官", "七杀"], ["比肩", "劫财"]], text: "Authority controls Self → rivalry is kept in check, order restored." },
];
export const WEAK_DM_CLASH = {
  key: "身弱逢财官",
  text: "Weak Day Master meets Wealth or Authority → stress, health costs, money loss.",
};
export const BALANCE_NOTE = "Balance is the goal — when one star overpowers another, trouble follows.";

/**
 * Ten God of stem `s` relative to Day Master stem `dm` (both 0..9, 甲..癸).
 * Element = floor(stem/2) in the generating order Wood, Fire, Earth, Metal, Water.
 */
export function tenGod(dm, s) {
  const d = Math.floor(dm / 2), e = Math.floor(s / 2), same = dm % 2 === s % 2;
  const k = (e - d + 5) % 5;
  return [
    same ? "比肩" : "劫财",
    same ? "食神" : "伤官",
    same ? "偏财" : "正财",
    same ? "七杀" : "正官",
    same ? "偏印" : "正印",
  ][k];
}

/** Text block for the system prompt. */
export function tenGodsReferenceText() {
  const fam = Object.values(FAMILIES)
    .map((f) => `- ${f.name}: ${f.relation}. People: ${f.people}. Useful → ${f.useful}; not useful → ${f.notUseful}.`)
    .join("\n");
  const gods = Object.entries(GODS)
    .map(([zh, g]) => `- ${zh} ${g.en} [${FAMILIES[g.family].name}]: as useful god → ${g.useful}; too many → ${g.tooMany}.`)
    .join("\n");
  const cl = [...CLASHES, WEAK_DM_CLASH].map((c) => `- ${c.key}: ${c.text}`).join("\n");
  return `Flow of the five families: ${FLOW}\n${fam}\n\nThe ten stars:\n${gods}\n\nKey clashes to watch (${BALANCE_NOTE}):\n${cl}`;
}
