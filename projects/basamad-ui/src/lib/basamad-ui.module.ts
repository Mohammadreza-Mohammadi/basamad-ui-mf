import { CommonModule } from '@angular/common';
import {
  NgModule,
  NO_ERRORS_SCHEMA,
} from '@angular/core';

export { FormModule, FundamentalNgxCoreModule } from '@fundamental-ngx/core';
import {
  BarsaNovinRayCoreModule,
  BaseModule,
  DynamicComponentService,
} from 'barsa-novin-ray-core';
import { BarsaSapUiModule } from 'barsa-sap-ui';

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
import { FormModule, FundamentalNgxCoreModule } from '@fundamental-ngx/core';
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
    BarsaSapUiModule,    
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
