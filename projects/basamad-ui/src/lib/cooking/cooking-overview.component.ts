import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CookingCycle, CookingSample, GapTest, ValveMovement, detectCycles, intervalGap } from './cooking-analysis';
import { CookingApiService, MAX_OVERVIEW_DAYS } from './cooking-api.service';
import {
  CookingKiln,
  NodeSeries,
  celsius,
  errorMessage,
  formatDateTime,
  formatShort,
  fromInputDate,
  toInputDate,
} from './cooking-data';
import { CookingSelection } from './cooking-selection';

export type NodeHeat = 'none' | 'cold' | 'was' | 'hot';
const HEAT_ORDER: Record<NodeHeat, number> = { none: 0, cold: 1, was: 2, hot: 3 };

export const HEAT_TEXT: Record<NodeHeat, string> = {
  hot: 'بالای آستانه',
  was: 'در بازه بالای آستانه بوده',
  cold: 'زیر آستانه',
  none: 'بدون داده',
};

interface CycleTile {
  cycle: CookingCycle;
  from: number;
  to: number;
  samples: CookingSample[];
  tags: Array<{ text: string; tone: 'warning' | 'danger' }>;
}

interface NodeCard {
  key: string;
  kiln: CookingKiln;
  series: NodeSeries;
  gapTest: GapTest;
  cycles: CycleTile[];
  from: number;
  to: number;
}

interface KilnSection {
  kiln: CookingKiln;
  expanded: boolean;
  loading: boolean;
  error: string;
  from: number;
  to: number;
  cards: NodeCard[];
}

