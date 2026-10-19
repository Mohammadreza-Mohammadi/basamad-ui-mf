import { CookingSample, SampleIssue, ValveMovement } from './cooking-analysis';

// Payloads of the server BL methods in CodeMantegh.cs (CookingChartService). Times travel as
// "yyyy-MM-dd HH:mm:ss" factory wall-clock strings plus "seconds from origin" offsets.

export interface CookingKiln {
  /** Encrypted MetaObject id (opaque); never parse it as a number. */
  id: string;
  number: number;
  title: string;
  factory: string;
  nodes: number;
}

export interface NodeSeries {
  node: number;
  /** Data-gap threshold (ms) computed by the server on full-resolution samples. */
  gap: number;
  /** Real gaps between full-resolution samples, as [from, to] epoch ms. */
  gaps: Array<[number, number]>;
  last: number | null;
  lastAt: number | null;
  max: number | null;
  samples: CookingSample[];
}

export interface KilnOverview {
  kiln: { id: string; number: number; title: string };
  from: number;
  to: number;
  snapshots: number;
  nodes: NodeSeries[];
  movements: ValveMovement[];
}

export interface NodeHistory {
  kiln: { id: string; number: number; title: string };
  from: number;
  to: number;
  unreadable: number;
  node: NodeSeries;
  movements: ValveMovement[];
}

const num = (value: unknown): number => Number(value);
const numOrNull = (value: unknown): number | null =>
  value === null || value === undefined || value === '' ? null : Number(value);

/** "yyyy-MM-dd HH:mm:ss" (factory wall clock) to epoch ms in the browser's local zone. */
export function parseServerDate(text: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(String(text).trim());
  if (!match) throw new Error(`Invalid date ${text}`);
  const [, y, mo, d, h, mi, s] = match;
  return new Date(+y, +mo - 1, +d, +h, +mi, +(s ?? 0)).getTime();
}

const pad = (value: number) => String(value).padStart(2, '0');

export function toServerDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Value for <input type="datetime-local">. */
export function toInputDate(ms: number): string {
  return toServerDate(ms).replace(' ', 'T').slice(0, 16);
}

export function fromInputDate(value: string): number | null {
  if (!value) return null;
  try {
    return parseServerDate(value);
  } catch {
    return null;
  }
}

/** Server responses are JSON strings; tolerate an already-parsed object too. */
function json(raw: unknown): any {
  if (typeof raw === 'string') return JSON.parse(raw);
  if (raw && typeof raw === 'object') return raw;
  throw new Error('پاسخ نامعتبر از سرور');
}

function parseSeries(raw: any, origin: number): NodeSeries {
  const t: unknown[] = raw.t ?? [];
  const samples: CookingSample[] = new Array(t.length);
  for (let i = 0; i < t.length; i++) {
    const flags = num(raw.x[i]);
    samples[i] = {
      time: origin + num(t[i]) * 1000,
      snapshotId: i,
      temp: numOrNull(raw.v[i]),
      number: numOrNull(raw.c[i]),
      valve: numOrNull(raw.s[i]),
      virtual: (flags & 1) === 1,
      issue: (flags >> 1) as SampleIssue,
    };
  }
  return {
    node: num(raw.n),
    gap: num(raw.gap) * 1000,
    gaps: (raw.gaps ?? []).map((g: unknown[]) => [origin + num(g[0]) * 1000, origin + num(g[1]) * 1000]),
    last: numOrNull(raw.last),
    lastAt: raw.lastAt === null || raw.lastAt === undefined ? null : origin + num(raw.lastAt) * 1000,
    max: numOrNull(raw.max),
    samples,
  };
}

function parseMovements(raw: any[], origin: number): ValveMovement[] {
  return (raw ?? []).map((m) => ({
    valve: num(m.v),
    fromNode: numOrNull(m.f),
    actualNode: numOrNull(m.a),
    startedAt: m.s === null || m.s === undefined ? null : origin + num(m.s) * 1000,
    attachedAt: m.t === null || m.t === undefined ? null : origin + num(m.t) * 1000,
    afterGap: m.g === true || m.g === 'true',
  }));
}

function parseKiln(raw: any) {
  return { id: String(raw.id), number: num(raw.number), title: String(raw.title ?? '') };
}

