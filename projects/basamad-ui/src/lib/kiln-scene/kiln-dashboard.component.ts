import { Component, DoCheck, Input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

import { KilnSceneComponent } from './kiln-scene.component';
import { KILN_LEGEND, KilnKoreh, mapMonitoringKoreh } from './kiln-scene.model';

/**
 * Smart wrapper: takes the raw server `mo` (MetaobjectDataModel) and renders a
 * header + one `bu-kiln-scene` per rokh.
 *
 * WHY DEFAULT CHANGE DETECTION + ngDoCheck:
 * Higher-level forms (e.g. bsu-barsa-simple-form) mutate `mo` IN PLACE — a
 * transmitter's `Value` changes but the object reference stays the same. With
 * OnPush (or plain @Input reference checks) that update is invisible. So we run
 * a cheap signature over `mo` on every check and re-map only when the data
 * actually changed, handing fresh `nodes`/`chambers` arrays to the (OnPush)
 * scene which then repaints. The scene preserves zoom across such updates.
 */
@Component({
  selector: 'bu-kiln-dashboard',
  standalone: true,
  imports: [CommonModule, KilnSceneComponent],
  templateUrl: './kiln-dashboard.component.html',
  styleUrls: ['./kiln-dashboard.component.scss'],
})
export class KilnDashboardComponent implements DoCheck {
  /** Raw server payload (Transmitters/Ghamirs/StartOfFirstNodePosition/F13). */
  @Input() mo: any;

  readonly legend = KILN_LEGEND;
  readonly koreh = signal<KilnKoreh | null>(null);

  private sig: string | null = null;

  ngDoCheck(): void {
    const s = this.signature(this.mo);
    if (s !== this.sig) {
      this.sig = s;
      this.koreh.set(this.mo ? mapMonitoringKoreh(this.mo) : null);
    }
  }

  /** Cheap change signature — covers every field that affects the drawing. */
  private signature(mo: any): string {
    if (!mo) return '';
    const t: any[] = mo?.Transmitters?.MoDataList ?? [];
    const g: any[] = mo?.Ghamirs?.MoDataList ?? [];
    const parts: string[] = [
      String(mo.StartOfFirstNodePosition ?? ''),
      String(mo.F13 ?? mo.$Caption ?? ''),
      `${t.length}/${g.length}`,
    ];
    for (let i = 0; i < t.length; i++) {
      const x = t[i];
      parts.push(
        x.SlaveAddress + '.' + x.Value + '.' + x.ShirNode + '.' + x.ShirPosition +
        '.' + x.RangShir + '.' + x.HalatShir + '.' + x.AdadPokht + '.' + x.IsMajazi +
        '.' + x.TermokoplFailed + '.' + x.TransmitterFailed + '.' + x.Error +
        '.' + x.RokhNumber,
      );
    }
    parts.push('#');
    for (let i = 0; i < g.length; i++) {
      const x = g[i];
      parts.push(
        x.Number + '.' + x.GhamirStatusText + '.' + (x.Mahsol?.$Caption ?? '') +
        '.' + x.RokhNumber,
      );
    }
    return parts.join('|');
  }
}
