import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  Output,
  ViewChild,
  inject,
} from '@angular/core';
import * as echarts from 'echarts';
import { CookingAnalysis, CookingSample, GapTest, isValid } from './cooking-analysis';
import { ISSUE_TEXT, celsius, formatDateTime, formatDay, formatTime } from './cooking-data';

export const COOKING_COLORS = {
  accent: '#2563eb',
  virtual: '#7c3aed',
  number: '#db2777',
  ghost: '#cbd5e1',
  fire: '#dc2626',
  install: '#16a34a',
  peak: '#ea580c',
  removal: '#9333ea',
  cool: '#0d9488',
  highlight: '#f59e0b',
  text: '#0f172a',
  muted: '#64748b',
  grid: '#edf1f6',
  border: '#e2e8f0',
};

/** Temperature (and cooking number) over time; port of the desktop CookingTemperatureChart. */
@Component({
  selector: 'bu-cooking-chart',
  standalone: false,
  template: `<div #host class="cooking-chart" dir="ltr"></div>`,
  styles: [`
    :host { display: block; position: relative; }
    .cooking-chart { position: absolute; inset: 0; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CookingChartComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() samples: CookingSample[] = [];
  @Input() from = 0;
  @Input() to = 0;
  /** Breaks the line between two consecutive points; defaults to "never". */
  @Input() isGap: GapTest | null = null;
  @Input() analysis: CookingAnalysis | null = null;
  @Input() peak: number | null = null;
  @Input() cool: number | null = null;
  @Input() peakLabel = 'قله';
  /** Playback cursor; samples after it are drawn as a faint "future" line. */
  @Input() through: number | null = null;
  @Input() highlight: { from: number; to: number | null } | null = null;
  @Input() compact = false;
  /** Drag horizontally to select a time range (emits rangeSelected). */
  @Input() selectable = false;
  /** Wheel/slider zoom on the time axis. */
  @Input() zoomable = false;
  /** Create the chart only once it scrolls into view. */
  @Input() lazy = false;
  @Output() readonly rangeSelected = new EventEmitter<{ from: number; to: number }>();

  @ViewChild('host', { static: true }) private hostRef!: ElementRef<HTMLDivElement>;
  private readonly zone = inject(NgZone);
  private chart: echarts.ECharts | null = null;
  private resizeObserver?: ResizeObserver;
  private intersectionObserver?: IntersectionObserver;
  private sorted: CookingSample[] = [];

  ngAfterViewInit(): void {
    if (!this.lazy || typeof IntersectionObserver === 'undefined') {
      this.create();
      return;
    }
    this.intersectionObserver = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        this.intersectionObserver?.disconnect();
        this.create();
      }
    }, { rootMargin: '200px' });
    this.intersectionObserver.observe(this.hostRef.nativeElement);
  }

  ngOnChanges(): void {
    if (this.chart) this.render();
  }

  ngOnDestroy(): void {
    this.intersectionObserver?.disconnect();
    this.resizeObserver?.disconnect();
    if (this.chart) {
      this.chart.dispatchAction({ type: 'hideTip' });
      this.chart.dispose();
      this.chart = null;
    }
  }

  private create(): void {
    this.zone.runOutsideAngular(() => {
      const element = this.hostRef.nativeElement;
      this.chart = echarts.init(element, undefined, { renderer: 'canvas' });
      this.chart.on('brushEnd', (event: any) => this.onBrushEnd(event));
      this.resizeObserver = new ResizeObserver(() => this.chart?.resize());
      this.resizeObserver.observe(element);
      this.render();
    });
  }

  private onBrushEnd(event: any): void {
    const range = event?.areas?.[0]?.coordRange as [number, number] | undefined;
    this.chart?.dispatchAction({ type: 'brush', areas: [] });
    if (!range || range.length < 2) return;
    const from = Math.max(this.from, Math.min(range[0], range[1]));
    const to = Math.min(this.to, Math.max(range[0], range[1]));
    const valid = this.sorted.filter(isValid);
    if (to - from < 60_000 || valid.length === 0) return;
    if (to <= valid[0].time || from >= valid[valid.length - 1].time) return;
    this.zone.run(() => this.rangeSelected.emit({ from, to }));
  }

  private render(): void {
    if (!this.chart) return;
    this.sorted = [...(this.samples ?? [])].sort((a, b) => a.time - b.time);
    const option = this.compact ? this.compactOption() : this.fullOption();
    this.chart.setOption(option, { replaceMerge: ['series', 'xAxis', 'yAxis', 'grid'] });
    if (this.selectable) {
      this.chart.dispatchAction({
        type: 'takeGlobalCursor',
        key: 'brush',
        brushOption: { brushType: 'lineX', brushMode: 'single' },
      });
    }
  }

  // ------------------------------------------------------------------ option builders

  private fontFamily(): string {
    return getComputedStyle(this.hostRef.nativeElement).fontFamily || 'Tahoma, sans-serif';
  }

  private yScale(): { max: number; step: number } {
    let top = 0;
    for (const s of this.sorted) if (isValid(s) && s.temp! > top) top = s.temp!;
    if (!this.compact && this.peak !== null && this.peak > top) top = this.peak;
    if (top <= 0) top = 1000;
    const step = niceStep(top / 4);
    return { max: Math.ceil((top * 1.06) / step) * step, step };
  }

  /** Splits samples into line series, inserting nulls at gaps / invalid readings. */
  private lines(): { real: any[]; virtual: any[]; ghost: any[]; number: any[]; numberGhost: any[] } {
    const real: any[] = [];
    const virtual: any[] = [];
    const ghost: any[] = [];
    const number: any[] = [];
    const numberGhost: any[] = [];
    const through = this.through;
    let previous: CookingSample | null = null;
    let previousNumber: CookingSample | null = null;
    for (const s of this.sorted) {
      const future = through !== null && s.time > through;
      const broken = previous !== null && this.isGap !== null && this.isGap(previous.time, s.time);
      if (broken) {
        const at = previous!.time + 1;
        real.push([at, null]);
        virtual.push([at, null]);
        ghost.push([at, null]);
      }
      if (!isValid(s)) {
        real.push([s.time, null]);
        virtual.push([s.time, null]);
        ghost.push([s.time, null]);
      } else if (future) {
        // Join the ghost line to the last played point so the cursor has no visual hole.
        if (previous !== null && isValid(previous) && !broken && (through === null || previous.time <= through))
          ghost.push([previous.time, previous.temp]);
        ghost.push([s.time, s.temp]);
        real.push([s.time, null]);
        virtual.push([s.time, null]);
      } else {
        const own = s.virtual ? virtual : real;
        const other = s.virtual ? real : virtual;
        // Connect a real/virtual switch so the curve stays continuous.
        if (previous !== null && isValid(previous) && previous.virtual !== s.virtual && !broken)
          own.push([previous.time, previous.temp]);
        own.push([s.time, s.temp]);
        other.push([s.time, null]);
        ghost.push([s.time, null]);
      }
      if (s.number !== null) {
        const gap = previousNumber !== null && this.isGap !== null && this.isGap(previousNumber.time, s.time);
        const target = future ? numberGhost : number;
        if (gap) target.push([previousNumber!.time + 1, null]);
        if (future && previousNumber !== null && !gap && (through === null || previousNumber.time <= through))
          numberGhost.push([previousNumber.time, previousNumber.number]);
        target.push([s.time, s.number]);
        previousNumber = s;
      }
      previous = s;
    }
    return { real, virtual, ghost, number, numberGhost };
  }

  private compactOption(): echarts.EChartsOption {
    const { max } = this.yScale();
    const { real, virtual } = this.lines();
    return {
      animation: false,
      grid: { left: 2, right: 2, top: 4, bottom: 2 },
      xAxis: { type: 'time', min: this.from, max: this.to, show: false },
      yAxis: { type: 'value', min: 0, max, show: false },
      tooltip: {
        trigger: 'axis',
        confine: true,
        axisPointer: { type: 'line', lineStyle: { color: COOKING_COLORS.muted, type: 'dashed' } },
        formatter: (params: any) => this.tooltip(params, true),
      },
      brush: this.selectable ? this.brushOption() : undefined,
      toolbox: { show: false },
      series: [
        lineSeries('دما', real, COOKING_COLORS.accent, 1.5, true),
        lineSeries('سنسور مجازی', virtual, COOKING_COLORS.virtual, 1.5, false, [4, 3]),
      ],
    } as echarts.EChartsOption;
  }

  private fullOption(): echarts.EChartsOption {
    const { max, step } = this.yScale();
    const { real, virtual, ghost, number, numberGhost } = this.lines();
    const hasNumbers = number.length + numberGhost.length > 0;
    const hasVirtual = this.sorted.some((s) => isValid(s) && s.virtual);
    const font = this.fontFamily();
    let numberMin = 0;
    let numberMax = 1;
    if (hasNumbers) {
      const values = this.sorted.filter((s) => s.number !== null).map((s) => s.number!);
      numberMin = Math.min(...values);
      numberMax = Math.max(...values);
      if (numberMax === numberMin) numberMax++;
    }

    const legend = ['دما'];
    if (hasVirtual) legend.push('سنسور مجازی');
    if (hasNumbers) legend.push('عدد پخت');

    const realSeries: any = lineSeries('دما', real, COOKING_COLORS.accent, 2, true);
    realSeries.markLine = { silent: true, symbol: 'none', animation: false, data: this.markLines() };
    realSeries.markArea = { silent: true, animation: false, data: this.markAreas(max) };

    const series: any[] = [
      realSeries,
      lineSeries('سنسور مجازی', virtual, COOKING_COLORS.virtual, 2, false, [5, 3]),
      { ...lineSeries('ghost', ghost, COOKING_COLORS.ghost, 1.5, false), tooltip: { show: false } },
    ];
    if (hasNumbers) {
      series.push({ ...lineSeries('عدد پخت', number, COOKING_COLORS.number, 1.5, false, [5, 3]), yAxisIndex: 1 });
      series.push({
        ...lineSeries('numberGhost', numberGhost, hexAlpha(COOKING_COLORS.number, 0.3), 1.2, false, [5, 3]),
        yAxisIndex: 1,
      });
    }

    return {
      animation: false,
      textStyle: { fontFamily: font },
      grid: { left: 52, right: hasNumbers ? 56 : 20, top: 58, bottom: this.zoomable ? 64 : 40 },
      legend: {
        data: legend,
        top: 4,
        right: 8,
        icon: 'roundRect',
        itemWidth: 16,
        itemHeight: 4,
        textStyle: { color: COOKING_COLORS.muted, fontSize: 11 },
      },
      xAxis: {
        type: 'time',
        min: this.from,
        max: this.to,
        axisLine: { lineStyle: { color: COOKING_COLORS.border } },
        axisTick: { lineStyle: { color: COOKING_COLORS.border } },
        splitLine: { show: true, lineStyle: { color: COOKING_COLORS.grid } },
        axisLabel: {
          color: COOKING_COLORS.muted,
          fontSize: 11,
          hideOverlap: true,
          formatter: (value: number, index: number) => {
            const time = formatTime(value, false).replace('\u200E', '');
            const d = new Date(value);
            return index === 0 || (d.getHours() === 0 && d.getMinutes() === 0)
              ? `${time}\n{day|${formatDay(value).replace('\u200E', '')}}` : time;
          },
          rich: { day: { color: COOKING_COLORS.text, fontWeight: 'bold', fontSize: 11, padding: [4, 0, 0, 0] } },
        } as any,
      },
      yAxis: [
        {
          type: 'value',
          min: 0,
          max,
          interval: step,
          name: '°C',
          nameTextStyle: { color: COOKING_COLORS.muted, align: 'right', padding: [0, 6, 0, 0] },
          axisLabel: { color: COOKING_COLORS.muted, fontSize: 11 },
          splitLine: { lineStyle: { color: COOKING_COLORS.grid } },
        },
        {
          type: 'value',
          min: numberMin,
          max: numberMax,
          show: hasNumbers,
          name: hasNumbers ? 'عدد پخت' : '',
          nameTextStyle: { color: COOKING_COLORS.number, align: 'left' },
          axisLine: { show: hasNumbers, lineStyle: { color: hexAlpha(COOKING_COLORS.number, 0.45) } },
          axisLabel: { color: COOKING_COLORS.number, fontSize: 11 },
          splitLine: { show: false },
        },
      ],
      tooltip: {
        trigger: 'axis',
        confine: true,
        backgroundColor: '#ffffff',
        borderColor: COOKING_COLORS.border,
        padding: [8, 10],
        extraCssText: 'box-shadow:0 6px 18px rgba(15,23,42,.12);border-radius:10px;',
        axisPointer: { type: 'line', lineStyle: { color: COOKING_COLORS.muted, type: 'dashed' } },
        formatter: (params: any) => this.tooltip(params, false),
      },
      dataZoom: this.zoomable
        ? [
          { type: 'inside', xAxisIndex: 0, filterMode: 'none' },
          {
            type: 'slider', xAxisIndex: 0, filterMode: 'none', height: 16, bottom: 8,
            borderColor: COOKING_COLORS.border, fillerColor: hexAlpha(COOKING_COLORS.accent, 0.12),
            dataBackground: { lineStyle: { color: COOKING_COLORS.ghost }, areaStyle: { color: COOKING_COLORS.grid } },
            labelFormatter: (value: number) => formatTime(value, false).replace('\u200E', ''),
          },
        ]
        : [],
      brush: this.selectable ? this.brushOption() : undefined,
      toolbox: { show: false },
      series,
    } as echarts.EChartsOption;
  }

  private brushOption(): any {
    return {
      xAxisIndex: 0,
      brushType: 'lineX',
      brushMode: 'single',
      // Selection is driven by takeGlobalCursor; the default toolbox icons would cover the legend.
      toolbox: [],
      transformable: false,
      throttleType: 'debounce',
      brushStyle: { color: hexAlpha(COOKING_COLORS.accent, 0.15), borderColor: hexAlpha(COOKING_COLORS.accent, 0.7) },
    };
  }

  private markLines(): any[] {
    const lines: any[] = [];
    const threshold = (value: number | null, color: string, label: string) => {
      if (value === null) return;
      lines.push({
        yAxis: value,
        lineStyle: { color, type: [6, 4], width: 1.2, opacity: 0.85 },
        label: pill(`${label} ${value}`, hexAlpha(color, 0.14), color, 'insideEndTop'),
      });
    };
    threshold(this.peak, COOKING_COLORS.peak, this.peakLabel);
    threshold(this.cool, COOKING_COLORS.cool, 'سرمایش');

    const a = this.analysis;
    if (a) {
      const events: Array<[number | null, string, string]> = [
        [a.fireStart, COOKING_COLORS.fire, 'آتش'],
        [a.cycle.cookStart, COOKING_COLORS.install, 'نصب'],
        [a.firstPeakEntry, COOKING_COLORS.peak, 'قله'],
        [a.cycle.cookEnd, COOKING_COLORS.removal, 'برداشتن'],
        [a.coolEnd, COOKING_COLORS.cool, 'سرمایش'],
      ];
      const span = Math.max(1, this.to - this.from);
      let lastAt = -Infinity;
      let row = 0;
      for (const [at, color, name] of events.filter((e) => e[0] !== null).sort((x, y) => x[0]! - y[0]!)) {
        if (at! < this.from || at! > this.to) continue;
        row = (at! - lastAt) / span < 0.07 ? (row + 1) % 3 : 0;
        lastAt = at!;
        lines.push({
          xAxis: at,
          lineStyle: { color, type: [3, 3], width: 1.2, opacity: 0.8 },
          label: { ...pill(name, color, '#ffffff', 'end'), offset: [0, row * 22] },
        });
      }
    }
    if (this.through !== null && this.through >= this.from && this.through <= this.to) {
      lines.push({
        xAxis: this.through,
        lineStyle: { color: COOKING_COLORS.text, type: 'solid', width: 1.5 },
        label: pill(formatTime(this.through).replace('\u200E', ''), COOKING_COLORS.text, '#ffffff', 'start'),
      });
    }
    return lines;
  }

  private markAreas(yMax: number): any[] {
    const areas: any[] = [];
    const a = this.analysis;
    if (a) {
      for (const [from, to] of a.peakIntervals)
        areas.push([{ xAxis: from, itemStyle: { color: hexAlpha(COOKING_COLORS.peak, 0.09) } }, { xAxis: to }]);
      const end = this.through ?? this.to;
      const band = (from: number | null, to: number | null, color: string) => {
        if (from === null || to === null || to <= from) return;
        areas.push([
          { coord: [Math.max(from, this.from), yMax * 0.985], itemStyle: { color: hexAlpha(color, 0.75) } },
          { coord: [Math.min(to, this.to), yMax] },
        ]);
      };
      const cookEnd = a.cycle.cookEnd;
      band(a.fireStart, a.cycle.cookStart, COOKING_COLORS.fire);
      band(a.cycle.cookStart, cookEnd ?? end, COOKING_COLORS.install);
      band(cookEnd, a.coolEnd ?? (cookEnd !== null ? end : null), COOKING_COLORS.cool);
    }
    if (this.highlight) {
      const from = this.highlight.from;
      const to = this.highlight.to ?? from;
      const pad = to - from < (this.to - this.from) / 400 ? (this.to - this.from) / 800 : 0;
      areas.push([
        {
          xAxis: from - pad,
          itemStyle: { color: hexAlpha(COOKING_COLORS.highlight, 0.22), borderColor: COOKING_COLORS.highlight, borderWidth: 1 },
        },
        { xAxis: to + pad },
      ]);
    }
    return areas;
  }

  private tooltip(params: any, compact: boolean): string {
    const list = Array.isArray(params) ? params : [params];
    const axisValue = Number(list[0]?.axisValue ?? list[0]?.value?.[0]);
    const sample = nearest(this.sorted, axisValue);
    if (!sample) return '';
    const temperature = isValid(sample)
      ? celsius(sample.temp!)
      : `<span style="color:${COOKING_COLORS.fire}">${ISSUE_TEXT[sample.issue] ?? 'نامعتبر'}</span>`;
    if (compact)
      return `<div dir="rtl" style="font-size:12px">${formatDateTime(sample.time)}<br/>دما: ${temperature}</div>`;
    const row = (label: string, value: string) =>
      `<tr><td style="color:${COOKING_COLORS.muted};padding:2px 0 2px 14px">${label}</td><td style="font-weight:600">${value}</td></tr>`;
    return `<div dir="rtl" style="font-size:12px;min-width:170px">
      <div style="font-weight:700;margin-bottom:4px;text-align:center">${formatDateTime(sample.time)}</div>
      <table style="width:100%">
        ${row('دما', temperature)}
        ${row('عدد پخت', sample.number !== null ? String(sample.number) : 'ناموجود')}
        ${row('شیر', sample.valve === null ? 'نامشخص' : sample.valve === 0 ? 'بدون شیر' : String(sample.valve))}
        ${row('سنسور', sample.virtual ? `<span style="color:${COOKING_COLORS.virtual}">مجازی</span>` : 'واقعی')}
      </table></div>`;
  }
}

function lineSeries(name: string, data: any[], color: string, width: number, area: boolean, dash?: number[]): any {
  return {
    name,
    type: 'line',
    data,
    showSymbol: false,
    symbolSize: 5,
    connectNulls: false,
    sampling: undefined,
    lineStyle: { color, width, type: dash ?? 'solid' },
    itemStyle: { color },
    emphasis: { disabled: true },
    areaStyle: area
      ? {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: hexAlpha(color, 0.22) },
          { offset: 1, color: hexAlpha(color, 0) },
        ]),
      }
      : undefined,
    z: area ? 3 : 2,
  };
}

function pill(text: string, background: string, color: string, position: string): any {
  return {
    show: true,
    formatter: text,
    position,
    color,
    backgroundColor: background,
    padding: [3, 8],
    borderRadius: 10,
    fontSize: 11,
    fontWeight: 'bold',
  };
}

function niceStep(raw: number): number {
  const magnitude = Math.pow(10, Math.floor(Math.log10(Math.max(1, raw))));
  const normalized = raw / magnitude;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  return nice * magnitude;
}

export function hexAlpha(hex: string, alpha: number): string {
  if (!hex.startsWith('#') || hex.length !== 7) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function nearest(samples: CookingSample[], time: number): CookingSample | null {
  if (samples.length === 0 || !Number.isFinite(time)) return null;
  let low = 0;
  let high = samples.length - 1;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (samples[mid].time < time) low = mid + 1;
    else high = mid;
  }
  const after = samples[low];
  const before = low > 0 ? samples[low - 1] : null;
  return before !== null && Math.abs(before.time - time) <= Math.abs(after.time - time) ? before : after;
}