export function parseKilns(raw: unknown): { restricted: boolean; kilns: CookingKiln[] } {
  const data = json(raw);
  return {
    restricted: data.factoryRestricted === true,
    kilns: (data.kilns ?? []).map((k: any) => ({
      id: String(k.id),
      number: num(k.number),
      title: String(k.title ?? ''),
      factory: String(k.factory ?? ''),
      nodes: num(k.nodes),
    })).sort((a: CookingKiln, b: CookingKiln) => a.factory.localeCompare(b.factory, 'fa') || a.number - b.number),
  };
}

export function parseOverview(raw: unknown): KilnOverview {
  const data = json(raw);
  const origin = parseServerDate(data.origin);
  return {
    kiln: parseKiln(data.kiln),
    from: parseServerDate(data.from),
    to: parseServerDate(data.to),
    snapshots: num(data.snapshots),
    nodes: (data.nodes ?? []).map((n: any) => parseSeries(n, origin)),
    movements: parseMovements(data.movements, origin),
  };
}

export function parseNodeHistory(raw: unknown): NodeHistory {
  const data = json(raw);
  const origin = parseServerDate(data.origin);
  return {
    kiln: parseKiln(data.kiln),
    from: parseServerDate(data.from),
    to: parseServerDate(data.to),
    unreadable: num(data.unreadable),
    node: parseSeries(data.node, origin),
    movements: parseMovements(data.movements, origin),
  };
}

export function parseWindow(raw: unknown): { from: number; to: number } {
  const data = json(raw);
  return { from: parseServerDate(data.from), to: parseServerDate(data.to) };
}

/** Turns a platform/server failure into a message fit for the status line. */
export function errorMessage(error: unknown): string {
  const anyError = error as any;
  const text = anyError?.Message ?? anyError?.message ?? anyError?.ExceptionMessage ?? anyError?.ErrorMessage;
  if (typeof text === 'string' && text.trim()) return text.trim();
  if (typeof error === 'string' && error.trim()) return error.trim();
  return 'خطای ناشناخته در ارتباط با سرور';
}

export const ISSUE_TEXT: Record<number, string> = {
  [SampleIssue.NoData]: 'اسنپ‌شات بدون داده',
  [SampleIssue.NodeAbsent]: 'نود در اسنپ‌شات نبود',
  [SampleIssue.SensorError]: 'خطای سنسور',
  [SampleIssue.MissingTemperature]: 'دما ثبت نشده',
  [SampleIssue.Unreadable]: 'داده خوانا نیست',
};

// ---------------------------------------------------------------- formatting (Jalali, Latin digits)

const jalaliParts = new Intl.DateTimeFormat('fa-IR-u-ca-persian-nu-latn', {
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  // hourCycle avoids "24:00" at midnight; it is missing from the es2018 lib typings.
  hourCycle: 'h23',
} as Intl.DateTimeFormatOptions);

function parts(ms: number): Record<string, string> {
  const result: Record<string, string> = {};
  for (const part of jalaliParts.formatToParts(new Date(ms))) result[part.type] = part.value;
  return result;
}

/** LRM keeps numbers/dates in LTR order inside Persian sentences. */
export const LRM = '\u200E';

export function formatDateTime(ms: number | null, seconds = true): string {
  if (ms === null) return 'نامشخص';
  const p = parts(ms);
  return `${LRM}${p['year']}/${p['month']}/${p['day']} ${p['hour']}:${p['minute']}${seconds ? ':' + p['second'] : ''}`;
}

export function formatShort(ms: number | null): string {
  if (ms === null) return '—';
  const p = parts(ms);
  return `${LRM}${p['month']}/${p['day']} ${p['hour']}:${p['minute']}`;
}

export function formatTime(ms: number | null, seconds = true): string {
  if (ms === null) return '—';
  const p = parts(ms);
  return `${LRM}${p['hour']}:${p['minute']}${seconds ? ':' + p['second'] : ''}`;
}

export function formatDay(ms: number): string {
  const p = parts(ms);
  return `${LRM}${p['month']}/${p['day']}`;
}

export const PENDING = 'نامشخص / در انتظار';

export function formatDuration(ms: number | null): string {
  if (ms === null) return PENDING;
  const totalMinutes = Math.floor(ms / MINUTE_MS);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours >= 1 ? `${hours} ساعت و ${minutes} دقیقه` : `${minutes} دقیقه`;
}

export function formatShortDuration(ms: number | null): string {
  if (ms === null) return '—';
  const totalMinutes = Math.floor(ms / MINUTE_MS);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours >= 1 ? `${hours} س ${minutes} د` : `${minutes} د`;
}

export function celsius(value: number): string {
  return `${LRM}${value} °C`;
}

const MINUTE_MS = 60_000;