@Component({
  selector: 'bu-cooking-overview',
  standalone: false,
  templateUrl: './cooking-overview.component.html',
  styleUrls: ['./cooking-styles.scss', './cooking-overview.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CookingOverviewComponent implements OnChanges, OnDestroy {
  @Input() kilns: CookingKiln[] = [];
  @Output() readonly selectionMade = new EventEmitter<CookingSelection>();

  private readonly api = inject(CookingApiService);
  private readonly host = inject(ElementRef<HTMLElement>);
  private request = 0;

  readonly fromInput = signal(toInputDate(Date.now() - 24 * 3600_000));
  readonly toInput = signal(toInputDate(Date.now()));
  readonly threshold = signal(600);
  readonly sort = signal<'node' | 'hot'>('node');
  readonly onlyHot = signal(false);
  readonly factory = signal('');
  readonly loading = signal(false);
  readonly status = signal<{ text: string; tone: 'info' | 'busy' | 'ok' | 'error' }>({
    text: 'بازهٔ زمانی را انتخاب و «نمایش نمودارها» را بزنید.', tone: 'info',
  });
  readonly sections = signal<KilnSection[]>([]);
  readonly flashKey = signal('');

  readonly factories = computed(() => [...new Set(this.kilns.map((k) => k.factory))]);
  readonly heatText = HEAT_TEXT;
  readonly maxDays = MAX_OVERVIEW_DAYS;
  readonly formatDateTime = formatDateTime;
  readonly formatShort = formatShort;
  readonly celsius = celsius;

  readonly summary = computed(() => {
    let total = 0;
    let hot = 0;
    let was = 0;
    for (const section of this.sections())
      for (const card of section.cards) {
        const heat = this.heatOf(card);
        if (heat === 'none') continue;
        total++;
        if (heat === 'hot') hot++;
        else if (heat === 'was') was++;
      }
    return { total, hot, was };
  });

  ngOnChanges(): void {
    if (!this.factories().includes(this.factory())) this.factory.set(this.factories()[0] ?? '');
  }

  ngOnDestroy(): void {
    this.request++;
  }

  // ------------------------------------------------------------------ view helpers

  heatOf(card: NodeCard): NodeHeat {
    const { last, max } = card.series;
    const threshold = this.threshold();
    if (last === null) return 'none';
    if (last >= threshold) return 'hot';
    if (max !== null && max >= threshold) return 'was';
    return 'cold';
  }

  visibleCards(section: KilnSection): NodeCard[] {
    const cards = this.onlyHot()
      ? section.cards.filter((card) => HEAT_ORDER[this.heatOf(card)] >= HEAT_ORDER.was)
      : [...section.cards];
    if (this.sort() === 'hot')
      cards.sort((a, b) => HEAT_ORDER[this.heatOf(b)] - HEAT_ORDER[this.heatOf(a)]
        || (b.series.last ?? -Infinity) - (a.series.last ?? -Infinity) || a.series.node - b.series.node);
    return cards;
  }

  counts(section: KilnSection): Array<{ heat: NodeHeat; count: number }> {
    const result: Array<{ heat: NodeHeat; count: number }> = [];
    for (const heat of ['hot', 'was', 'cold', 'none'] as NodeHeat[]) {
      const count = section.cards.filter((card) => this.heatOf(card) === heat).length;
      if (count > 0) result.push({ heat, count });
    }
    return result;
  }

  cellTitle(card: NodeCard): string {
    const lines = [`نود ${card.series.node} — ${HEAT_TEXT[this.heatOf(card)]}`];
    if (card.series.last !== null) lines.push(`آخرین دما: ${celsius(card.series.last)}`);
    if (card.series.max !== null) lines.push(`بیشینه در بازه: ${celsius(card.series.max)}`);
    lines.push('برای رفتن به نمودار این نود کلیک کنید');
    return lines.join('\n');
  }

  details(card: NodeCard): string {
    const parts: string[] = [];
    if (card.series.max !== null) parts.push(`بیشینه ${celsius(card.series.max)}`);
    if (card.series.last !== null) parts.push(`${card.cycles.length} دورهٔ شیر`);
    if (card.series.lastAt !== null) parts.push(`آخرین قرائت ${formatShort(card.series.lastAt)}`);
    if (card.series.last === null) parts.push('دمای معتبری در این بازه ثبت نشده است');
    return parts.join('   ·   ');
  }

  stateText(card: NodeCard): string {
    const heat = this.heatOf(card);
    return heat === 'hot' || heat === 'cold' ? `${HEAT_TEXT[heat]} · ${celsius(card.series.last!)}` : HEAT_TEXT[heat];
  }

  trackSection = (_: number, section: KilnSection) => section.kiln.id;

  toggle(section: KilnSection): void {
    this.sections.update((all) => all.map((s) => (s === section ? { ...s, expanded: !s.expanded } : s)));
  }

  reveal(section: KilnSection, card: NodeCard): void {
    if (this.onlyHot() && HEAT_ORDER[this.heatOf(card)] < HEAT_ORDER.was) this.onlyHot.set(false);
    if (!section.expanded) this.toggle(section);
    setTimeout(() => {
      const element = this.host.nativeElement.querySelector(`[data-card="${CSS.escape(card.key)}"]`) as HTMLElement | null;
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      this.flashKey.set(card.key);
      setTimeout(() => {
        if (this.flashKey() === card.key) this.flashKey.set('');
      }, 1600);
    });
  }

  open(card: NodeCard, from = card.from, to = card.to): void {
    if (to <= from) return;
    this.selectionMade.emit({ kilnId: card.kiln.id, node: card.series.node, from, to });
  }

  setQuickRange(hours: number): void {
    const now = Date.now();
    this.toInput.set(toInputDate(now));
    this.fromInput.set(toInputDate(now - hours * 3600_000));
  }

  // ------------------------------------------------------------------ loading

  async load(): Promise<void> {
    const from = fromInputDate(this.fromInput());
    const to = fromInputDate(this.toInput());
    if (from === null || to === null || to <= from) {
      this.status.set({ text: 'زمان پایان باید پس از زمان شروع باشد.', tone: 'error' });
      return;
    }
    if (to - from > MAX_OVERVIEW_DAYS * 24 * 3600_000) {
      this.status.set({ text: `بازه حداکثر ${MAX_OVERVIEW_DAYS} روز می‌تواند باشد.`, tone: 'error' });
      return;
    }
    const kilns = this.kilns.filter((k) => !this.factory() || k.factory === this.factory());
    if (kilns.length === 0) {
      this.status.set({ text: 'کوره‌ای برای نمایش وجود ندارد.', tone: 'error' });
      return;
    }
    const request = ++this.request;
    this.loading.set(true);
    this.sections.set(kilns.map((kiln, index) => ({
      kiln, expanded: index === 0, loading: true, error: '', from, to, cards: [],
    })));
    try {
      for (let i = 0; i < kilns.length; i++) {
        const kiln = kilns[i];
        this.status.set({ text: `در حال خواندن کوره ${kiln.number} (${i + 1} از ${kilns.length})…`, tone: 'busy' });
        let update: Partial<KilnSection>;
        try {
          const overview = await this.api.overview(kiln.id, from, to);
          if (request !== this.request) return;
          update = { loading: false, cards: overview.nodes.map((series) => this.card(kiln, series, overview.movements, from, to)) };
        } catch (error) {
          if (request !== this.request) return;
          update = { loading: false, error: errorMessage(error) };
        }
        this.sections.update((all) => all.map((s) => (s.kiln.id === kiln.id ? { ...s, ...update } : s)));
      }
      const { total, hot, was } = this.summary();
      const failed = this.sections().filter((s) => s.error).length;
      this.status.set({
        text: `${total} نود دارای داده؛ ${hot} نود اکنون بالای ${celsius(this.threshold())}، ${was} نود در بازه بالای آستانه بوده.`
          + (failed ? ` خواندن ${failed} کوره ناموفق بود.` : '  برای تحلیل، روی نمودار هر نود بکشید یا روی یک دوره کلیک کنید.'),
        tone: failed ? 'error' : 'ok',
      });
    } finally {
      if (request === this.request) this.loading.set(false);
    }
  }

  private card(kiln: CookingKiln, series: NodeSeries, movements: ValveMovement[], from: number, to: number): NodeCard {
    const gapTest = intervalGap(series.gaps);
    const hasData = series.last !== null;
    const cycles = hasData ? detectCycles(series.samples, series.node, from, to, gapTest, movements) : [];
    return {
      key: `${kiln.id}-${series.node}`,
      kiln,
      series,
      gapTest,
      from,
      to,
      cycles: cycles.map((cycle) => {
        const start = Math.max(from, cycle.cookStart ?? cycle.firstObserved);
        const end = Math.min(to, cycle.cookEnd ?? cycle.lastObserved);
        const tags: CycleTile['tags'] = [];
        if (cycle.incompleteAtStart || cycle.incompleteAtEnd) tags.push({ text: 'ناقص', tone: 'warning' });
        if (cycle.hasDataGap) tags.push({ text: 'گپ', tone: 'danger' });
        return {
          cycle, from: start, to: end, tags,
          samples: series.samples.filter((s) => s.time >= start && s.time <= end),
        };
      }),
    };
  }
}
