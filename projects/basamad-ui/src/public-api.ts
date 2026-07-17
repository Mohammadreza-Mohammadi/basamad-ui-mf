/*
 * Public API Surface of basamad-ui
 */

export * from './lib/components';
export * from './lib/pipes';

export * from './lib/basamad-ui.module';

import { Type } from '@angular/core';
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
} from './lib/components';

export type ComponentMap = { [key: string]: Type<unknown> };

// ── DynamicComponentService میزبان این map رو load می‌کنه ────────────
export const COMPONENT_MAP: ComponentMap = {
    MonitoringKoreh:              MonitoringKorehComponent,
    MonitoringKorehItem:          MonitoringKorehItemComponent,
    PokhtbanKlinOnlineMonitoring: PokhtbanKlinOnlineMonitoringComponent,
    PokhtProgress:                PokhtProgressComponent,
    CircleProgress:               CircleProgressComponent,
    ChartJabejay:                 ChartJabejayComponent,
    GroupedBarChart:              GroupedBarChartComponent,
    KilnAligner:                  KilnAlignerComponent,
    KilnRokh:                     KilnRokh
};
