// Port of FatekModbus.ViewerPlayer CookingHistory/CookingAnalysis (desktop player).
// Times are epoch milliseconds of the factory wall clock; keep the logic in step with the C# version.

export const MINUTE = 60_000;

export const enum SampleIssue {
  None = 0,
  NoData = 1,
  NodeAbsent = 2,
  SensorError = 3,
  MissingTemperature = 4,
  Unreadable = 5,
}

export interface CookingSample {
  time: number;
  snapshotId: number;
  temp: number | null;
  number: number | null;
  /** null: node absent from the snapshot; 0: present without a valve. */
  valve: number | null;
  virtual: boolean;
  issue: SampleIssue;
}

export interface ValveMovement {
  valve: number;
  fromNode: number | null;
  actualNode: number | null;
  startedAt: number | null;
  attachedAt: number | null;
  afterGap: boolean;
}

export interface CookingCycle {
  node: number;
  valve: number;
  cookStart: number | null;
  cookEnd: number | null;
  firstObserved: number;
  lastObserved: number;
  incompleteAtStart: boolean;
  incompleteAtEnd: boolean;
  hasDataGap: boolean;
  replacedByAnotherValve: boolean;
  startBoundaryPrevious: number | null;
  endBoundaryPrevious: number | null;
  startFromMovement: boolean;
  endFromMovement: boolean;
}

export interface CookingAnalysisOptions {
  peak: number;
  cool: number;
  fireWindow: number;
  fireRise: number;
  fireSamples: number;
  dataGap?: number;
}

export interface NumberStats {
  minimum: number;
  minimumAt: number;
  maximum: number;
  maximumAt: number;
  timeWeightedMean: number | null;
  coverage: number;
}

export interface TimedNumber {
  value: number;
  at: number;
}

export type CookEventKey = 'fireStart' | 'cookStart' | 'peakEntry' | 'cookEnd';

export interface CookingAnalysis {
  cycle: CookingCycle;
  fireStart: number | null;
  firstPeakEntry: number | null;
  coolEnd: number | null;
  peakIntervals: Array<[number, number]>;
  peakDuration: number;
  longestPeak: number;
  temperatureCoverage: number;
  maximum: { temp: number; at: number } | null;
  wholeNumbers: NumberStats | null;
  peakNumbers: NumberStats | null;
  eventNumbers: Record<CookEventKey, TimedNumber | null>;
  numberReset: boolean;
  validCount: number;
  sampleCount: number;
  preheat: number | null;
  cookDuration: number | null;
  fireToRemoval: number | null;
  coolingDuration: number | null;
  peakPercent: number | null;
}

export interface ManualEvents {
  fire: number | null;
  start: number | null;
  end: number | null;
}

export const isValid = (sample: CookingSample): boolean =>
  sample.temp !== null && sample.issue === SampleIssue.None;

const byTime = (a: CookingSample, b: CookingSample): number =>
  a.time - b.time || a.snapshotId - b.snapshotId;

/** Three times the median interval of valid samples, at least three minutes. */
export function gapThreshold(samples: readonly CookingSample[]): number {
  const times = samples.filter(isValid).map((s) => s.time).sort((a, b) => a - b);
  const intervals: number[] = [];
  for (let i = 0; i + 1 < times.length; i++) {
    const delta = times[i + 1] - times[i];
    if (delta > 0) intervals.push(delta);
  }
  if (intervals.length === 0) return 3 * MINUTE;
  intervals.sort((a, b) => a - b);
  return Math.max(3 * MINUTE, 3 * intervals[Math.floor(intervals.length / 2)]);
}

/** Gap predicate between two sample times. */
export type GapTest = (from: number, to: number) => boolean;

export const thresholdGap = (gap: number): GapTest => (from, to) => to - from > gap;

/** Gap test over explicit gap intervals (used for down-sampled overview series). */
export function intervalGap(gaps: ReadonlyArray<readonly [number, number]>): GapTest {
  return (from, to) => gaps.some(([start, end]) => start >= from && end <= to);
}

