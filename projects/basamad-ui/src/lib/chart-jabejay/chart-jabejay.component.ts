import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  DoCheck,
  ElementRef,
  inject,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { PortalService, ReportViewBaseComponent, UiReportViewBaseSetting } from 'barsa-novin-ray-core';
import * as echarts from 'echarts';

type PeriodMode = 0 | 1 | 2;

interface MovementBucket {
  index: number;
  label: string;
  from: string;
  to: string;
  started: boolean;
  complete: boolean;
  actual: number;
  target: number;
}

interface MovementKiln {
  id: string;
  number: number;
  title: string;
  dailyTarget: number;
  buckets: MovementBucket[];
}

interface MovementPeriod {
  factory: string;
  mode: PeriodMode;
  persianYear: number;
  persianMonth: number;
  periodStart: string;
  periodEnd: string;
  isComplete: boolean;
  kilns: MovementKiln[];
}

// تنظیم نمای گزارش برسا: ۰ روزانه، ۱ هفتگی، ۲ ماهانه.
interface ChartJabejaySettings extends UiReportViewBaseSetting {
  PeriodMode?: number | string;
  'نوع نمایش'?: number | string;
  'نوع نمايش'?: number | string;
}

@Component({
  selector: 'bu-chart-jabejay',
  templateUrl: './chart-jabejay.component.html',
  styleUrls: ['./chart-jabejay.component.scss'],
  standalone: false,
})
export class ChartJabejayComponent extends ReportViewBaseComponent<ChartJabejaySettings>
  implements OnChanges, DoCheck, AfterViewInit, OnDestroy {
  @ViewChild('chartsHost') private chartsHost?: ElementRef<HTMLElement>;

  private readonly portal = inject(PortalService);
  private readonly viewRef = inject(ChangeDetectorRef);
  private viewReady = false;
  private destroyed = false;
  private readonly charts: echarts.ECharts[] = [];
  private resizeObserver?: ResizeObserver;
  private requestNumber = 0;
  private reportKilnIds: string[] = [];
  private readonly monthNames = [
    'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
    'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
  ];

  readonly modes: { value: PeriodMode; label: string }[] = [
    { value: 0, label: 'روزانه' },
    { value: 1, label: 'هفتگی' },
    { value: 2, label: 'ماهانه' },
  ];
  mode: PeriodMode = 0;
  private settingMode: PeriodMode | null = null;
  periodsAgo = 0;
  loading = false;
  error = '';
  period: MovementPeriod | null = null;
  visibleKilns: MovementKiln[] = [];

  override ngOnChanges(changes: SimpleChanges): void {
    super.ngOnChanges(changes);
    let reload = false;
    if (changes['viewSetting'] || changes['moDataList']) {
      // تنظیم گزارش فقط مقدار پیش‌فرض است؛ انتخاب کاربر با تغییر داده‌ها بازنویسی نمی‌شود.
      const settingMode = this.readMode();
      if (settingMode !== this.settingMode) {
        this.settingMode = settingMode;
        if (settingMode !== this.mode) {
          this.mode = settingMode;
          this.periodsAgo = 0;
          reload = true;
        }
      }
    }
    if (this.syncKilnIds()) reload = true;
    if (reload) void this.loadPeriod();
  }

  // برسا ممکن است آرایهٔ moDataList را بعد از اولین bind و بدون تغییر مرجع پر کند؛
  // ngOnChanges آن را نمی‌بیند، پس در هر چک شناسه‌ی کوره‌ها دوباره مقایسه می‌شود.
  ngDoCheck(): void {
    if (this.syncKilnIds()) void this.loadPeriod();
  }

  override ngAfterViewInit(): void {
    super.ngAfterViewInit();
    this.viewReady = true;
    if (this.chartsHost && typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.resizeCharts());
      this.resizeObserver.observe(this.chartsHost.nativeElement);
    }
    this.renderCharts();
  }

  // کلاس پایه بعد از اولین اندازه‌گیری، گزارش را visible می‌کند؛ چارت‌هایی که قبل از آن
  // با اندازهٔ صفر ساخته شده‌اند باید دوباره اندازه بگیرند.
  override onVisible(): void {
    super.onVisible();
    this.resizeCharts();
    requestAnimationFrame(() => this.resizeCharts());
  }

  override ngOnDestroy(): void {
    this.destroyed = true;
    this.requestNumber++;
    this.resizeObserver?.disconnect();
    this.clearCharts();
    super.ngOnDestroy();
  }

  previousPeriod(): void {
    if (this.periodsAgo >= this.maxPeriodsAgo || this.loading) return;
    this.periodsAgo++;
    void this.loadPeriod();
  }

  nextPeriod(): void {
    if (this.periodsAgo <= 0 || this.loading) return;
    this.periodsAgo--;
    void this.loadPeriod();
  }

  setMode(mode: PeriodMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.periodsAgo = 0;
    void this.loadPeriod();
  }

  get maxPeriodsAgo(): number { return this.mode === 0 ? 520 : this.mode === 1 ? 240 : 100; }
  get periodName(): string { return this.mode === 0 ? 'هفته' : this.mode === 1 ? 'ماه' : 'سال'; }
  get targetPeriodName(): string { return this.mode === 0 ? 'هفتگی' : this.mode === 1 ? 'ماهانه' : 'سالانه'; }

  get totals(): { actual: number; target: number; ratio: number | null } {
    let actual = 0;
    let target = 0;
    for (const kiln of this.visibleKilns)
      for (const bucket of kiln.buckets) {
        actual += Number(bucket.actual) || 0;
        target += Number(bucket.target) || 0;
      }
    return { actual, target, ratio: target > 0 ? actual / target : null };
  }

  get summaryText(): string {
    if (!this.period) return '';
    if (!this.period.isComplete) return `${this.periodName} در حال اجرا`;
    const ratio = this.totals.ratio;
    if (ratio === null) return 'هدف تعریف نشده است';
    if (ratio >= 0.9) return 'تحقق هدف';
    if (ratio >= 0.7) return 'نزدیک هدف؛ نیاز به بررسی';
    return 'فاصله از هدف؛ نیاز به اقدام';
  }

  get summaryTone(): string {
    if (!this.period || !this.period.isComplete || this.totals.ratio === null) return 'neutral';
    return this.totals.ratio >= 0.9 ? 'good' : this.totals.ratio >= 0.7 ? 'warning' : 'danger';
  }

  get percentageText(): string {
    const ratio = this.totals.ratio;
    return ratio === null ? '' : `${(ratio * 100).toFixed(1).replace(/\.0$/, '')}٪`;
  }

  get periodTitle(): string {
    if (!this.period) return '';
    if (this.mode === 0)
      return `از شنبه ${this.persianDate(this.addDays(this.period.periodStart, 1))} تا جمعه ${this.persianDate(this.period.periodEnd)}`;
    if (this.mode === 1)
      return `جابجایی هفتگی ${this.monthNames[this.period.persianMonth - 1]} ${this.period.persianYear}`;
    return `جابجایی ماهانه سال ${this.period.persianYear}`;
  }

  get boundaryTitle(): string {
    if (!this.period) return '';
    return `بازهٔ محاسبه: ${this.persianDate(this.period.periodStart)} ساعت ۱۷ تا ${this.persianDate(this.period.periodEnd)} ساعت ۱۷`;
  }

  private readMode(): PeriodMode {
    const setting = this.viewSetting;
    const value = Number(setting?.PeriodMode ?? setting?.['نوع نمایش'] ?? setting?.['نوع نمايش'] ?? 0);
    return value === 1 || value === 2 ? value : 0;
  }

  private async loadPeriod(): Promise<void> {
    const request = ++this.requestNumber;
    if (!this.reportKilnIds.length) {
      this.period = null;
      this.visibleKilns = [];
      this.error = '';
      this.loading = false;
      this.clearCharts();
      this.viewRef.markForCheck();
      return;
    }
    this.loading = true;
    this.error = '';
    // این بخش هم‌زمان با چرخهٔ تشخیص تغییر (ngDoCheck/ngOnChanges) اجرا می‌شود؛ detectChanges ممنوع.
    this.viewRef.markForCheck();
    try {
      const raw = await this.portal.RunBlMethodAsync<string>('GetMovementChart',
        [this.reportKilnIds[0], this.mode, this.periodsAgo]);
      if (request !== this.requestNumber) return;
      const result = (typeof raw === 'string' ? JSON.parse(raw) : raw) as MovementPeriod;
      if (!result || +result.mode !== this.mode || !Array.isArray(result.kilns))
        throw new Error('پاسخ نمودار معتبر نیست.');
      const visible = new Set(this.reportKilnIds);
      this.period = result;
      this.visibleKilns = result.kilns.filter((kiln) => visible.has(String(kiln.id)))
        .map((kiln) => ({ ...kiln, buckets: [...kiln.buckets].sort((a, b) => a.index - b.index) }))
        .sort((a, b) => a.number - b.number);
      if (!this.visibleKilns.length) this.error = 'کوره‌های گزارش در پاسخ سرور پیدا نشدند.';
      this.loading = false;
      this.refreshView();
      this.renderCharts();
    } catch (error) {
      if (request !== this.requestNumber) return;
      this.period = null;
      this.visibleKilns = [];
      this.error = error instanceof Error ? error.message : 'دریافت دادهٔ جابجایی ناموفق بود.';
      this.loading = false;
      this.clearCharts();
      this.refreshView();
    } finally {
      if (request === this.requestNumber && this.loading) {
        this.loading = false;
        this.refreshView();
      }
    }
  }

  // کلاس پایه OnPush است و پاسخ سرور بیرون از چرخهٔ تشخیص تغییر می‌رسد؛ بدون این فراخوانی
  // متن «در حال دریافت» و خلاصهٔ هفته در صفحه به‌روز نمی‌شوند.
  private refreshView(): void {
    this.viewRef.markForCheck();
    if (this.viewReady && !this.destroyed) this.viewRef.detectChanges();
  }

  // شناسهٔ کوره‌های گزارش را از moDataList می‌خواند؛ اگر عوض شده باشد true برمی‌گرداند.
  private syncKilnIds(): boolean {
    const rows: any[] = Array.isArray(this.moDataList) ? this.moDataList : [];
    const ids = rows.map((row) => row?.Koreh?.Id ?? row?.Id)
      .filter((id) => id !== null && id !== undefined && String(id).length > 0)
      .map((id) => String(id));
    const nextIds = [...new Set(ids)];
    if (nextIds.join('|') === this.reportKilnIds.join('|')) return false;
    this.reportKilnIds = nextIds;
    return true;
  }

  private renderCharts(): void {
    const host = this.chartsHost?.nativeElement;
    if (!host) return;
    this.clearCharts();
    for (const kiln of this.visibleKilns) {
      const div = document.createElement('div');
      div.className = 'kiln-chart';
      host.appendChild(div);
      const chart = echarts.init(div);
      this.charts.push(chart);
      const buckets = kiln.buckets;
      const flatTarget = buckets.length > 0 && buckets[0].target > 0
        && buckets.every((bucket) => bucket.target === buckets[0].target) ? buckets[0].target : 0;
      chart.setOption({
        textStyle: { fontFamily: 'B-Font' },
        title: { text: kiln.title || `کوره ${kiln.number}`, left: 'center' },
        legend: { data: ['جابجایی', 'هدف'], top: 34 },
        color: ['#2563eb', '#475569'],
        grid: { top: 75, left: 48, right: 28, bottom: 42, containLabel: true },
        tooltip: {
          trigger: 'axis',
          formatter: (params: any) => {
            const points = Array.isArray(params) ? params : [params];
            const bucket = buckets[points[0]?.dataIndex];
            if (!bucket) return '';
            const ratio = !bucket.started ? 'شروع نشده' : bucket.target > 0
              ? `${Math.round(bucket.actual / bucket.target * 100)}٪` : 'بدون هدف';
            return `<div dir="rtl">${bucket.label}<br/>${this.persianDate(bucket.from)} ۱۷:۰۰ تا ${this.persianDate(bucket.to)} ۱۷:۰۰<br/>جابجایی: ${bucket.actual}<br/>هدف: ${bucket.target}<br/>تحقق: ${ratio}</div>`;
          },
        },
        xAxis: { type: 'category', data: buckets.map((bucket) => bucket.label), axisLabel: { interval: 0 } },
        yAxis: { type: 'value', min: 0, minInterval: 1 },
        series: [
          {
            name: 'جابجایی', type: 'bar', barMaxWidth: 34,
            data: buckets.map((bucket) => ({
              value: bucket.actual,
              itemStyle: { color: this.colorFor(bucket) },
            })),
            label: { show: true, position: 'top' },
          },
          {
            // هدف به‌صورت خط افقی خط‌چین؛ اگر هدف همهٔ بازه‌ها برابر باشد (نمای هفتگی) خط
            // سرتاسر نمودار کشیده می‌شود، وگرنه (هفته‌ها/ماه‌ها) پله‌ای از روی هدف هر بازه.
            name: 'هدف', type: 'line', step: flatTarget ? false : 'middle', symbol: 'none',
            data: buckets.map((bucket) => bucket.target),
            lineStyle: { type: 'dashed', width: 2, color: '#475569' },
            itemStyle: { color: '#475569' },
            z: 5,
            markLine: flatTarget ? {
              silent: true, symbol: 'none',
              lineStyle: { type: 'dashed', width: 2, color: '#475569' },
              label: { position: 'insideEndTop', formatter: `هدف: ${flatTarget}` },
              data: [{ yAxis: flatTarget }],
            } : undefined,
          },
        ],
      });
    }
    requestAnimationFrame(() => this.resizeCharts());
  }

  private colorFor(bucket: MovementBucket): string {
    if (!bucket.started || bucket.target <= 0) return '#94a3b8';
    const ratio = bucket.actual / bucket.target;
    return ratio >= 0.9 ? '#2563eb' : ratio >= 0.7 ? '#eab308' : '#dc2626';
  }

  private persianDate(text: string): string {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
    if (!match) return text;
    return new Intl.DateTimeFormat('fa-IR-u-ca-persian',
      { day: 'numeric', month: 'long', year: 'numeric' })
      .format(new Date(+match[1], +match[2] - 1, +match[3], 12));
  }

  private addDays(text: string, days: number): string {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
    if (!match) return text;
    const date = new Date(+match[1], +match[2] - 1, +match[3] + days, 12);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  private resizeCharts(): void {
    this.charts.forEach((chart) => chart.resize());
  }

  private clearCharts(): void {
    this.charts.forEach((chart) => chart.dispose());
    this.charts.length = 0;
    this.chartsHost?.nativeElement.replaceChildren();
  }
}
