/**
 * Data-driven kiln scene model + a mapper from the raw server `Mo`
 * (MetaobjectDataModel) shape delivered by monitoring-koreh.
 *
 * Two independent entities:
 *  - Node (Transmitter): a sensor. May be REAL or VIRTUAL (IsMajazi).
 *    Virtual nodes sit between two real nodes and only carry a temperature
 *    (lower importance -> rendered dimmer / smaller).
 *  - Chamber (Ghamir): a brick-load chamber (the glowing arch). Its color is
 *    derived from the temperatures of the nodes bound to it.
 */

export type KilnStage = 'firing' | 'preheat' | 'cooling';

export interface StageMeta {
  key: KilnStage;
  label: string;
  color: string;
}

export const KILN_STAGE_META: Record<KilnStage, StageMeta> = {
  firing: { key: 'firing', label: 'در حال پخت', color: '#ff3b30' },
  preheat: { key: 'preheat', label: 'پیش‌گرم', color: '#ff9f0a' },
  cooling: { key: 'cooling', label: 'کولینگ', color: '#0a84ff' },
};

export const KILN_LEGEND: StageMeta[] = [
  KILN_STAGE_META.firing,
  KILN_STAGE_META.preheat,
  KILN_STAGE_META.cooling,
];

export function stageForTemp(t: number): KilnStage {
  if (t >= 800) return 'firing';
  if (t >= 400) return 'preheat';
  return 'cooling';
}

/** Valve color from its RangShir state. */
export function valveStateColor(state: number): string {
  switch (state) {
    case 50: return '#f2c400'; // زرد
    case 100: return '#ff3b30'; // قرمز
    case 150: return '#34c759'; // سبز
    case 200: return '#0c0c0e'; // سیاه
    default: return '#8a95a1'; // بی‌رنگ
  }
}

export interface KilnNode {
  number: string;
  temperature: number;
  cookNumber: number;
  /** Virtual (مجازی) node — interpolated temperature only, lower weight. */
  isVirtual: boolean;
  /** Valve number (ShirNode). 0 = no valve on this node. */
  valve: number;
  /** Valve mode: automatic (green) / manual=دستی (red) / null = no valve. */
  valveMode: 'auto' | 'manual' | null;
  /** Valve color state (RangShir): 0 بی‌رنگ / 50 زرد / 100 قرمز / 150 سبز / 200 سیاه. */
  valveState: number;
  /** Valve open amount (ShirPosition) 0..100. */
  valveOpen: number;
  batteryLevel: number | null;
  failed: boolean;
  alarm: boolean;
  stage: KilnStage;
  ghamirId: string | null;
  title: string;
}

export interface KilnChamber {
  number: string;
  product: string;
  status: string;
  isEmpty: boolean;
  temperature: number;
  stage: KilnStage;
  alarm: boolean;
  id: string | null;
}

export interface KilnRokh {
  rokhNumber: number;
  nodes: KilnNode[];
  chambers: KilnChamber[];
}

export interface KilnKoreh {
  title: string;
  startPosition: string;
  rokhs: KilnRokh[];
}

/* -------------------------------------------------------------------------- */
/* Mapper                                                                     */
/* -------------------------------------------------------------------------- */

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const bool = (v: unknown): boolean => v === true || v === 'true' || v === 'True';

function mapNode(t: any): KilnNode {
  const temperature = num(t.Value);
  const valve = num(t.ShirNode);
  const battery = num(t.BatteryValue);
  const hasValve = valve > 0 && valve < 100;
  // HalatShir "3" / caption "دستی" => manual (red); otherwise automatic (green)
  const manual =
    String(t.HalatShir) === '3' ||
    String(t['HalatShir$Caption'] ?? '').includes('دستی');
  return {
    number: String(t.SlaveAddress ?? ''),
    temperature,
    cookNumber: num(t.AdadPokht),
    isVirtual: bool(t.IsMajazi),
    valve,
    valveMode: hasValve ? (manual ? 'manual' : 'auto') : null,
    valveState: num(t.RangShir),
    valveOpen: Math.max(0, Math.min(100, num(t.ShirPosition))),
    batteryLevel: battery > 0 ? battery : null,
    failed: bool(t.TransmitterFailed) || bool(t.TermokoplFailed),
    alarm: bool(t.Error) || temperature >= 1000,
    stage: stageForTemp(temperature),
    ghamirId: t.Ghamir?.Id ?? null,
    title: String(t.Title ?? `نود ${t.SlaveAddress ?? ''}`),
  };
}

