import { Component, Input, OnInit, ViewChild } from '@angular/core';
import {
  FillEmptySpaceDirective,
  ReportViewBaseComponent,
  SortDirection,
  UiReportViewBaseSetting,
} from 'barsa-novin-ray-core';
import { GroupedBarChartComponent } from '../grouped-bar-chart/grouped-bar-chart.component';

@Component({
  selector: 'bu-chart-jabejay',
  templateUrl: './chart-jabejay.component.html',
  styleUrls: ['./chart-jabejay.component.scss'],
  standalone: false,
})
export class ChartJabejayComponent
  extends ReportViewBaseComponent<ChartJabejaySettings>
  implements OnInit
{
  @ViewChild(GroupedBarChartComponent, { static: true })
  chart: GroupedBarChartComponent;
  onVisibilityChange(e): void {
    super.onVisibilityChange(e);
    if (e === 'Visible') {
      setTimeout(() => {
        this.chart.refresh();
      });
    }
  }
}
interface ChartJabejaySettings extends UiReportViewBaseSetting {
  XProp: string;
  YProps: string;
  GroupByProp: string;
}
