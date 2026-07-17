import {
  Component,
  ElementRef,
  EventEmitter,
  inject,
  Input,
  Output,
  SimpleChanges,
} from '@angular/core';
import {
  AbbrevationDeviceSize,
  BarsaApi,
  BaseComponent,
  MetaobjectDataModel,
  MoForReportModel,
  MoReportValuePipe,
  PortalService,
  ReportViewColumn,
} from 'barsa-novin-ray-core';
import { MapMoListToGhamirs } from '../constants';
import { Ghamir, Sensor } from '../models';
import { Observable } from 'rxjs';
import { BasamadService } from '../basamad-service';

@Component({
  selector: 'bu-monitoring-koreh-item',
  templateUrl: './monitoring-koreh-item.component.html',
  styleUrls: ['./monitoring-koreh-item.component.scss'],
  standalone: false,
})
export class MonitoringKorehItemComponent extends BaseComponent {
  @Input() moList: MetaobjectDataModel[];
  @Input() mobile: boolean;
  @Input() allColumns: ReportViewColumn[];
  @Input() rokhNumber: number;
  @Input() title: string;
  @Input() deviceSize: AbbrevationDeviceSize;
  @Input() ghamirPictures: Record<string, MetaobjectDataModel> | null;
  @Input() ghamirHistory: Ghamir[] | null;
  @Input() newAxGhamirMo: MetaobjectDataModel | null;

  @Output() pictureUpdated = new EventEmitter<MetaobjectDataModel>();

  ghamirs: Ghamir[] = [];
  rokhTitle = '';
  groupByDateAlias = [
    {
      Name: 'dateAlias',
      SortDirection: 'ASC',
      IsGrouped: true,
    },
  ];
  /**
   *
   */
  marginRight: number = 0;

  private _reportVal = inject(MoReportValuePipe);

  ngOnInit(): void {
    super.ngOnInit();

    this.ghamirs = MapMoListToGhamirs(
      this.allColumns,
      this._reportVal,
      this.moList
    );
    this._setTitle(this.moList);
    const width = (this._el.nativeElement as HTMLElement).offsetWidth - 30;
    const boxCount = Math.floor(width / 73);
    this.marginRight = (width - 73 * boxCount) / 2;
    if (this.ghamirs?.length && this.ghamirs[0].rokh === 2) {
      this.ghamirs = this.ghamirs.reverse();
    }
  }
  ngOnChanges(changes: SimpleChanges): void {
    super.ngOnChanges(changes);
    const { moList, ghamirPictures } = changes;
    if (moList && !moList.firstChange) {
      this.ghamirs = MapMoListToGhamirs(
        this.allColumns,
        this._reportVal,
        moList.currentValue
      );
      if (this.ghamirs?.length && this.ghamirs[0].rokh === 2) {
        this.ghamirs = this.ghamirs.reverse();
      }
      this._setTitle(moList.currentValue);
    }
  }

  protected _setTitle(moList: MetaobjectDataModel[]): void {
    if (this.ghamirs.length) {
      this.rokhTitle = `رخ ${this.ghamirs[0].rokh}`;
    }
  }
  idGenerator = 1000;
  onShowGhamirPictures(ghamir: Ghamir): void {
    BarsaApi.Bw.Form.Show({
      MoId: ghamir.id,
      MoContext: {
        ViewName: 'گالری تصویر',
      },
    });
  }
  onSabtPictures(ghamir: Ghamir): void {
    BarsaApi.Bw.Form.Show({
      SystemTypeDefCaption: ['بسامد', 'عکس قمیر'],
      RetrunMoAfterSave: true,
      MoContext: { ViewName: 'نمای ثبت' },
      EventHandlers: {
        BeforeSave: (sender, e) => {
          e.Mo.SetValueByCaption('قمیر', {
            Id: ghamir.id,
            $Caption: ghamir.number,
          });
          e.Mo.SetValueByCaption('وضعیت', ghamir.stateValue);
        },
        AfterSave: (sender, e) => {
          this.pictureUpdated.emit(e.Mo.Unwrap());
        },
      },
    });
  }
  onShowTransmitter(sensor: Sensor): void {
    BarsaApi.Bw.Form.Show({
      MoId: sensor.id,
      TypeDefId: sensor.typeDefId,
    });
  }
  onSabtChideman(ghamir: Ghamir): void {
    const koreh = ghamir.sensors[0].koreh;
    const ghamirSensor = ghamir.sensors[0].ghamir;
    const mo = BarsaApi.Bw.RunBlMethod(
      'GetMoSabtChideman',
      ghamirSensor.Id,
      koreh.Id
    );
    BarsaApi.Bw.Form.Show({
      Mo: mo,
      MoContext: {
        ViewName: 'ثبت چيدمان پختبان',
      },
    });
  }
  onSabtPokht(ghamir: Ghamir): void {
    const koreh = ghamir.sensors[0].koreh;
    const ghamirSensor = ghamir.sensors[0].ghamir;
    const mo = BarsaApi.Bw.RunBlMethod(
      'GetMoKeyfiatPokht',
      ghamirSensor.Id,
      koreh.Id
    );
    BarsaApi.Bw.Form.Show({
      Mo: mo,
      MoContext: {
        ViewName: 'ثبت كيفيت پختبان',
      },
    });
  }
}
