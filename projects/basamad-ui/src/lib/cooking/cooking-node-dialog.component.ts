import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  Output,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CookingCycle, detectCycles, gapThreshold, thresholdGap } from './cooking-analysis';
import { CookingApiService } from './cooking-api.service';
import { NodeHistory, celsius, errorMessage, formatDateTime, formatShort, formatShortDuration } from './cooking-data';

const DAY = 24 * 3600_000;

/** Modal with one node's temperature over the last few days (opened from the monitoring view). */
@Component({
  selector: 'bu-cooking-node-dialog',
  standalone: false,
  templateUrl: './cooking-node-dialog.component.html',
  styleUrls: ['./cooking-styles.scss', './cooking-node-dialog.component.scss'],
  providers: [CookingApiService],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CookingNodeDialogComponent implements AfterViewInit, OnDestroy {
  /** Encrypted kiln id (the monitoring form's mo.Id). */
  @Input({ required: true }) korehId!: string;
  @Input({ required: true }) node!: number;
  @Input() kilnTitle = '';
  @Input() days = 3;
  @Output() readonly closed = new EventEmitter<void>();

  @ViewChild('dialog', { static: true }) private dialogRef!: ElementRef<HTMLDialogElement>;
  private readonly api = inject(CookingApiService);
  private request = 0;

  readonly loading = signal(true);
  readonly error = signal('');
  readonly history = signal<NodeHistory | null>(null);
  readonly highlight = signal<{ from: number; to: number | null } | null>(null);
  readonly selectedCycle = signal(-1);
  readonly formatDateTime = formatDateTime;
  readonly formatShort = formatShort;
  readonly formatShortDuration = formatShortDuration;
  readonly celsius = celsius;

  readonly samples = computed(() => {
    const h = this.history();
    return h ? h.node.samples.filter((s) => s.time >= h.from && s.time <= h.to) : [];
  });
  readonly gap = computed(() => thresholdGap(gapThreshold(this.samples())));
  readonly cycles = computed<CookingCycle[]>(() => {
    const h = this.history();
    if (!h) return [];
    const all = h.node.samples;
    return detectCycles(all, h.node.node, h.from, h.to, thresholdGap(gapThreshold(all)), h.movements).reverse();
  });

  ngAfterViewInit(): void {
    this.dialogRef.nativeElement.showModal();
    void this.load();
  }

  ngOnDestroy(): void {
    this.request++;
    if (this.dialogRef.nativeElement.open) this.dialogRef.nativeElement.close();
  }

  async load(): Promise<void> {
    const request = ++this.request;
    const to = Date.now();
    const from = to - this.days * DAY;
    this.loading.set(true);
    this.error.set('');
    try {
      const history = await this.api.node(this.korehId, this.node, from, to);
      if (request !== this.request) return;
      this.history.set(history);
    } catch (error) {
      if (request !== this.request) return;
      this.error.set(errorMessage(error));
    } finally {
      if (request === this.request) this.loading.set(false);
    }
  }

  selectCycle(index: number, cycle: CookingCycle): void {
    if (this.selectedCycle() === index) {
      this.selectedCycle.set(-1);
      this.highlight.set(null);
      return;
    }
    this.selectedCycle.set(index);
    this.highlight.set({ from: cycle.cookStart ?? cycle.firstObserved, to: cycle.cookEnd ?? cycle.lastObserved });
  }

  cycleRange(cycle: CookingCycle): string {
    const end = cycle.cookEnd ?? cycle.lastObserved;
    return `${formatShort(cycle.cookStart ?? cycle.firstObserved)} – ${cycle.cookEnd === null ? 'ادامه دارد' : formatShort(end)}`;
  }

  cycleDuration(cycle: CookingCycle): string {
    return cycle.cookStart !== null && cycle.cookEnd !== null ? formatShortDuration(cycle.cookEnd - cycle.cookStart) : '';
  }

  close(): void {
    if (this.dialogRef.nativeElement.open) this.dialogRef.nativeElement.close();
  }
}
