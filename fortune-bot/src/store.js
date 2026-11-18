// Small JSON-file store for user profiles (birth data the user chose to save).
import fs from "node:fs";
import path from "node:path";

const DIR = process.env.DATA_DIR || path.resolve("data");
const FILE = path.join(DIR, "profiles.json");

let profiles = null;

function load() {
  if (profiles) return profiles;
  try {
    profiles = JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch {
    profiles = {};
  }
  return profiles;
}

function save() {
  fs.mkdirSync(DIR, { recursive: true });
  const tmp = FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(profiles, null, 2));
  fs.renameSync(tmp, FILE);
}

const FIELDS = ["name", "latin_name", "birth_date", "birth_time", "gender", "birth_province", "house_sitting_degree", "notes"];

export function getProfile(userId) {
  return load()[String(userId)] || null;
}

export function saveProfile(userId, data) {
  load();
  const cur = profiles[String(userId)] || {};
  for (const k of FIELDS) if (data[k] !== undefined && data[k] !== null && data[k] !== "") cur[k] = data[k];
  cur.updated = new Date().toISOString();
  profiles[String(userId)] = cur;
  save();
  return cur;
}

export function deleteProfile(userId) {
  load();
  const had = !!profiles[String(userId)];
  delete profiles[String(userId)];
  save();
  return had;
}
