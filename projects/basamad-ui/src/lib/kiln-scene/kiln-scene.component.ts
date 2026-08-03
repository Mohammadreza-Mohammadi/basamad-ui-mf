import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
  ViewChild,
  computed,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';

import {
  KILN_LEGEND,
  KILN_STAGE_META,
  KilnChamber,
  KilnNode,
  valveStateColor,
} from './kiln-scene.model';

interface BrickVM { x: number; y: number; w: number; h: number; }

interface ChamberVM {
  cx: number;
  archPath: string;
  glowId: string;
  glowCx: number;
  glowCy: number;
  glowR: number;
  color: string;
  bricks: BrickVM[];
  number: string;
  productText: string;
  isEmpty: boolean;
  productY: number;
  data: KilnChamber;
}

interface NodeVM {
  i: number;
  cx: number;
  isVirtual: boolean;
  failed: boolean;
  color: string;
  number: string;
  tempText: string;
  cookText: string;
  hasCook: boolean;
  // valve (auto=green, manual=red handle; body colored by RangShir state)
  valveMode: 'auto' | 'manual' | null;
  valveNumber: number;
  valveStateCol: string;
  valveOpen: number;
  valveOpenText: string;
  flamePath: string;
  showFlame: boolean;
  // real card
  cardX: number;
  cardY: number;
  stripPath: string;
  battShow: boolean;
  battW: number;
  battFill: string;
  connY: number;
  // virtual chip
  chipX: number;
  chipY: number;
  // overview
  ovTempY: number;
  data: KilnNode;
}

interface ViewBox { x: number; y: number; w: number; h: number; }

/* layout constants (SVG user units) */
const PAD = 40;
const NODE_PITCH = 72;
const REAL_CARD_W = 108;
const CARD_H = 100;
const VIRT_W = 44;
const NCARD_TOP = 16;
const PIPE_Y = 228;
const WALL_TOP = 262;
const CH_GAP = 16;

