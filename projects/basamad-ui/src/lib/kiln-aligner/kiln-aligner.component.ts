import {
  Component,
  ElementRef,
  ViewChild,
  AfterViewInit,
  Input,
  ChangeDetectionStrategy,
  HostListener,
  OnInit,
} from '@angular/core';

type Item = {
  id: number;
  relativeLeft: number; // بین 0 و 1
};

@Component({
  selector: 'bu-kiln-aligner',
  standalone: false,
  templateUrl: './kiln-aligner.component.html',
  styleUrls: ['./kiln-aligner.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KilnAlignerComponent implements OnInit {
  @Input() sensorCount = 50;
  @Input() ghamirCount = 20;
  @Input() mode: 'designer' | 'runtime' = 'designer';

  @ViewChild('sensorTrack', { static: true }) sensorTrackRef!: ElementRef<HTMLDivElement>;
  @ViewChild('ghamirTrack', { static: true }) ghamirTrackRef!: ElementRef<HTMLDivElement>;

  sensors: Item[] = [];
  ghamirs: Item[] = [];

  private dragging: { type: 'sensor' | 'ghamir'; id: number } | null = null;
  private dragOffsetX = 0;

  ngOnInit(): void {
    if (this.sensors.length === 0) {
      this.sensors = Array.from({ length: this.sensorCount }, (_, i) => ({
        id: i,
        relativeLeft: (i + 0.5) / this.sensorCount,
      }));
    }
    if (this.ghamirs.length === 0) {
      this.ghamirs = Array.from({ length: this.ghamirCount }, (_, i) => ({
        id: i,
        relativeLeft: (i + 0.5) / this.ghamirCount,
      }));
    }
  }

  @HostListener('window:resize')
  onResize() {
    // نیازی نیست، چون داده‌ها نسبی هستند
  }

  // شروع درگ
  onPointerDown(e: PointerEvent, type: 'sensor' | 'ghamir', item: Item) {
    if (this.mode !== 'designer') return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    this.dragging = { type, id: item.id };

    const trackRef = type === 'sensor' ? this.sensorTrackRef : this.ghamirTrackRef;
    const trackRect = trackRef.nativeElement.getBoundingClientRect();
    const leftPx = item.relativeLeft * trackRect.width;
    this.dragOffsetX = e.clientX - trackRect.left - leftPx;
  }

  // حرکت درگ
  onPointerMove(e: PointerEvent) {
    if (this.mode !== 'designer' || !this.dragging) return;

    const trackRef =
      this.dragging.type === 'sensor' ? this.sensorTrackRef : this.ghamirTrackRef;
    const items = this.dragging.type === 'sensor' ? this.sensors : this.ghamirs;

    const trackRect = trackRef.nativeElement.getBoundingClientRect();
    const rawLeft = e.clientX - trackRect.left - this.dragOffsetX;
    const clamped = this.clampLeft(rawLeft, trackRect.width);
    const relative = clamped / trackRect.width;

    const idx = items.findIndex((x) => x.id === this.dragging!.id);
    if (idx >= 0) {
      items[idx] = { ...items[idx], relativeLeft: relative };
      if (this.dragging.type === 'sensor') this.sensors = [...items];
      else this.ghamirs = [...items];
    }
  }

  // پایان درگ
  onPointerUp(e: PointerEvent) {
    if (this.mode !== 'designer') return;
    if (this.dragging) {
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    }
    this.dragging = null;
  }

  private clampLeft(left: number, trackWidth: number, itemWidth = 40): number {
    if (left < 0) return 0;
    if (left > trackWidth - itemWidth) return trackWidth - itemWidth;
    return left;
  }

  // خروجی گرفتن (برای ذخیره در DB)
  public exportConfig() {
    return {
      sensors: this.sensors,
      ghamirs: this.ghamirs,
    };
  }

  // بارگذاری تنظیمات
  public loadConfig(config: { sensors: Item[]; ghamirs: Item[] }) {
    this.sensors = config.sensors.map((s, i) => ({ id: i, relativeLeft: s.relativeLeft }));
    this.ghamirs = config.ghamirs.map((g, i) => ({ id: i, relativeLeft: g.relativeLeft }));
  }
}
