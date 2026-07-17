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

  @Input() mobile!: boolean;
  @Input() allColumns!: any[];
  @Input() rokhNumber!: number;
  @Input() startOfFirstNodePosition: string;
  @Input() title!: string;
  @Input() deviceSize!: AbbrevationDeviceSize;
  @Input() ghamirs!: MetaobjectDataModel[];
  @Input() transmitters!: MetaobjectDataModel[];
  @Output() zoom = new EventEmitter();

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
