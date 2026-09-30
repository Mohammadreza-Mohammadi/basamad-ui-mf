import {
  Component,
  ElementRef,
  OnInit,
  TemplateRef,
  ViewChild,
  WritableSignal,
  signal,
} from '@angular/core';

import { interval, takeUntil } from 'rxjs';

import Panzoom from '@panzoom/panzoom';
import {
  FormPropsBaseComponent,
  FormPanelService,
  ControlUiPipe,
  ScrollLayoutContextHolder,
} from 'barsa-novin-ray-core';


declare const bootstrap: any;
@Component({
  selector: 'bu-monitoring-koreh',
  standalone: false,
  templateUrl: './monitoring-koreh.component.html',
  styleUrls: ['./monitoring-koreh.component.scss'],
  providers: [FormPanelService, ControlUiPipe,ScrollLayoutContextHolder],
})
export class MonitoringKorehComponent
  extends FormPropsBaseComponent
  implements OnInit
{
  @ViewChild('divRef2') divRef!: ElementRef;
  @ViewChild('dialogTemplate', { static: true })
  _dialogTemplate!: TemplateRef<any>;

  panzoom: any;
  FormPanelCtrlr: any;
  oriented = signal(false);
  selectedKoreh = signal('');
  schemaMode = true;
  x: WritableSignal<any> = signal(null);
  ngOnInit(): void {
    super.ngOnInit();
    setTimeout(() => {
      const elem = this._el.nativeElement;
      const option = {
        maxScale: 5,
        minSclae: 1,
        panOnlyWhenZoomed: true,
      };
      const panzoom = Panzoom(elem, option);
      elem.addEventListener('panzoomend', (event: any) => {
        // console.log(event.detail); // => { x: 0, y: 0, scale: 1 }
        if (event.detail && event.detail.scale < 1) {
          panzoom.reset();
        }
      });
      // this._el.nativeElement.addEventListener('pointerup',()=>{panzoom.handleUp;panzoom.pan(0,0)})
      this.panzoom = panzoom;
    }, 1000);
  }  
  onZoom(): void {
    this.panzoom.pan(10, 10);
    
    this.panzoom.zoom(4, { animate: true });
  }

  onReset(): void {
    this.panzoom.reset();
  }
  onCloseModal(): void {}
}
