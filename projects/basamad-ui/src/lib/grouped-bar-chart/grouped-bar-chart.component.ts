import {
  Component,
  Input,
  OnChanges,
  ElementRef,
  ViewChild,
  AfterViewInit,
  SimpleChanges,
  OnDestroy,
  inject,
} from '@angular/core';
import { BaseComponent, PortalService } from 'barsa-novin-ray-core';
import * as echarts from 'echarts';
import { takeUntil } from 'rxjs';

@Component({
  selector: 'bu-grouped-bar-chart',
  templateUrl: './grouped-bar-chart.component.html',
  styleUrls: ['./grouped-bar-chart.component.scss'],
  standalone: false,
})
export class GroupedBarChartComponent extends BaseComponent {
  @Input() data: Record<string, any[]> = {};
  @Input() groupBy: string = 'Koreh';
  @Input() xProp: string = 'TimeGroup';
  @Input() yProps: string[] = ['TotalTransfers'];
  @Input() yInterval: number = 1;

  @ViewChild('container', { static: true }) containerRef!: ElementRef;
  echarts: echarts.ECharts[] = [];
  rendered = false;
  Refresh = () => this.refresh();
  private _portalService = inject(PortalService);
  ngAfterViewInit(): void {
    if (this.data) {
      this.renderCharts(this.data);
      this.rendered = true;
    }
    this._portalService.navigationEnd$
      .pipe(takeUntil(this._onDestroy$))
      .subscribe((c) => this.hideTooltip2());
  }
  hideTooltip2(): void {
    this.echarts?.forEach((c) => {
      c.dispatchAction({ type: 'hideTip' });
    });
  }

  ngOnDestroy(): void {
    // 👇 این خط خیلی مهمه
    this.echarts?.forEach((c) => {
      c.dispatchAction({ type: 'hideTip' });
      c.dispose();
    });
  }
  ngOnChanges(changes: SimpleChanges): void {
    const { data } = changes;
    if (data && !data.firstChange && this.rendered) {
      this.renderCharts(data.currentValue);
    }
  }

  onVisibilityChange(e: string): void {
    if (e === 'Visible') {
      if (this.data && !this.echarts.length) {
        this.renderCharts(this.data);
      } else {
        this.refresh();
      }
    }
  }

  refresh(): void {
    this.echarts?.forEach((c) => c.resize({ animation: { duration: 300 } }));
  }

  hideTooltip(params): string {
    if (params[0].seriesIndex === 1) {
      return '';
    }
    return params[0].data + '';
  }
  renderCharts(grouped: Record<string, any[]>): void {
    const container: HTMLElement = this.containerRef?.nativeElement;
    if (!container) return;

    // 1. Dispose همه‌ی نمودارهای قبلی
    this.echarts.forEach((chart) => {
      if (chart && !chart.isDisposed?.()) {
        echarts.dispose(chart);
      }
    });
    this.echarts = [];

    // 2. حذف دستی همه‌ی فرزندان DOM
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    // 3. ساخت نمودارهای جدید    
    const chartHeight = `50svh`;

    Object.entries(grouped).forEach(([groupName, items]: [string, any[]]) => {
      const chartDiv = document.createElement('div');
      chartDiv.classList.add('chart');
      chartDiv.style.width = '100%';
      chartDiv.style.setProperty(
        'backgroundn-color',
        'var(--sapBackgroundColor'
      );
      chartDiv.style.height = chartHeight;
      container.appendChild(chartDiv);

      const chart = echarts.init(chartDiv);
      this.echarts.push(chart);

      const xData = items.map(
        (i) => i[this.xProp + '$Caption'] || i[this.xProp]
      );
      const series = this.yProps.map((prop, idx) => ({
        name: prop,
        type: 'bar',
        data: items.map((i) => Number(i[prop] ?? 0)),
        itemStyle: {
          color: this.getColor(idx),
        },
        label: {
          show: true,
          position: 'inside',
          formatter: '{c}',
          fontSize: 12,
          color: '#fff',
        },
      }));

      chart.setOption({
        textStyle: {
          fontFamily: 'B-Font', // فونت دلخواه
        },
        title: {
          text: `نمودار - ${groupName}`,
          left: 'center',
        },
        tooltip: {
          trigger: 'axis',
          axisPointer: { snap: false },
          formatter: this.hideTooltip,
        },
        legend: {
          top: 30,
        },
        xAxis: {
          type: 'category',
          data: xData,
          axisLabel: {
            rotate: xData.length > 5 ? 45 : 0,
            interval: 0,
          },
        },
        yAxis: {
          type: 'value',
          min: 0,
          interval: this.yInterval ?? 1,
        },
        series,
      });
    });
  }

  getColor(index: number): string {
    const palette = ['#5470C6', '#91CC75', '#EE6666', '#FAC858', '#73C0DE'];
    return palette[index % palette.length];
  }
}
