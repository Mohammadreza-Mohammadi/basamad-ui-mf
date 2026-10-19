import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  CookingAnalysis,
  CookingCycle,
  CookingSample,
  ManualEvents,
  analyzeCycle,
  detectCycles,
  gapThreshold,
  isValid,
  thresholdGap,
} from './cooking-analysis';
import { CookingApiService, MAX_NODE_DAYS } from './cooking-api.service';
import {
  CookingKiln,
  NodeHistory,
  PENDING,
  celsius,
  errorMessage,
  formatDateTime,
  formatDuration,
  formatShort,
  formatShortDuration,
  formatTime,
  fromInputDate,
  toInputDate,
} from './cooking-data';
import { COOKING_COLORS } from './cooking-chart.component';
import { CookingSelection } from './cooking-selection';

type Tone = 'normal' | 'muted' | 'accent' | 'good' | 'warning' | 'danger';

interface Badge { text: string; tone: Tone; }
interface Kpi { title: string; value: string; caption: string; color: string; }
interface Row {
  key: string;
  label: string;
  value: string;
  marker?: string;
  from?: number | null;
  to?: number | null;
  tone: Tone;
  badge?: string;
}
interface Section { title: string; rows: Row[]; }
interface EditState {
  fire: string;
  start: string;
  end: string;
  useFire: boolean;
  useStart: boolean;
  useEnd: boolean;
}
interface AnalysisView {
  title: string;
  subtitle: string;
  badges: Badge[];
  kpis: Kpi[];
  sections: Section[];
}

const SPEEDS = [1, 2, 5, 10, 20];
const NO_MANUAL: ManualEvents = { fire: null, start: null, end: null };