export function detectCycles(
  samples: readonly CookingSample[],
  node: number,
  windowStart: number,
  windowEnd: number,
  isGap: GapTest,
  movements: readonly ValveMovement[] = [],
): CookingCycle[] {
  if (windowEnd <= windowStart) throw new Error('End must be after start.');
  const ordered = [...samples].sort(byTime);
  const cycles: CookingCycle[] = [];
  let previousKnown: CookingSample | null = null;
  let first: CookingSample | null = null;
  let last: CookingSample | null = null;
  let start: number | null = null;
  let startBoundaryPrevious: number | null = null;
  let hasGap = false;
  let activeValve = 0;

  const addCycle = (end: number | null, replaced: boolean) => {
    cycles.push({
      node,
      valve: activeValve,
      cookStart: start,
      cookEnd: end,
      firstObserved: first!.time,
      lastObserved: last!.time,
      incompleteAtStart: start === null || start < windowStart,
      incompleteAtEnd: end === null || end > windowEnd,
      hasDataGap: hasGap,
      replacedByAnotherValve: replaced,
      startBoundaryPrevious,
      endBoundaryPrevious: replaced ? null : last!.time,
      startFromMovement: false,
      endFromMovement: false,
    });
  };

  for (const sample of ordered) {
    // A missing node or damaged snapshot is not proof that a valve was removed.
    if (sample.valve === null) {
      if (activeValve > 0) hasGap = true;
      continue;
    }
    const valve = sample.valve;
    if (activeValve > 0 && last !== null && isGap(last.time, sample.time)) hasGap = true;

    if (valve !== activeValve) {
      if (activeValve > 0 && first !== null && last !== null) {
        // A replacement closes the old presence at its last observation;
        // a confirmed removal closes it at the first snapshot without that valve.
        addCycle(valve > 0 ? last.time : sample.time, valve > 0);
      }
      if (valve > 0) {
        activeValve = valve;
        first = sample;
        last = sample;
        start = previousKnown !== null && previousKnown.valve !== valve ? sample.time : null;
        startBoundaryPrevious = previousKnown?.time ?? null;
        hasGap = previousKnown !== null && isGap(previousKnown.time, sample.time);
      } else {
        activeValve = 0;
        first = null;
        last = null;
        start = null;
        startBoundaryPrevious = null;
        hasGap = false;
      }
    } else if (activeValve > 0) {
      last = sample;
    }
    previousKnown = sample;
  }

  if (activeValve > 0 && first !== null && last !== null) addCycle(null, false);
  return cycles
    .filter((c) => (c.cookEnd ?? c.lastObserved) >= windowStart && c.firstObserved <= windowEnd)
    .map((c) => applyMovementEvidence(c, ordered, movements, windowStart, windowEnd));
}

function applyMovementEvidence(
  cycle: CookingCycle,
  samples: readonly CookingSample[],
  movements: readonly ValveMovement[],
  windowStart: number,
  windowEnd: number,
): CookingCycle {
  if (movements.length === 0) return cycle;
  let previous: CookingSample | null = null;
  for (const s of samples) if (s.time < cycle.firstObserved && s.valve !== null) previous = s;
  const attachment = movements
    .filter((m) => m.valve === cycle.valve && m.actualNode === cycle.node && m.attachedAt !== null
      && m.attachedAt <= cycle.firstObserved && (previous === null || m.attachedAt >= previous.time))
    .sort((a, b) => b.attachedAt! - a.attachedAt!)[0];
  const cookStart = attachment?.attachedAt ?? cycle.cookStart;
  const removal = cycle.replacedByAnotherValve ? undefined : movements
    .filter((m) => m.valve === cycle.valve && m.fromNode === cycle.node && m.startedAt !== null
      && m.startedAt >= cycle.lastObserved && (cycle.cookEnd === null || m.startedAt <= cycle.cookEnd))
    .sort((a, b) => a.startedAt! - b.startedAt!)[0];
  const cookEnd = removal?.startedAt ?? cycle.cookEnd;
  return {
    ...cycle,
    cookStart,
    cookEnd,
    incompleteAtStart: cookStart === null || cookStart < windowStart,
    incompleteAtEnd: cookEnd === null || cookEnd > windowEnd,
    hasDataGap: cycle.hasDataGap || attachment?.afterGap === true || removal?.afterGap === true,
    startFromMovement: attachment !== undefined,
    endFromMovement: removal !== undefined,
  };
}