@Component({
  selector: 'bu-kiln-scene',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './kiln-scene.component.html',
  styleUrls: ['./kiln-scene.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KilnSceneComponent implements OnInit, OnChanges, OnDestroy {
  @ViewChild('svgRef', { static: true }) svgRef!: ElementRef<SVGSVGElement>;

  @Input() nodes: KilnNode[] = [];
  @Input() chambers: KilnChamber[] = [];
  @Input() zoomable = true;

  @Output() chamberSelect = new EventEmitter<KilnChamber>();
  @Output() nodeSelect = new EventEmitter<KilnNode>();

  readonly legend = KILN_LEGEND;

  // geometry exposed to template
  readonly PIPE_Y = PIPE_Y;
  readonly WALL_TOP = WALL_TOP;
  readonly REAL_CARD_W = REAL_CARD_W;
  readonly CARD_H = CARD_H;
  readonly VIRT_W = VIRT_W;
  readonly NCARD_TOP = NCARD_TOP;

  readonly chamberVMs = signal<ChamberVM[]>([]);
  readonly nodeVMs = signal<NodeVM[]>([]);
  /** Node indices whose card currently shows عدد پخت instead of شماره نود. */
  readonly cookToggled = signal<ReadonlySet<number>>(new Set());
  readonly canvas = signal<ViewBox>({ x: 0, y: 0, w: 1200, h: 480 });
  readonly viewBox = signal<ViewBox>({ x: 0, y: 0, w: 1200, h: 480 });
  readonly chBottom = signal<number>(440);

  private readonly containerWidth = signal<number>(1200);

  /** 'card' = full node cards, 'ov' = compact overview. */
  readonly detail = computed<'card' | 'ov'>(() => {
    const px = this.containerWidth() * (NODE_PITCH / this.viewBox().w);
    return px >= 56 ? 'card' : 'ov';
  });

  readonly viewBoxAttr = computed(() => {
    const v = this.viewBox();
    return `${v.x} ${v.y} ${v.w} ${v.h}`;
  });
  readonly isZoomed = computed(() => this.viewBox().w < this.canvas().w - 0.5);

  private ro?: ResizeObserver;
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private panLast: { x: number; y: number } | null = null;
  private pinchStart: { dist: number; vb: ViewBox; cx: number; cy: number } | null = null;
  private downPos: { x: number; y: number } | null = null;
  /** true once the pointer has dragged past a threshold (suppresses click). */
  dragMoved = false;

  constructor(private zone: NgZone, private host: ElementRef<HTMLElement>) {}

  ngOnInit(): void {
    this.rebuild();
    this.observeSize();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if ((changes['nodes'] || changes['chambers']) &&
        !(changes['nodes']?.firstChange && changes['chambers']?.firstChange)) {
      this.rebuild();
    }
  }

  ngOnDestroy(): void {
    this.ro?.disconnect();
  }

  // --- geometry -------------------------------------------------------------
  private rebuild(): void {
    const nodes = this.nodes ?? [];
    const chambers = this.chambers ?? [];
    const nN = nodes.length;
    const nC = Math.max(1, chambers.length);

    const canvasW = Math.max(600, PAD * 2 + nN * NODE_PITCH);
    const chPitch = (canvasW - PAD * 2) / nC;
    const archW = chPitch - CH_GAP;
    const radius = archW / 2;
    const straightH = archW * 0.28;
    const chBottom = WALL_TOP + 34 + straightH + radius;
    const spring = chBottom - straightH;
    const canvasH = Math.round(chBottom + 22);

    this.chBottom.set(chBottom);
    const canvas: ViewBox = { x: 0, y: 0, w: canvasW, h: canvasH };
    this.canvas.set(canvas);
    this.viewBox.set({ ...canvas });

    // chambers
    const chVMs: ChamberVM[] = chambers.map((c, j) => {
      const cx = PAD + j * chPitch + chPitch / 2;
      const ax = cx - archW / 2;
      const ax2 = cx + archW / 2;
      const archPath =
        `M ${ax} ${chBottom} L ${ax} ${spring} ` +
        `A ${radius} ${radius} 0 0 1 ${ax2} ${spring} L ${ax2} ${chBottom} Z`;
      const color = KILN_STAGE_META[c.stage].color;
      const isEmpty = c.isEmpty || !c.product;
      return {
        cx, archPath, color,
        glowId: `glow-${j}`,
        glowCx: cx, glowCy: chBottom - 26, glowR: archW * 0.62,
        // empty chambers carry no brick load
        bricks: isEmpty ? [] : this.buildBricks(ax + 11, chBottom, archW),
        number: c.number,
        productText: c.product || 'خالی',
        isEmpty,
        productY: chBottom - 12,
        data: c,
      };
    });

    // nodes
    const nVMs: NodeVM[] = nodes.map((d, i) => {
      const cx = PAD + i * NODE_PITCH + NODE_PITCH / 2;
      const color = KILN_STAGE_META[d.stage].color;
      const cardX = cx - REAL_CARD_W / 2;
      const cardY = NCARD_TOP;
      const stripPath =
        `M ${cardX + 11} ${cardY} H ${cardX + REAL_CARD_W - 11} ` +
        `a 11 11 0 0 1 11 11 V ${cardY + 4} H ${cardX} V ${cardY + 11} ` +
        `a 11 11 0 0 1 11 -11 Z`;
      const batt = d.batteryLevel ?? 0;
      return {
        i, cx,
        isVirtual: d.isVirtual,
        failed: d.failed,
        color,
        number: d.number,
        tempText: `${Math.round(d.temperature)}°`,
        cookText: `${Math.trunc(d.cookNumber)}`,
        // عدد پخت only meaningful while firing / preheating
        hasCook: d.stage === 'firing' || d.stage === 'preheat',
        valveMode: d.valveMode,
        valveNumber: d.valve,
        valveStateCol: valveStateColor(d.valveState),
        valveOpen: d.valveOpen,
        valveOpenText: `${Math.round(d.valveOpen)}`,
        flamePath: this.flamePath(cx, PIPE_Y + 9, 4 + (d.valveOpen / 100) * 20),
        showFlame: !!d.valveMode && d.valveOpen > 0,
        cardX, cardY, stripPath,
        battShow: d.batteryLevel != null,
        battW: 16 * (batt / 100),
        battFill: batt < 25 ? '#ff453a' : '#34c759',
        connY: cardY + CARD_H,
        chipX: cx - VIRT_W / 2,
        chipY: cardY + 20,
        ovTempY: d.isVirtual ? NCARD_TOP + 94 : NCARD_TOP + 78,
        data: d,
      };
    });

    this.chamberVMs.set(chVMs);
    this.nodeVMs.set(nVMs);
  }

  private buildBricks(left: number, bottom: number, archW: number): BrickVM[] {
    const loadH = archW * 0.5;
    const loadW = archW - 22;
    const top = bottom - loadH - 6;
    const rows = 3, cols = 4, gp = 3;
    const bw = (loadW - gp * (cols - 1)) / cols;
    const bh = (loadH - gp * (rows - 1)) / rows;
    const out: BrickVM[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const off = r % 2 ? bw / 2 : 0;
        let x = left + c * (bw + gp) + off;
        if (x + bw > left + loadW) x = left + loadW - bw;
        out.push({ x, y: top + r * (bh + gp), w: bw, h: bh });
      }
    }
    return out;
  }

  onChamberClick(vm: ChamberVM): void { this.chamberSelect.emit(vm.data); }

  /** Toggle شماره نود <-> عدد پخت. Triggered only from the node-number text,
   *  works both zoomed (card) and un-zoomed (overview). */
  onNumberClick(vm: NodeVM, ev: Event): void {
    ev.stopPropagation();
    if (this.dragMoved || !vm.hasCook) return;
    const next = new Set(this.cookToggled());
    next.has(vm.i) ? next.delete(vm.i) : next.add(vm.i);
    this.cookToggled.set(next);
    this.nodeSelect.emit(vm.data);
  }

  showsCook(i: number): boolean { return this.cookToggled().has(i); }

  /** Downward-pointing flame teardrop, tip at (cx, top+h). */
  private flamePath(cx: number, top: number, h: number): string {
    const w = h * 0.5;
    return (
      `M ${cx} ${top + h} ` +
      `C ${cx - w} ${top + h * 0.5} ${cx - w} ${top} ${cx} ${top} ` +
      `C ${cx + w} ${top} ${cx + w} ${top + h * 0.5} ${cx} ${top + h} Z`
    );
  }

  // --- responsive -----------------------------------------------------------
  private observeSize(): void {
    const el = this.host.nativeElement;
    this.containerWidth.set(el.clientWidth || 1200);
    if (typeof ResizeObserver === 'undefined') return;
    this.ro = new ResizeObserver((e) => {
      const w = e[0]?.contentRect.width;
      if (w) this.zone.run(() => this.containerWidth.set(w));
    });
    this.ro.observe(el);
  }

  // --- zoom / pan -----------------------------------------------------------
  resetZoom(): void { this.viewBox.set({ ...this.canvas() }); }
  zoomBy(f: number): void {
    const vb = this.viewBox();
    this.applyZoom(f, vb.x + vb.w / 2, vb.y + vb.h / 2);
  }
  onWheel(ev: WheelEvent): void {
    if (!this.zoomable) return;
    ev.preventDefault();
    const p = this.clientToSvg(ev.clientX, ev.clientY);
    this.applyZoom(ev.deltaY < 0 ? 0.86 : 1 / 0.86, p.x, p.y);
  }
  onPointerDown(ev: PointerEvent): void {
    if (!this.zoomable) return;
    this.svgRef.nativeElement.setPointerCapture?.(ev.pointerId);
    this.pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    this.downPos = { x: ev.clientX, y: ev.clientY };
    this.dragMoved = false;
    if (this.pointers.size === 2) this.beginPinch();
    else this.panLast = { x: ev.clientX, y: ev.clientY };
  }
  onPointerMove(ev: PointerEvent): void {
    if (!this.zoomable || !this.pointers.has(ev.pointerId)) return;
    this.pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (this.downPos &&
        Math.hypot(ev.clientX - this.downPos.x, ev.clientY - this.downPos.y) > 6) {
      this.dragMoved = true;
    }
    if (this.pointers.size >= 2 && this.pinchStart) { this.updatePinch(); return; }
    if (this.panLast && this.isZoomed()) {
      const vb = this.viewBox();
      const rect = this.svgRef.nativeElement.getBoundingClientRect();
      const dx = (ev.clientX - this.panLast.x) * (vb.w / rect.width);
      const dy = (ev.clientY - this.panLast.y) * (vb.h / rect.height);
      this.panLast = { x: ev.clientX, y: ev.clientY };
      this.setViewBox({ ...vb, x: vb.x - dx, y: vb.y - dy });
    }
  }
  onPointerUp(ev: PointerEvent): void {
    this.pointers.delete(ev.pointerId);
    if (this.pointers.size < 2) this.pinchStart = null;
    if (this.pointers.size === 0) this.panLast = null;
  }
  private beginPinch(): void {
    const p = [...this.pointers.values()];
    const dist = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
    const c = this.clientToSvg((p[0].x + p[1].x) / 2, (p[0].y + p[1].y) / 2);
    this.pinchStart = { dist, vb: this.viewBox(), cx: c.x, cy: c.y };
    this.panLast = null;
  }
  private updatePinch(): void {
    if (!this.pinchStart) return;
    const p = [...this.pointers.values()];
    const dist = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
    const ratio = this.pinchStart.dist / Math.max(1, dist);
    const canvas = this.canvas();
    const s = this.pinchStart.vb;
    const w = this.clamp(s.w * ratio, canvas.w * 0.12, canvas.w);
    const h = w * (canvas.h / canvas.w);
    const x = this.pinchStart.cx - ((this.pinchStart.cx - s.x) * w) / s.w;
    const y = this.pinchStart.cy - ((this.pinchStart.cy - s.y) * h) / s.h;
    this.setViewBox({ x, y, w, h });
  }
  private applyZoom(f: number, fx: number, fy: number): void {
    const canvas = this.canvas();
    const vb = this.viewBox();
    const w = this.clamp(vb.w * f, canvas.w * 0.12, canvas.w);
    const h = w * (canvas.h / canvas.w);
    this.setViewBox({ x: fx - ((fx - vb.x) * w) / vb.w, y: fy - ((fy - vb.y) * h) / vb.h, w, h });
  }
  private setViewBox(vb: ViewBox): void {
    const c = this.canvas();
    const x = this.clamp(vb.x, 0, Math.max(0, c.w - vb.w));
    const y = this.clamp(vb.y, 0, Math.max(0, c.h - vb.h));
    this.viewBox.set({ x, y, w: vb.w, h: vb.h });
  }
  private clientToSvg(cx: number, cy: number): { x: number; y: number } {
    const r = this.svgRef.nativeElement.getBoundingClientRect();
    const vb = this.viewBox();
    return { x: vb.x + ((cx - r.left) / r.width) * vb.w, y: vb.y + ((cy - r.top) / r.height) * vb.h };
  }
  private clamp(v: number, a: number, b: number): number { return Math.min(b, Math.max(a, v)); }
}
