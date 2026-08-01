import { CommonModule } from '@angular/common';
import {
  NgModule,
  NO_ERRORS_SCHEMA,
} from '@angular/core';

export { FundamentalNgxCoreModule } from '@fundamental-ngx/core';
export { FormModule } from '@fundamental-ngx/core/form';
import {
  BarsaNovinRayCoreModule,
  BaseModule,
  DynamicComponentService,
} from 'barsa-novin-ray-core';
import { OrientationService } from './orientation.service';
import { BasamadService } from './basamad-service';

import {
  BuGroupByPipe,
  DamaColorPipe,
  SortDateChartPipe,
  GhamirPicturePipe,
  FilterGroupPipe,
  PadStartPipe,
  GroupebyChartPipe,
  ChunkArrayPipe,
} from './pipes';
import 'iconify-icon';

import {
  MonitoringKorehComponent,
  MonitoringKorehItemComponent,
  PokhtbanKlinOnlineMonitoringComponent,
  PokhtProgressComponent,
  CircleProgressComponent,
  ChartJabejayComponent,
  GroupedBarChartComponent,
  KilnAlignerComponent,
  KilnRokh
} from './components';
import { FundamentalNgxCoreModule } from '@fundamental-ngx/core';
import { FormModule } from '@fundamental-ngx/core/form';
import { FormsModule } from '@fundamental-ngx/cdk/forms';
import { RouterModule } from '@angular/router';


const components = [
  MonitoringKorehComponent,
  MonitoringKorehItemComponent,
  PokhtbanKlinOnlineMonitoringComponent,
  PokhtProgressComponent,
  CircleProgressComponent,
  ChartJabejayComponent,
  GroupedBarChartComponent,
  KilnAlignerComponent,
  KilnRokh
];
const pipes = [
  BuGroupByPipe,
  DamaColorPipe,
  SortDateChartPipe,
  GhamirPicturePipe,
  FilterGroupPipe,
  PadStartPipe,
  GroupebyChartPipe,
  ChunkArrayPipe,
];

@NgModule({
  declarations: [...components, ...pipes],
  imports: [
    CommonModule,
    RouterModule,
    BarsaNovinRayCoreModule,
    FundamentalNgxCoreModule,
    FormModule,
    FormsModule,
  ],
  exports: [...components, ...pipes],
  providers: [...pipes, BasamadService, OrientationService],
  schemas: [NO_ERRORS_SCHEMA],
})
export class BasamadUiModule extends BaseModule {
  protected dynamicComponents = [...components];
  constructor(protected dcm: DynamicComponentService) {
    // barsa-novin-ray-core جدید: BaseModule فقط (dcm, moduleName) می‌گیره (ComponentFactoryResolver حذف شده)
    super(dcm, 'BasamadUiModule');
  }
}