export function analyzeCycle(
  samples: readonly CookingSample[],
  cycle: CookingCycle,
  options: CookingAnalysisOptions,
  visibleStart: number,
  visibleEnd: number,
  through: number | null = null,
  manual: ManualEvents = { fire: null, start: null, end: null },
): CookingAnalysis {
  if (options.peak <= options.cool || options.cool < 0 || options.peak >= 65535)
    throw new Error('Peak temperature must be above cooling temperature.');
  if (options.fireWindow <= 0 || options.fireRise <= 0 || options.fireSamples < 3)
    throw new Error('Detection settings must be positive and require at least three samples.');

  const end = through !== null && through < visibleEnd ? through : visibleEnd;
  const ordered = samples.filter((s) => s.time <= end).sort(byTime);
  const dataGap = options.dataGap ?? gapThreshold(ordered);
  let cookStart = manual.start ?? cycle.cookStart;
  let cookEnd = manual.end ?? cycle.cookEnd;
  if (cookStart !== null && cookStart > end) cookStart = null;
  if (cookEnd !== null && cookEnd > end) cookEnd = null;
  const visibleCycle: CookingCycle = {
    ...cycle,
    cookStart,
    cookEnd,
    incompleteAtEnd: manual.end !== null
      ? cookEnd === null || cookEnd > visibleEnd
      : cycle.incompleteAtEnd || cookEnd === null,
    incompleteAtStart: manual.start !== null
      ? cookStart === null || cookStart < visibleStart
      : cycle.incompleteAtStart || cookStart === null,
  };
  let fire = manual.fire ?? detectFireStart(ordered, options, visibleStart, cookStart);
  if (fire !== null && fire > end) fire = null;

  const intervalStart = Math.max(visibleStart, cookStart ?? cycle.firstObserved);
  const intervalEnd = Math.min(end, cookEnd ?? end);
  const peaks = intervalEnd > intervalStart
    ? peakIntervals(ordered, intervalStart, intervalEnd, options.peak, dataGap)
    : [];
  const peakDuration = peaks.reduce((sum, [a, b]) => sum + (b - a), 0);
  const longestPeak = peaks.reduce((longest, [a, b]) => Math.max(longest, b - a), 0);
  const firstPeak = peaks.length > 0 ? peaks[0][0] : null;

  const validCook = ordered.filter((s) => isValid(s) && s.time >= intervalStart && s.time < intervalEnd);
  let hottest: CookingSample | null = null;
  for (const s of validCook) if (hottest === null || s.temp! > hottest.temp!) hottest = s;

  let coolEnd: number | null = null;
  if (cookEnd !== null && cookEnd <= end) {
    let atRemoval: CookingSample | null = null;
    for (const s of ordered) if (isValid(s) && s.time <= cookEnd) atRemoval = s;
    if (atRemoval !== null && atRemoval.temp! <= options.cool && cookEnd - atRemoval.time <= dataGap) {
      coolEnd = cookEnd;
    } else {
      let coolingPrevious = atRemoval;
      for (const sample of ordered) {
        if (sample.time < cookEnd) continue;
        if (!isValid(sample) || (coolingPrevious !== null && sample.time - coolingPrevious.time > dataGap)) break;
        if (sample.temp! <= options.cool) {
          coolEnd = sample.time;
          break;
        }
        coolingPrevious = sample;
      }
    }
  }

  const wholeNumbers = numberStats(ordered, intervalStart, intervalEnd, [[intervalStart, intervalEnd]], dataGap);
  const peakNumbers = numberStats(ordered, intervalStart, intervalEnd, peaks, dataGap);
  const eventNumbers: Record<CookEventKey, TimedNumber | null> = {
    fireStart: numberAt(ordered, fire, true),
    cookStart: numberAt(ordered, cookStart, false),
    peakEntry: numberAt(ordered, firstPeak, false),
    cookEnd: numberAt(ordered, cookEnd, true),
  };
  let reset = false;
  let previous: CookingSample | null = null;
  const resetCheckStart = fire !== null && fire < intervalStart ? fire : intervalStart;
  for (const sample of ordered) {
    if (sample.time < resetCheckStart || sample.time >= intervalEnd || sample.number === null) continue;
    if (previous !== null && previous.number !== null && sample.number < previous.number) reset = true;
    previous = sample;
  }
  let coverage = 0;
  for (let i = 0; i + 1 < ordered.length; i++) {
    const a = ordered[i];
    const b = ordered[i + 1];
    if (!isValid(a) || !isValid(b) || b.time - a.time > dataGap) continue;
    const from = Math.max(intervalStart, a.time);
    const to = Math.min(intervalEnd, b.time);
    if (to > from) coverage += to - from;
  }

  const preheat = fire !== null && visibleCycle.cookStart !== null ? visibleCycle.cookStart - fire : null;
  const cookDuration = !visibleCycle.incompleteAtStart && !visibleCycle.incompleteAtEnd
    && visibleCycle.cookStart !== null && visibleCycle.cookEnd !== null
    ? visibleCycle.cookEnd - visibleCycle.cookStart : null;
  return {
    cycle: visibleCycle,
    fireStart: fire,
    firstPeakEntry: firstPeak,
    coolEnd,
    peakIntervals: peaks,
    peakDuration,
    longestPeak,
    temperatureCoverage: coverage,
    maximum: hottest === null ? null : { temp: hottest.temp!, at: hottest.time },
    wholeNumbers,
    peakNumbers,
    eventNumbers,
    numberReset: reset,
    validCount: validCook.length,
    sampleCount: ordered.filter((s) => s.time >= visibleStart && s.time <= end).length,
    preheat,
    cookDuration,
    fireToRemoval: fire !== null && !visibleCycle.incompleteAtEnd && visibleCycle.cookEnd !== null
      ? visibleCycle.cookEnd - fire : null,
    coolingDuration: coolEnd !== null && !visibleCycle.incompleteAtEnd && visibleCycle.cookEnd !== null
      ? coolEnd - visibleCycle.cookEnd : null,
    peakPercent: cookDuration !== null && cookDuration > 0 ? (100 * peakDuration) / cookDuration : null,
  };
}