@Component({
  selector: 'bu-cooking-detail',
  standalone: false,
  templateUrl: './cooking-detail.component.html',
  styleUrls: ['./cooking-styles.scss', './cooking-detail.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CookingDetailComponent implements OnChanges, OnDestroy {
  @Input() kilns: CookingKiln[] = [];

  @ViewChild('editDialog') private editDialog?: ElementRef<HTMLDialogElement>;
  private readonly api = inject(CookingApiService);
  private request = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  readonly speeds = SPEEDS;
  readonly maxDays = MAX_NODE_DAYS;
  readonly formatDateTime = formatDateTime;
  readonly formatShortDuration = formatShortDuration;

  // query
  readonly kilnId = signal<string | null>(null);
  readonly node = signal(1);
  readonly fromInput = signal(toInputDate(Date.now() - 24 * 3600_000));
  readonly toInput = signal(toInputDate(Date.now()));
  readonly peak = signal(900);
  readonly cool = signal(600);
  readonly fireWindow = signal(10);
  readonly fireRise = signal(10);
  readonly fireSamples = signal(3);
  readonly showAdvanced = signal(false);

  // data
  readonly loading = signal(false);
  readonly expanding = signal(false);
  readonly history = signal<NodeHistory | null>(null);
  readonly status = signal<{ text: string; tone: 'info' | 'busy' | 'ok' | 'error' }>({
    text: 'کوره، نود و بازهٔ زمانی را انتخاب کنید.', tone: 'info',
  });
  readonly cycleIndex = signal(-1);
  readonly manual = signal(new Map<number, ManualEvents>());

  // playback
  readonly showFull = signal(true);
  readonly index = signal(0);
  readonly playing = signal(false);
  readonly speed = signal(1);

  // selection on the chart
  readonly highlight = signal<{ from: number; to: number | null } | null>(null);
  readonly selectedRow = signal('');

  // edit dialog
  readonly editing = signal<EditState | null>(null);
  readonly editError = signal('');

  readonly samples = computed<CookingSample[]>(() =>
    [...(this.history()?.node.samples ?? [])].sort((a, b) => a.time - b.time));

  readonly visible = computed(() => {
    const h = this.history();
    return h ? this.samples().filter((s) => s.time >= h.from && s.time <= h.to) : [];
  });

  readonly cycles = computed<CookingCycle[]>(() => {
    const h = this.history();
    if (!h) return [];
    const samples = this.samples();
    return detectCycles(samples, h.node.node, h.from, h.to, thresholdGap(gapThreshold(samples)), h.movements);
  });

  readonly chartGap = computed(() => thresholdGap(gapThreshold(this.visible())));

  readonly through = computed<number | null>(() => {
    const visible = this.visible();
    if (this.showFull() || visible.length === 0) return null;
    return visible[Math.min(this.index(), visible.length - 1)].time;
  });

  readonly thresholdsValid = computed(() => {
    const peak = this.peak();
    const cool = this.cool();
    return Number.isFinite(peak) && Number.isFinite(cool) && peak > cool && cool >= 0 && peak < 65535;
  });

  readonly analysis = computed<CookingAnalysis | null>(() => {
    const h = this.history();
    const cycle = this.cycles()[this.cycleIndex()];
    if (!h || !cycle || !this.thresholdsValid()) return null;
    const manual = this.manual().get(cycle.firstObserved) ?? NO_MANUAL;
    return analyzeCycle(this.samples(), cycle, {
      peak: this.peak(),
      cool: this.cool(),
      fireWindow: Math.max(1, this.fireWindow()) * 60_000,
      fireRise: Math.max(1, this.fireRise()),
      fireSamples: Math.max(3, this.fireSamples()),
    }, h.from, h.to, this.through(), manual);
  });

  readonly view = computed<AnalysisView | null>(() => {
    const analysis = this.analysis();
    if (!analysis) return null;
    const cycle = this.cycles()[this.cycleIndex()];
    return this.buildView(analysis, this.manual().get(cycle.firstObserved) ?? NO_MANUAL);
  });

  readonly emptyText = computed(() => {
    if (!this.history()) return 'کوره، نود و بازهٔ زمانی را انتخاب و «بارگذاری» را بزنید تا تحلیل دورهٔ پخت اینجا نمایش داده شود.';
    if (this.visible().length === 0) return 'در این بازه نمونه‌ای برای این نود ثبت نشده است.';
    if (!this.thresholdsValid()) return 'برای دیدن تحلیل، «آستانهٔ قله» را بیشتر از «آستانهٔ سرمایش» وارد کنید.';
    if (this.cycles().length === 0) return 'در این بازه دورهٔ شیری تشخیص داده نشد. بازهٔ زمانی را بزرگ‌تر کنید.';
    return '';
  });

  readonly cycleRows = computed(() => this.cycles().map((cycle) => ({
    cycle,
    badges: cycleBadges(cycle),
    start: cycle.cookStart !== null ? formatDateTime(cycle.cookStart) : 'نامشخص',
    end: cycle.cookEnd !== null ? formatDateTime(cycle.cookEnd) : 'نامشخص',
    startTip: cycle.startFromMovement ? 'زمان ثبت‌شده در جابجایی‌ها'
      : cycle.startBoundaryPrevious !== null
        ? `زمان نصب بین ${formatTime(cycle.startBoundaryPrevious)} و ${formatTime(cycle.firstObserved)}`
        : 'ابتدای دوره در دادهٔ موجود مشخص نیست',
    endTip: cycle.endFromMovement ? 'زمان ثبت‌شده در جابجایی‌ها'
      : cycle.endBoundaryPrevious !== null && cycle.cookEnd !== null
        ? `زمان برداشتن بین ${formatTime(cycle.endBoundaryPrevious)} و ${formatTime(cycle.cookEnd)}`
        : 'پایان دوره در دادهٔ موجود مشخص نیست',
    duration: formatShortDuration(cycle.cookStart !== null && cycle.cookEnd !== null ? cycle.cookEnd - cycle.cookStart : null),
  })));

  readonly subtitle = computed(() => {
    const h = this.history();
    if (!h) return 'هنوز داده‌ای بارگذاری نشده است';
    return `کوره ${h.kiln.number}  ·  نود ${h.node.node}  ·  ${formatDateTime(h.from, false)} تا ${formatDateTime(h.to, false)}`;
  });

  readonly cursorText = computed(() => {
    const h = this.history();
    if (!h) return '';
    return formatDateTime(this.through() ?? h.to);
  });

  ngOnChanges(): void {
    if (this.kilnId() === null && this.kilns.length > 0) this.kilnId.set(this.kilns[0].id);
  }

  ngOnDestroy(): void {
    this.request++;
    this.stop();
  }

  kilnLabel(kiln: CookingKiln): string {
    const factories = new Set(this.kilns.map((k) => k.factory));
    return factories.size > 1 && kiln.factory ? `${kiln.factory} — کوره ${kiln.number}` : `کوره ${kiln.number}`;
  }

  cycleLabel(cycle: CookingCycle): string {
    return `شیر ${cycle.valve} — ${formatShort(cycle.firstObserved)}`;
  }

  setQuickRange(hours: number): void {
    const now = Date.now();
    this.toInput.set(toInputDate(now));
    this.fromInput.set(toInputDate(now - hours * 3600_000));
  }

  /** Called by the container when a node/range is picked in the overview. */
  async open(selection: CookingSelection): Promise<void> {
    this.kilnId.set(selection.kilnId);
    this.node.set(selection.node);
    this.fromInput.set(toInputDate(selection.from));
    this.toInput.set(toInputDate(Math.max(selection.to, selection.from + 60_000)));
    await this.load(selection.from, selection.to);
  }

  async load(fromOverride?: number, toOverride?: number): Promise<void> {
    const kilnId = this.kilnId();
    const from = fromOverride ?? fromInputDate(this.fromInput());
    const to = toOverride ?? fromInputDate(this.toInput());
    if (kilnId === null) {
      this.status.set({ text: 'کوره‌ای انتخاب نشده است.', tone: 'error' });
      return;
    }
    if (from === null || to === null || to <= from) {
      this.status.set({ text: 'زمان پایان باید پس از زمان شروع باشد.', tone: 'error' });
      return;
    }
    if (to - from > MAX_NODE_DAYS * 24 * 3600_000) {
      this.status.set({ text: `بازه حداکثر ${MAX_NODE_DAYS} روز می‌تواند باشد.`, tone: 'error' });
      return;
    }
    const request = ++this.request;
    this.stop();
    this.loading.set(true);
    this.status.set({ text: 'در حال خواندن تاریخچه…', tone: 'busy' });
    try {
      const history = await this.api.node(kilnId, this.node(), from, to);
      if (request !== this.request) return;
      this.history.set(history);
      this.manual.set(new Map());
      this.highlight.set(null);
      this.selectedRow.set('');
      this.index.set(0);
      this.showFull.set(true);
      this.cycleIndex.set(this.cycles().length > 0 ? 0 : -1);
      const count = this.visible().length;
      this.status.set({
        text: `${count.toLocaleString('en-US')} نمونه، ${this.cycles().length} دورهٔ شیر`
          + (history.unreadable > 0 ? `؛ ${history.unreadable} اسنپ‌شات خوانده‌نشده` : ''),
        tone: history.unreadable > 0 ? 'error' : 'ok',
      });
    } catch (error) {
      if (request !== this.request) return;
      this.status.set({ text: `خواندن تاریخچه ناموفق بود: ${errorMessage(error)}`, tone: 'error' });
    } finally {
      if (request === this.request) this.loading.set(false);
    }
  }

  selectCycle(index: number): void {
    this.cycleIndex.set(index);
    this.highlight.set(null);
    this.selectedRow.set('');
  }

  selectRow(row: Row): void {
    if (row.from === undefined || row.from === null) return;
    if (this.selectedRow() === row.key) {
      this.selectedRow.set('');
      this.highlight.set(null);
      return;
    }
    this.selectedRow.set(row.key);
    this.highlight.set({ from: row.from, to: row.to ?? null });
  }

  // ------------------------------------------------------------------ playback

  togglePlay(): void {
    if (this.playing()) {
      this.stop();
      return;
    }
    const count = this.visible().length;
    if (count === 0) return;
    if (this.showFull() || this.index() >= count - 1) {
      this.showFull.set(false);
      this.index.set(0);
    }
    this.playing.set(true);
    this.restartTimer();
  }

  step(delta: number): void {
    this.stop();
    this.showFull.set(false);
    this.setIndex(this.index() + delta);
  }

  scrub(value: number): void {
    this.stop();
    this.showFull.set(false);
    this.setIndex(value);
  }

  setSpeed(value: number): void {
    this.speed.set(value);
    if (this.playing()) this.restartTimer();
  }

  setShowFull(value: boolean): void {
    if (value) this.stop();
    this.showFull.set(value);
  }

  private setIndex(value: number): void {
    const count = this.visible().length;
    if (count === 0) return;
    this.index.set(Math.max(0, Math.min(count - 1, value)));
  }

  private restartTimer(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = setInterval(() => {
      const count = this.visible().length;
      if (this.index() + 1 >= count) {
        this.stop();
        return;
      }
      this.index.set(this.index() + 1);
      if (this.index() >= count - 1) this.stop();
    }, Math.max(50, 1000 / this.speed()));
  }

  private stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.playing.set(false);
  }

  // ------------------------------------------------------------------ manual events / expansion

  openEditor(): void {
    const cycle = this.cycles()[this.cycleIndex()];
    if (!cycle) return;
    const current = this.manual().get(cycle.firstObserved) ?? NO_MANUAL;
    this.editError.set('');
    this.editing.set({
      fire: toInputDate(current.fire ?? cycle.firstObserved - 10 * 60_000),
      start: toInputDate(current.start ?? cycle.cookStart ?? cycle.firstObserved),
      end: toInputDate(current.end ?? cycle.cookEnd ?? cycle.lastObserved),
      useFire: current.fire !== null,
      useStart: current.start !== null,
      useEnd: current.end !== null,
    });
    setTimeout(() => this.editDialog?.nativeElement.showModal());
  }

  updateEditor(patch: Partial<EditState>): void {
    const current = this.editing();
    if (current) this.editing.set({ ...current, ...patch });
  }

  closeEditor(): void {
    this.editDialog?.nativeElement.close();
    this.editing.set(null);
  }

  applyEditor(): void {
    const value = this.editing();
    const cycle = this.cycles()[this.cycleIndex()];
    if (!value || !cycle) return;
    const fire = value.useFire ? fromInputDate(value.fire) : null;
    const start = value.useStart ? fromInputDate(value.start) : null;
    const end = value.useEnd ? fromInputDate(value.end) : null;
    const effectiveStart = start ?? cycle.cookStart ?? cycle.firstObserved;
    const effectiveEnd = end ?? cycle.cookEnd ?? cycle.lastObserved;
    if ((value.useFire && fire === null) || (value.useStart && start === null) || (value.useEnd && end === null)
      || effectiveEnd <= effectiveStart || (fire !== null && fire > effectiveStart)) {
      this.editError.set('ترتیب زمانی رویدادها معتبر نیست.');
      return;
    }
    const next = new Map(this.manual());
    if (fire === null && start === null && end === null) next.delete(cycle.firstObserved);
    else next.set(cycle.firstObserved, { fire, start, end });
    this.manual.set(next);
    this.closeEditor();
  }

  async expandCycle(): Promise<void> {
    const h = this.history();
    const cycle = this.cycles()[this.cycleIndex()];
    if (!h || !cycle) return;
    this.expanding.set(true);
    this.stop();
    try {
      const window = await this.api.cycleWindow(h.kiln.id, h.node.node, cycle.valve,
        cycle.firstObserved, cycle.lastObserved, h.from, h.to);
      if (window.from === h.from && window.to === h.to) {
        this.status.set({ text: 'دادهٔ بیشتری برای این دوره در دیتابیس پیدا نشد.', tone: 'info' });
        return;
      }
      this.fromInput.set(toInputDate(window.from));
      this.toInput.set(toInputDate(window.to));
      await this.load(window.from, window.to);
    } catch (error) {
      this.status.set({ text: `گسترش دوره ناموفق بود: ${errorMessage(error)}`, tone: 'error' });
    } finally {
      this.expanding.set(false);
    }
  }

  // ------------------------------------------------------------------ analysis view model

  private buildView(result: CookingAnalysis, manual: ManualEvents): AnalysisView {
    const cycle = result.cycle;
    const through = this.through();
    const badges = cycleBadges(cycle);
    if (through !== null) badges.push({ text: `تحلیل تا ${formatTime(through)}`, tone: 'accent' });
    if (manual.fire !== null || manual.start !== null || manual.end !== null)
      badges.push({ text: 'اصلاح دستی', tone: 'accent' });

    const partial = cycle.incompleteAtStart || cycle.incompleteAtEnd;
    const hasPeak = result.peakIntervals.length > 0;
    const kpis: Kpi[] = [
      {
        title: 'مدت پخت', value: formatShortDuration(result.cookDuration), color: COOKING_COLORS.install,
        caption: result.cookDuration !== null ? 'نصب تا برداشتن شیر' : partial ? 'دورهٔ ناقص' : 'در انتظار',
      },
      {
        title: partial ? 'مدت قلهٔ قابل مشاهده' : 'مدت قله',
        value: hasPeak ? formatShortDuration(result.peakDuration) : '—', color: COOKING_COLORS.peak,
        caption: !hasPeak ? 'نرسیده به آستانه'
          : result.peakPercent !== null ? `${result.peakPercent.toFixed(1)}% از مدت پخت`
            : `${result.peakIntervals.length} بار حضور`,
      },
      {
        title: 'بیشینهٔ دما', value: result.maximum ? celsius(result.maximum.temp) : '—', color: COOKING_COLORS.fire,
        caption: result.maximum ? `در ${formatShort(result.maximum.at)}` : 'نامشخص',
      },
      {
        title: 'گرم‌شدن پیش از پخت', value: formatShortDuration(result.preheat), color: COOKING_COLORS.accent,
        caption: result.preheat !== null ? 'شروع آتش تا نصب شیر' : 'شروع آتش نامشخص',
      },
    ];

    const sections: Section[] = [];
    let n = 0;
    const row = (section: string, label: string, value: string, extra: Partial<Row> = {}): Row => ({
      key: `${section}|${label}|${n++}`,
      label,
      value,
      tone: value === PENDING || value === 'نامشخص' ? 'muted' : 'normal',
      ...extra,
    });

    const when = (value: number | null) => (value === null ? PENDING : formatDateTime(value));
    sections.push({
      title: 'رویدادها',
      rows: [
        row('e', 'شروع آتش', when(result.fireStart), {
          marker: COOKING_COLORS.fire, from: result.fireStart,
          badge: manual.fire !== null ? 'دستی' : result.fireStart !== null ? 'تخمینی' : undefined,
        }),
        row('e', 'نصب شیر', when(cycle.cookStart), {
          marker: COOKING_COLORS.install, from: cycle.cookStart, badge: manual.start !== null ? 'دستی' : undefined,
        }),
        row('e', 'ورود به قله', when(result.firstPeakEntry), { marker: COOKING_COLORS.peak, from: result.firstPeakEntry }),
        row('e', 'برداشتن شیر', when(cycle.cookEnd), {
          marker: COOKING_COLORS.removal, from: cycle.cookEnd, badge: manual.end !== null ? 'دستی' : undefined,
        }),
        row('e', 'پایان سرمایش', when(result.coolEnd), { marker: COOKING_COLORS.cool, from: result.coolEnd }),
      ],
    });

    const visible = this.visible();
    const cooling = result.coolingDuration !== null
      ? formatDuration(result.coolingDuration)
      : cycle.cookEnd !== null && visible.length > 0
        ? `نرسیده؛ ${formatDuration(visible[visible.length - 1].time - cycle.cookEnd)} مشاهده شد`
        : PENDING;
    const between = (a: number | null, b: number | null) => (a !== null && b !== null ? formatDuration(b - a) : PENDING);
    sections.push({
      title: 'مدت‌ها',
      rows: [
        row('d', 'گرم‌شدن پیش از پخت', formatDuration(result.preheat), { from: result.fireStart, to: cycle.cookStart }),
        row('d', 'مدت پخت', formatDuration(result.cookDuration), { from: cycle.cookStart, to: cycle.cookEnd }),
        row('d', 'آتش تا برداشتن شیر', formatDuration(result.fireToRemoval), { from: result.fireStart, to: cycle.cookEnd }),
        row('d', 'آتش تا قله', between(result.fireStart, result.firstPeakEntry), { from: result.fireStart, to: result.firstPeakEntry }),
        row('d', 'نصب شیر تا قله', between(cycle.cookStart, result.firstPeakEntry), { from: cycle.cookStart, to: result.firstPeakEntry }),
        row('d', 'سرمایش پس از برداشتن', cooling, {
          from: cycle.cookEnd, to: result.coolEnd,
          tone: result.coolingDuration !== null ? 'normal' : cycle.cookEnd !== null ? 'warning' : 'muted',
        }),
      ],
    });

    sections.push({
      title: 'قله',
      rows: [
        row('p', partial ? 'مدت قلهٔ قابل مشاهده (برآوردی)' : 'مدت قله (برآوردی)', formatDuration(result.peakDuration), {
          marker: COOKING_COLORS.peak,
          from: hasPeak ? result.peakIntervals[0][0] : null,
          to: hasPeak ? result.peakIntervals[result.peakIntervals.length - 1][1] : null,
        }),
        row('p', 'تعداد حضور در قله', String(result.peakIntervals.length), { tone: hasPeak ? 'normal' : 'warning' }),
        row('p', 'طولانی‌ترین حضور', formatDuration(result.longestPeak)),
        row('p', 'درصد مدت قله', result.peakPercent !== null ? `${result.peakPercent.toFixed(1)}%` : 'نامشخص'),
        row('p', 'بیشترین دما', result.maximum ? `${celsius(result.maximum.temp)}  ·  ${formatTime(result.maximum.at)}` : 'نامشخص', {
          marker: COOKING_COLORS.fire, from: result.maximum?.at ?? null,
        }),
      ],
    });

    const numberSection = (title: string, stats: CookingAnalysis['wholeNumbers'], missing: string): Section => ({
      title,
      rows: stats === null
        ? [row(title, 'وضعیت', missing, { tone: 'muted' })]
        : [
          row(title, 'کمینه', `${stats.minimum}  ·  ${formatTime(stats.minimumAt)}`, { marker: COOKING_COLORS.number, from: stats.minimumAt }),
          row(title, 'بیشینه', `${stats.maximum}  ·  ${formatTime(stats.maximumAt)}`, { marker: COOKING_COLORS.number, from: stats.maximumAt }),
          row(title, 'میانگین زمان‌وزن‌دار', stats.timeWeightedMean !== null ? stats.timeWeightedMean.toFixed(1) : 'نامشخص'),
        ],
    });
    sections.push(numberSection('عدد پخت — کل دوره', result.wholeNumbers, 'دادهٔ کافی نیست'));
    sections.push(numberSection('عدد پخت — بازهٔ قله', hasPeak ? result.peakNumbers : null,
      hasPeak ? 'دادهٔ کافی نیست' : 'نرسیده به آستانه'));

    const eventInfo: Record<string, [string, string]> = {
      fireStart: ['شروع آتش', COOKING_COLORS.fire],
      cookStart: ['نصب شیر', COOKING_COLORS.install],
      peakEntry: ['ورود به قله', COOKING_COLORS.peak],
      cookEnd: ['برداشتن شیر', COOKING_COLORS.removal],
    };
    const eventRows: Row[] = [];
    for (const key of ['fireStart', 'cookStart', 'peakEntry', 'cookEnd'] as const) {
      const value = result.eventNumbers[key];
      eventRows.push(row('n', `در ${eventInfo[key][0]}`, value ? `${value.value}  ·  ${formatTime(value.at)}` : 'نامشخص', {
        marker: eventInfo[key][1], from: value?.at ?? null,
      }));
    }
    const fireNumber = result.eventNumbers.fireStart;
    if (fireNumber) {
      for (const key of ['cookStart', 'peakEntry', 'cookEnd'] as const) {
        const atEvent = result.eventNumbers[key];
        const delta = atEvent ? atEvent.value - fireNumber.value : null;
        eventRows.push(row('n', `تغییر از آتش تا ${eventInfo[key][0]}`,
          result.numberReset ? 'نیازمند بررسی (کاهش/ریست)'
            : delta === null ? 'نامشخص' : delta > 0 ? `+${delta}` : String(delta),
          result.numberReset ? { tone: 'warning' } : {}));
      }
    }
    eventRows.push(row('n', 'بازنشانی/افت عدد پخت', result.numberReset ? 'نیازمند بررسی' : 'مشاهده نشد', {
      tone: result.numberReset ? 'danger' : 'good',
    }));
    sections.push({ title: 'عدد پخت در رویدادها', rows: eventRows });

    const h = this.history()!;
    const coverageStart = cycle.cookStart !== null && cycle.cookStart > h.from ? cycle.cookStart : h.from;
    const playbackEnd = through ?? h.to;
    const coverageEnd = cycle.cookEnd !== null && cycle.cookEnd < playbackEnd ? cycle.cookEnd : playbackEnd;
    const coverage = coverageEnd > coverageStart ? (100 * result.temperatureCoverage) / (coverageEnd - coverageStart) : null;
    let real = 0;
    let virtual = 0;
    for (const s of visible) {
      if (s.time > playbackEnd || !isValid(s)) continue;
      if (s.virtual) virtual++;
      else real++;
    }
    sections.push({
      title: 'کیفیت داده',
      rows: [
        row('q', 'پوشش دمای معتبر', formatDuration(result.temperatureCoverage)),
        row('q', 'درصد پوشش دمای معتبر', coverage !== null ? `${coverage.toFixed(1)}%` : 'نامشخص', {
          tone: coverage === null ? 'muted' : coverage < 80 ? 'danger' : coverage < 95 ? 'warning' : 'good',
        }),
        row('q', 'تعداد نمونهٔ معتبر / کل', `${result.validCount} / ${result.sampleCount}`),
        row('q', 'نوع سنسور', `واقعی ${real}  ·  مجازی ${virtual}`, { marker: virtual > 0 ? COOKING_COLORS.virtual : undefined }),
      ],
    });

    return {
      title: `شیر ${cycle.valve}`,
      subtitle: `حضور مشاهده‌شده: ${formatDateTime(cycle.firstObserved, false)} تا ${formatDateTime(cycle.lastObserved, false)}`,
      badges,
      kpis,
      sections,
    };
  }
}

function cycleBadges(cycle: CookingCycle): Badge[] {
  const badges: Badge[] = [];
  if (cycle.incompleteAtStart) badges.push({ text: 'ناقص در ابتدا', tone: 'warning' });
  if (cycle.incompleteAtEnd) badges.push({ text: 'ناقص در انتها', tone: 'warning' });
  if (cycle.hasDataGap) badges.push({ text: 'گپ داده', tone: 'danger' });
  if (cycle.replacedByAnotherValve) badges.push({ text: 'تعویض شیر', tone: 'accent' });
  if (badges.length === 0) badges.push({ text: 'کامل', tone: 'good' });
  return badges;
}
