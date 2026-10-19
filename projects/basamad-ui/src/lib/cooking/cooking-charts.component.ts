import {
  ChangeDetectionStrategy,
  Component,
  Input,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { BaseComponent, MetaobjectDataModel } from 'barsa-novin-ray-core';
import { CookingApiService } from './cooking-api.service';
import { CookingKiln, errorMessage } from './cooking-data';
import { CookingDetailComponent } from './cooking-detail.component';
import { CookingSelection } from './cooking-selection';

/**
 * Web version of the desktop player's cooking views: node overview with a heat stripe per node,
 * and the per-node temperature chart with cooking analysis. Registered as "CookingCharts".
 * Data comes from the BL methods Main.GetCooking* (CodeMantegh.cs).
 */
@Component({
  selector: 'bu-cooking-charts',
  standalone: false,
  templateUrl: './cooking-charts.component.html',
  styleUrls: ['./cooking-styles.scss', './cooking-charts.component.scss'],
  providers: [CookingApiService],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CookingChartsComponent extends BaseComponent {
  /** Optional: preselect this kiln (its encrypted id, as the platform hands it to the client). */
  @Input() korehId: string | null = null;
  /** Optional form object; when it is one of the listed kilns it is preselected. */
  @Input() mo: MetaobjectDataModel | null = null;

  @ViewChild(CookingDetailComponent) private detail?: CookingDetailComponent;
  private readonly api = inject(CookingApiService);

  readonly tab = signal<'overview' | 'detail'>('overview');
  readonly kilns = signal<CookingKiln[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');

  override ngOnInit(): void {
    super.ngOnInit();
    void this.loadKilns();
  }

  async loadKilns(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const { kilns } = await this.api.kilns();
      const preferred = String(this.korehId ?? (this.mo as any)?.Id ?? '');
      const index = preferred ? kilns.findIndex((k) => k.id === preferred) : -1;
      this.kilns.set(index > 0 ? [kilns[index], ...kilns.filter((_, i) => i !== index)] : kilns);
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  async openDetail(selection: CookingSelection): Promise<void> {
    this.tab.set('detail');
    // The detail view stays mounted (hidden) so its state survives tab switches.
    await this.detail?.open(selection);
  }
}