function detectFireStart(
  samples: readonly CookingSample[],
  options: CookingAnalysisOptions,
  visibleStart: number,
  cookStart: number | null,
): number | null {
  if (cookStart === null) return null;
  let priorCycleEnd: number | null = null;
  for (const s of samples) if (s.time < cookStart && s.valve !== null && s.valve > 0) priorCycleEnd = s.time;
  const lower = Math.max(visibleStart, priorCycleEnd ?? visibleStart);
  const preheat = samples.filter((s) => isValid(s) && s.time >= lower && s.time < cookStart);
  const gap = options.dataGap ?? gapThreshold(preheat);
  if (preheat.length === 0 || cookStart - preheat[preheat.length - 1].time > gap) return null;
  let candidate: number | null = null;
  for (let i = 0; i < preheat.length; i++) {
    let increases = 0;
    for (let j = i + 1; j < preheat.length && preheat[j].time - preheat[i].time <= options.fireWindow; j++) {
      if (preheat[j].time - preheat[j - 1].time > gap) break;
      if (preheat[j].temp! > preheat[j - 1].temp!) increases++;
      if (j - i + 1 >= options.fireSamples && increases >= 2
        && preheat[j].temp! - preheat[i].temp! >= options.fireRise)
        candidate = preheat[i].time;
    }
  }
  return candidate;
}

