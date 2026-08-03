import { KilnChamber, KilnNode, stageForTemp } from './kiln-scene.model';

/**
 * Sample data for demos / storybook. Real screens should use
 * `mapMonitoringKoreh(mo)` on the server payload instead.
 *
 * 47 nodes (real at odd SlaveAddress, virtual at even) + 24 chambers — mirrors
 * the shape produced by the mapper for a single rokh.
 */

const curve = (frac: number) => 120 + 1000 * Math.exp(-Math.pow(frac - 0.4, 2) / (2 * 0.13 * 0.13));

export const DEMO_KILN_NODES: KilnNode[] = Array.from({ length: 47 }, (_, i) => {
  const t = Math.round(curve(i / 46));
  const isVirtual = i % 2 === 1; // even SlaveAddress (2,4,..) => virtual
  return {
    number: String(i + 1),
    temperature: t,
    cookNumber: isVirtual ? 0 : (i * 2 + 3) % 13,
    isVirtual,
    valve: !isVirtual && i % 8 === 0 ? i / 8 + 1 : 0,
    valveMode: !isVirtual && i % 8 === 0 ? (i % 16 === 0 ? 'manual' : 'auto') : null,
    valveState: !isVirtual && i % 8 === 0 ? [50, 100, 150, 200][(i / 8) % 4] : 0,
    valveOpen: !isVirtual && i % 8 === 0 ? [30, 60, 90, 45][(i / 8) % 4] : 0,
    batteryLevel: isVirtual ? null : Math.max(15, Math.round(100 - i * 1.3)),
    failed: !isVirtual && i % 7 === 0,
    alarm: i === 20,
    stage: stageForTemp(t),
    ghamirId: `g-${Math.floor(i / 2) + 1}`,
    title: `نود ${i + 1}`,
  };
});

export const DEMO_KILN_CHAMBERS: KilnChamber[] = Array.from({ length: 24 }, (_, j) => {
  const t = Math.round(curve(j / 23));
  return {
    number: String(j + 1).padStart(2, '0'),
    product: j % 3 === 0 ? 'بلوک ۱۰' : '',
    status: j % 3 === 0 ? 'چیدمان' : 'خالی',
    isEmpty: j % 3 !== 0,
    temperature: t,
    stage: stageForTemp(t),
    alarm: j === 9,
    id: `g-${j + 1}`,
  };
});
