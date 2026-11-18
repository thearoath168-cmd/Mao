export const KHD = "០១២៣៤៥៦៧៨៩";
export const kh = (s) => String(s).replace(/[0-9]/g, (d) => KHD[d]);

/** Deep-copy values that came out of a vm sandbox into plain host objects. */
export const plain = (x) => (x === undefined ? null : JSON.parse(JSON.stringify(x)));

export class ToolInputError extends Error {}

export function need(cond, msg) {
  if (!cond) throw new ToolInputError(msg);
}

const pad = (n) => String(n).padStart(2, "0");

/** Current local date/time (uses process TZ, set from BOT_TZ at startup). */
export function nowLocal() {
  const d = new Date();
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
    hour: d.getHours(),
    minute: d.getMinutes(),
  };
}

export function parseDate(s, field = "date") {
  need(typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s), `${field} must be YYYY-MM-DD`);
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  need(dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d, `${field} is not a real calendar date`);
  return { y, m, d };
}

export function parseTime(s, field = "time") {
  need(typeof s === "string" && /^\d{1,2}:\d{2}$/.test(s), `${field} must be HH:MM (24-hour)`);
  const [h, mi] = s.split(":").map(Number);
  need(h >= 0 && h <= 23 && mi >= 0 && mi <= 59, `${field} is out of range`);
  return { h, mi, str: `${pad(h)}:${pad(mi)}` };
}

export const WEEKDAY_KM = ["អាទិត្យ", "ចន្ទ", "អង្គារ", "ពុធ", "ព្រហស្បតិ៍", "សុក្រ", "សៅរ៍"];
export const WEEKDAY_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function weekdayOf(dateStr) {
  const { y, m, d } = parseDate(dateStr);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
