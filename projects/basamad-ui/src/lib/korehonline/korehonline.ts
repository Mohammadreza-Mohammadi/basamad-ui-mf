import { Component, inject, signal, WritableSignal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { BaseComponent, PortalService } from 'barsa-novin-ray-core';

@Component({
  selector: 'bu-korehonline',
  standalone: false,
  templateUrl: './korehonline.html',
  styleUrl: './korehonline.scss',
})
export class Korehonline extends BaseComponent {
  private _activatedRoute = inject(ActivatedRoute);
  private _portalService = inject(PortalService);
  korehFormInfo: WritableSignal<Record<string, any> | null> = signal(null);
  ngOnInit(): void {
    const id = this._activatedRoute.snapshot.params['id'];
    this._portalService
      .RunBlMethodAsync('GetKorehSubformInfo', [id])
      .then((c) => {
        this.korehFormInfo.set(c);
      });
  }
}