function peakIntervals(
  samples: readonly CookingSample[],
  start: number,
  end: number,
  threshold: number,
  gap: number,
): Array<[number, number]> {
  const result: Array<[number, number]> = [];
  let open: number | null = null;
  const close = (at: number) => {
    if (open === null) return;
    const from = Math.max(open, start);
    const to = Math.min(at, end);
    if (to > from) result.push([from, to]);
    open = null;
  };
  for (let i = 0; i < samples.length; i++) {
    const current = samples[i];
    if (!isValid(current)) {
      close(i > 0 ? samples[i - 1].time : current.time);
      continue;
    }
    if (current.time < start || current.time > end) continue;
    if (i > 0) {
      const previous = samples[i - 1];
      if (!isValid(previous) || current.time - previous.time > gap) close(previous.time);
      else if (previous.temp! < threshold && current.temp! >= threshold)
        open ??= crossing(previous, current, threshold);
      else if (previous.temp! >= threshold && current.temp! < threshold)
        close(crossing(previous, current, threshold));
    }
    if (current.temp! >= threshold) {
      const before = i > 0 ? samples[i - 1] : null;
      open ??= before !== null && isValid(before) && before.temp! >= threshold
        && before.time < start && current.time - before.time <= gap ? start : current.time;
    } else {
      close(current.time);
    }
  }
  let lastValid: CookingSample | null = null;
  for (const s of samples) if (isValid(s) && s.time <= end) lastValid = s;
  close(lastValid?.time ?? end);
  return result;
}

function crossing(a: CookingSample, b: CookingSample, threshold: number): number {
  if (a.temp === b.temp) return b.time;
  const fraction = (threshold - a.temp!) / (b.temp! - a.temp!);
  return a.time + Math.trunc((b.time - a.time) * Math.min(1, Math.max(0, fraction)));
}

function numberStats(
  samples: readonly CookingSample[],
  start: number,
  end: number,
  intervals: ReadonlyArray<readonly [number, number]>,
  gap: number,
): NumberStats | null {
  const values = samples.filter((s) => s.number !== null && isValid(s) && s.time >= start && s.time < end
    && intervals.some(([a, b]) => s.time >= a && s.time < b));
  if (values.length === 0) return null;
  let minimum = values[0];
  let maximum = values[0];
  for (const s of values) {
    if (s.number! < minimum.number!) minimum = s;
    if (s.number! > maximum.number!) maximum = s;
  }
  let weighted = 0;
  let total = 0;
  for (let i = 0; i + 1 < samples.length; i++) {
    const a = samples[i];
    const b = samples[i + 1];
    if (a.number === null || b.number === null || !isValid(a) || !isValid(b) || b.time - a.time > gap) continue;
    for (const [left, right] of intervals) {
      const from = Math.max(a.time, left);
      const to = Math.min(b.time, right);
      if (to <= from) continue;
      weighted += a.number * (to - from);
      total += to - from;
    }
  }
  return {
    minimum: minimum.number!,
    minimumAt: minimum.time,
    maximum: maximum.number!,
    maximumAt: maximum.time,
    timeWeightedMean: total > 0 ? weighted / total : null,
    coverage: total,
  };
}

function numberAt(samples: readonly CookingSample[], at: number | null, before: boolean): TimedNumber | null {
  if (at === null) return null;
  let found: CookingSample | null = null;
  if (before) {
    for (const s of samples) if (s.number !== null && s.time <= at) found = s;
  } else {
    found = samples.find((s) => s.number !== null && s.time >= at) ?? null;
  }
  return found === null ? null : { value: found.number!, at: found.time };
}