function mapChamber(g: any, nodesByGhamir: Map<string, KilnNode[]>): KilnChamber {
  const bound = (g.Id && nodesByGhamir.get(g.Id)) || [];
  const reals = bound.filter((n) => !n.isVirtual);
  const pool = reals.length ? reals : bound;
  const temperature = pool.length
    ? Math.round(pool.reduce((s, n) => s + n.temperature, 0) / pool.length)
    : 0;
  const status = String(g.GhamirStatusText ?? '');
  return {
    number: String(g.Number ?? ''),
    product: String(g.Mahsol?.$Caption ?? ''),
    status,
    isEmpty: bool(g.IsEmpty) || status === 'خالی',
    temperature,
    stage: stageForTemp(temperature),
    alarm: pool.some((n) => n.alarm),
    id: g.Id ?? null,
  };
}

/** Convert the raw monitoring-koreh `Mo` into a render-ready `KilnKoreh`. */
export function mapMonitoringKoreh(mo: any): KilnKoreh {
  const transmitters: any[] = mo?.Transmitters?.MoDataList ?? [];
  const ghamirs: any[] = mo?.Ghamirs?.MoDataList ?? [];

  const allNodes = transmitters.map(mapNode);

  // index real+virtual nodes by their chamber (Ghamir) for color derivation
  const nodesByGhamir = new Map<string, KilnNode[]>();
  transmitters.forEach((t, i) => {
    const gid = t.Ghamir?.Id;
    if (!gid) return;
    const list = nodesByGhamir.get(gid) ?? [];
    list.push(allNodes[i]);
    nodesByGhamir.set(gid, list);
  });

  const rokhNumbers = Array.from(
    new Set([
      ...transmitters.map((t) => num(t.RokhNumber)),
      ...ghamirs.map((g) => num(g.RokhNumber)),
    ]),
  )
    .filter((r) => r > 0)
    .sort((a, b) => a - b);

  const bySlave = (a: KilnNode, b: KilnNode) => num(a.number) - num(b.number);
  const byNumber = (a: KilnChamber, b: KilnChamber) =>
    num(a.number) - num(b.number);

  // StartOfFirstNodePosition: 1=بالاچپ 2=بالاراست 3=پایین‌چپ 4=پایین‌راست
  // The "left/right" part decides where #1 sits and the direction it runs.
  // SVG x grows left→right, so a RIGHT start means we reverse the order so #1
  // lands on the right. This is applied identically to nodes AND chambers so
  // they stay aligned.
  const startPosition = String(mo?.StartOfFirstNodePosition ?? '1');
  const rightStart = startPosition === '2' || startPosition === '4';

  const rokhs: KilnRokh[] = rokhNumbers.map((rk) => {
    const nodes = transmitters
      .map((t, i) => ({ t, node: allNodes[i] }))
      .filter((x) => num(x.t.RokhNumber) === rk)
      .map((x) => x.node)
      .sort(bySlave);
    const chambers = ghamirs
      .filter((g) => num(g.RokhNumber) === rk)
      .map((g) => mapChamber(g, nodesByGhamir))
      .sort(byNumber);
    if (rightStart) {
      nodes.reverse();
      chambers.reverse();
    }
    return { rokhNumber: rk, nodes, chambers };
  });

  return {
    title: String(mo?.F13 ?? mo?.$Caption ?? 'کوره'),
    startPosition,
    rokhs,
  };
}
