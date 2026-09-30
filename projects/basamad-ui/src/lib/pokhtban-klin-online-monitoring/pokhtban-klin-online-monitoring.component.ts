import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  ViewChild,
  AfterViewInit,
  OnDestroy,
  OnChanges,
} from '@angular/core';
import {
  AbbrevationDeviceSize,
  BaseComponent,
  MetaobjectDataModel,
} from 'barsa-novin-ray-core';
import { Ghamir, Sensor } from '../models';
@Component({
  selector: 'bu-pokhtban-klin-online-monitoring',
  templateUrl: './pokhtban-klin-online-monitoring.component.html',
  styleUrls: ['./pokhtban-klin-online-monitoring.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false,
})
export class PokhtbanKlinOnlineMonitoringComponent
  extends BaseComponent
  implements AfterViewInit, OnChanges, OnDestroy
{
  @ViewChild('containerRef', { static: true }) containerRef!: ElementRef;
  @ViewChild('wrapperRef', { static: false }) wrapperRef!: ElementRef;

  @Input() mobile = false;
  @Input() allColumns: any[] = [];
  @Input() rokhNumber = 1;
  @Input() startOfFirstNodePosition = '1';
  @Input() title = '';
  @Input() deviceSize: AbbrevationDeviceSize = 'xl';
  @Input() ghamirs: MetaobjectDataModel[] = [];
  @Input() transmitters: MetaobjectDataModel[] = [];
  @Output() zoom = new EventEmitter();

  get kilnNumber(): number {
    const match = String(this.title).match(/(\d+)(?!.*\d)/);
    return match ? Number(match[1]) : 1;
  }

  rokh1OnTop(): boolean {
    return this.startOfFirstNodePosition === '1' ||
      this.startOfFirstNodePosition === '2';
  }

  startsFromRight(rokh: number): boolean {
    const rokh1StartsFromRight =
      this.startOfFirstNodePosition === '2' ||
      this.startOfFirstNodePosition === '4';
    return rokh === 1 ? rokh1StartsFromRight : !rokh1StartsFromRight;
  }

  /********** متدهای کمکی **********/
  onShowTransmitter(sensor: Sensor): void {
    // placeholder
  }
  onSabtChideman(ghamir: Ghamir): void {
    // placeholder
  }
  onSabtPokht(ghamir: Ghamir): void {
    // placeholder
  }
}
