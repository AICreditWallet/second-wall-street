/**
 * US equity (NYSE) regular-session calendar. Holidays follow the exchange's
 * published rules; times are converted from America/New_York, so daylight
 * saving is handled. Half-day early closes don't affect the 9:30–9:45 window.
 */

export type ISODate = string; // YYYY-MM-DD

const pad = (n: number) => String(n).padStart(2, "0");
export const iso = (y: number, m: number, d: number): ISODate => `${y}-${pad(m)}-${pad(d)}`;

function parts(d: ISODate) {
  const [y, m, day] = d.split("-").map(Number) as [number, number, number];
  return { y, m, day };
}

function weekday(d: ISODate) {
  const { y, m, day } = parts(d);
  return new Date(Date.UTC(y, m - 1, day)).getUTCDay(); // 0 = Sunday
}

export function addDays(d: ISODate, n: number): ISODate {
  const { y, m, day } = parts(d);
  const t = new Date(Date.UTC(y, m - 1, day + n));
  return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** n-th weekday (0=Sun) of a month; n = -1 means last. */
function nthWeekday(y: number, m: number, dow: number, n: number): ISODate {
  if (n > 0) {
    const first = weekday(iso(y, m, 1));
    return iso(y, m, 1 + ((dow - first + 7) % 7) + (n - 1) * 7);
  }
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const last = weekday(iso(y, m, lastDay));
  return iso(y, m, lastDay - ((last - dow + 7) % 7));
}

/** Saturday holidays move to Friday, Sunday holidays to Monday. */
function observed(d: ISODate): ISODate {
  const w = weekday(d);
  return w === 6 ? addDays(d, -1) : w === 0 ? addDays(d, 1) : d;
}

function easter(y: number): ISODate {
  // Anonymous Gregorian algorithm.
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(y, month, day);
}

const holidayCache = new Map<number, Set<ISODate>>();

export function nyseHolidays(y: number): Set<ISODate> {
  let set = holidayCache.get(y);
  if (set) return set;
  const list = [
    // New Year's Day: NYSE does not observe it on the prior Friday when it falls on Saturday.
    weekday(iso(y, 1, 1)) === 6 ? null : observed(iso(y, 1, 1)),
    nthWeekday(y, 1, 1, 3), // Martin Luther King Jr. Day
    nthWeekday(y, 2, 1, 3), // Washington's Birthday
    addDays(easter(y), -2), // Good Friday
    nthWeekday(y, 5, 1, -1), // Memorial Day
    y >= 2022 ? observed(iso(y, 6, 19)) : null, // Juneteenth
    observed(iso(y, 7, 4)), // Independence Day
    nthWeekday(y, 9, 1, 1), // Labor Day
    nthWeekday(y, 11, 4, 4), // Thanksgiving
    observed(iso(y, 12, 25)), // Christmas
  ].filter((d): d is ISODate => Boolean(d));
  set = new Set(list);
  holidayCache.set(y, set);
  return set;
}

export function isTradingDay(d: ISODate) {
  const w = weekday(d);
  if (w === 0 || w === 6) return false;
  return !nyseHolidays(parts(d).y).has(d);
}

const prevCache = new Map<ISODate, ISODate>();
export function previousTradingDay(d: ISODate): ISODate {
  const hit = prevCache.get(d);
  if (hit) return hit;
  let x = addDays(d, -1);
  while (!isTradingDay(x)) x = addDays(x, -1);
  prevCache.set(d, x);
  return x;
}

export function nextTradingDay(d: ISODate): ISODate {
  let x = addDays(d, 1);
  while (!isTradingDay(x)) x = addDays(x, 1);
  return x;
}

/** The last `n` trading days ending at `end` (inclusive if it is a trading day), oldest first. */
export function tradingDaysBack(end: ISODate, n: number): ISODate[] {
  const out: ISODate[] = [];
  let x = isTradingDay(end) ? end : previousTradingDay(end);
  while (out.length < n) {
    out.unshift(x);
    x = previousTradingDay(x);
  }
  return out;
}

/** UTC instant for a wall-clock time in New York on a given date (DST-aware). */
export function nyTimeToUtc(d: ISODate, hh: number, mm: number): Date {
  const { y, m, day } = parts(d);
  const guess = Date.UTC(y, m - 1, day, hh, mm);
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  const offsetAt = (t: number) => {
    const p = Object.fromEntries(fmt.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
    const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour) % 24, Number(p.minute));
    return asUtc - t;
  };
  let t = guess - offsetAt(guess);
  t = guess - offsetAt(t); // second pass settles DST boundaries
  return new Date(t);
}

/** The New York calendar date of an instant. */
export function nyDate(at: Date): ISODate {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

export const OPEN = { hh: 9, mm: 30 } as const;
export const WINDOW_MINUTES = 15;

/**
 * Most recent session whose 9:30–9:45 ET window has fully finished at `now`.
 * Before 9:45 ET on a trading day, that's the previous trading day.
 */
export function latestCompletedSession(now: Date): ISODate {
  const today = nyDate(now);
  if (isTradingDay(today) && now.getTime() >= nyTimeToUtc(today, OPEN.hh, OPEN.mm + WINDOW_MINUTES).getTime()) return today;
  return previousTradingDay(today);
}
