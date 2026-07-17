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

  // این هندلرِ خروجیِ دایرکتیو `intersectionObserver` روی چایلد (bu-grouped-bar-chart) توی تمپلیته،
  // نه متد کلاس پایه. توی barsa-novin-ray-core جدید، ReportViewBaseComponent دیگه onVisibilityChange
  // نداره؛ پس فقط به‌عنوان هندلر تمپلیت نگهش می‌داریم و super رو صدا نمی‌زنیم.
  onVisibilityChange(e: string): void {
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
