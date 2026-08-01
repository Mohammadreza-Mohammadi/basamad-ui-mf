import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
  computed,
  signal,
} from '@angular/core';
import {
  AbbrevationDeviceSize,
  BaseComponent,
  MetaobjectDataModel,
} from 'barsa-novin-ray-core';
import { Ghamir, Sensor } from '../models';

interface SceneSize {
  width: number;
  height: number;
}

interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Point {
  x: number;
  y: number;
}

interface SensorViewModel {
  data: MetaobjectDataModel;
  index: number;
  x: number;
  temperatureY: number;
  active: boolean;
}

interface BrickViewModel {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface GhamirViewModel {
  data: MetaobjectDataModel;
  index: number;
  centerX: number;
  archPath: string;
  fillId: string;
  hasProduct: boolean;
  cooking: boolean;
  preheating: boolean;
  cooling: boolean;
  bricks: BrickViewModel[];
}

const SCENE_HEIGHT = 232;
const SIDE_PADDING = 28;
const ROKH_LABEL_WIDTH = 38;
const SENSOR_PITCH = 34;
const MIN_CONTENT_WIDTH = 640;
const ARCH_BOTTOM = 184;
const ARCH_SPRING = 139;
const UPPER_TEMPERATURE_Y = 62;
const LOWER_TEMPERATURE_Y = 188;

let nextInstanceId = 0;

@Component({
  selector: 'bu-kiln-rokh',
  standalone: false,
  templateUrl: './kiln-rokh.html',
  styleUrl: './kiln-rokh.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KilnRokh
  extends BaseComponent
  implements OnChanges, AfterViewInit, OnDestroy
{
  @ViewChild('svgRef', { static: true })
  svgRef!: ElementRef<SVGSVGElement>;

  @Input() mobile = false;
  @Input() allColumns: any[] = [];
  @Input() rokhNumber = 1;
  @Input() title = '';
  @Input() deviceSize: AbbrevationDeviceSize = 'xl';
  @Input() ghamirs: MetaobjectDataModel[] = [];
  @Input() transmitters: MetaobjectDataModel[] = [];
  @Input() mode: 'designer' | 'runtime' = 'designer';
  @Output() zoom = new EventEmitter<void>();

  readonly scene = signal<SceneSize>({ width: 720, height: SCENE_HEIGHT });
  readonly viewBox = signal<ViewBox>({
    x: 0,
    y: 0,
    width: 720,
    height: SCENE_HEIGHT,
  });
  readonly sensorVMs = signal<SensorViewModel[]>([]);
  readonly ghamirVMs = signal<GhamirViewModel[]>([]);

  readonly viewBoxAttr = computed(() => {
    const viewBox = this.viewBox();
    return `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`;
  });

  readonly isZoomed = computed(
    () => this.viewBox().width < this.scene().width - 0.5
  );

  readonly zoomPercent = computed(() =>
    Math.round((this.scene().width / this.viewBox().width) * 100)
  );

  /** 0: status only, 1: primary readings, 2: all details. */
  readonly detailLevel = computed<0 | 1 | 2>(() => {
    const pixelsPerSensor =
      (this.viewportSize.width * SENSOR_PITCH) / this.viewBox().width;
    if (pixelsPerSensor >= 21) return 2;
    if (pixelsPerSensor >= 13) return 1;
    return 0;
  });

  readonly ids = {
    panel: `kiln-panel-${++nextInstanceId}`,
    beam: `kiln-beam-${nextInstanceId}`,
    archEmpty: `kiln-arch-empty-${nextInstanceId}`,
    archLoaded: `kiln-arch-loaded-${nextInstanceId}`,
    archPreheat: `kiln-arch-preheat-${nextInstanceId}`,
    archCooking: `kiln-arch-cooking-${nextInstanceId}`,
    archCooling: `kiln-arch-cooling-${nextInstanceId}`,
    brick: `kiln-brick-${nextInstanceId}`,
  };

  private sensorsByGhamir = new Map<string, MetaobjectDataModel[]>();
  private resizeObserver?: ResizeObserver;
  private viewportSize = { width: 1200, height: SCENE_HEIGHT };
  private readonly pointers = new Map<number, Point>();
  private panLast: Point | null = null;
  private pinchStart:
    | { distance: number; viewBox: ViewBox; focus: Point }
    | undefined;
  private gestureMoved = false;

  constructor(
    private readonly host: ElementRef<HTMLElement>,
    private readonly zone: NgZone
  ) {
    super();
  }

  override ngOnInit(): void {
    super.ngOnInit();
    this.rebuild();
  }

  override ngOnChanges(changes: SimpleChanges): void {
    super.ngOnChanges(changes);
    if (changes['transmitters'] || changes['ghamirs']) {
      this.rebuild();
    }
  }

  ngAfterViewInit(): void {
    this.observeSize();
  }

  override ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    super.ngOnDestroy();
  }

  sensorsFor(ghamir: MetaobjectDataModel): MetaobjectDataModel[] {
    return this.sensorsByGhamir.get(this.ghamirKey(ghamir)) ?? [];
  }

  hasValve(sensor: MetaobjectDataModel): boolean {
    const valveNumber = Number(sensor.ShirNode);
    return valveNumber > 0 && valveNumber < 100;
  }

  valveClass(sensor: MetaobjectDataModel): string {
    return `svg-valve--${sensor.RangShir || '0'}`;
  }

  signedValue(value: unknown): string {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return String(value ?? '');
    return numericValue > 0 ? `+${numericValue}` : String(numericValue);
  }

  sensorHasError(sensor: MetaobjectDataModel): boolean {
    return !!(
      sensor.Error ||
      sensor.TransmitterFailed ||
      sensor.TermokoplFailed ||
      Number(sensor.Value) >= 2000
    );
  }

  isCookValueVisible(sensor: MetaobjectDataModel): boolean {
    if (typeof sensor.$ShowAdadPokht === 'boolean') {
      return sensor.$ShowAdadPokht;
    }

    return this.sensorGroupIsActive(sensor);
  }

  toggleCookValue(sensor: MetaobjectDataModel): void {
    sensor.$ShowAdadPokht = !this.isCookValueVisible(sensor);
  }

  onTemperatureClick(event: MouseEvent, sensor: MetaobjectDataModel): void {
    event.stopPropagation();
    if (this.gestureMoved) return;
    this.toggleCookValue(sensor);
  }

  onTemperatureKeydown(
    event: KeyboardEvent,
    sensor: MetaobjectDataModel
  ): void {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    this.toggleCookValue(sensor);
  }

  ghamirIsCooking(ghamir: MetaobjectDataModel): boolean {
    return this.sensorsFor(ghamir).some((sensor) => this.hasValve(sensor));
  }

  ghamirIsPreheating(ghamir: MetaobjectDataModel): boolean {
    return (
      !this.ghamirIsCooking(ghamir) &&
      this.sensorsFor(ghamir).some((sensor) => !!sensor.Pishgarm)
    );
  }

  ghamirIsCooling(ghamir: MetaobjectDataModel): boolean {
    if (this.ghamirIsCooking(ghamir) || this.ghamirIsPreheating(ghamir)) {
      return false;
    }

    const sensors = this.sensorsFor(ghamir);
    const isPostHeating = sensors.some((sensor) => !!sensor.Pasagarm);
    const validTemperatures = sensors
      .filter((sensor) => !sensor.IsMajazi)
      .map((sensor) => Number(sensor.Value))
      .filter((value) => Number.isFinite(value) && value < 2000);
    const isBelowCoolingThreshold =
      validTemperatures.length > 0 && Math.max(...validTemperatures) < 300;

    return isPostHeating || isBelowCoolingThreshold;
  }

  ghamirHasProduct(ghamir: MetaobjectDataModel): boolean {
    return (
      ghamir.GhamirStatusText !== 'خالی' &&
      !!String(ghamir.Mahsol?.$Caption ?? '').trim()
    );
  }

  fitToView(): void {
    const scene = this.scene();
    this.viewBox.set({ x: 0, y: 0, width: scene.width, height: scene.height });
  }

  zoomBy(factor: number): void {
    const viewBox = this.viewBox();
    this.applyZoom(
      factor,
      viewBox.x + viewBox.width / 2,
      viewBox.y + viewBox.height / 2
    );
  }

  onWheel(event: WheelEvent): void {
    event.preventDefault();
    const focus = this.clientToSvg(event.clientX, event.clientY);
    this.applyZoom(event.deltaY < 0 ? 0.84 : 1 / 0.84, focus.x, focus.y);
  }

  onPointerDown(event: PointerEvent): void {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    this.pointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    this.gestureMoved = false;

    if (this.pointers.size === 2) {
      this.beginPinch();
    } else {
      this.panLast = { x: event.clientX, y: event.clientY };
    }
  }

  onPointerMove(event: PointerEvent): void {
    const previous = this.pointers.get(event.pointerId);
    if (!previous) return;

    if (
      Math.abs(event.clientX - previous.x) > 2 ||
      Math.abs(event.clientY - previous.y) > 2
    ) {
      this.gestureMoved = true;
      try {
        this.svgRef.nativeElement.setPointerCapture?.(event.pointerId);
      } catch {
        // Pointer capture is an enhancement; panning still works without it.
      }
    }

    this.pointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });

    if (this.pointers.size >= 2 && this.pinchStart) {
      this.updatePinch();
      return;
    }

    if (!this.panLast || !this.isZoomed()) return;
    const from = this.clientToSvg(this.panLast.x, this.panLast.y);
    const to = this.clientToSvg(event.clientX, event.clientY);
    const viewBox = this.viewBox();
    this.panLast = { x: event.clientX, y: event.clientY };
    this.setViewBox({
      ...viewBox,
      x: viewBox.x + from.x - to.x,
      y: viewBox.y + from.y - to.y,
    });
  }

  onPointerUp(event: PointerEvent): void {
    this.pointers.delete(event.pointerId);
    if (this.pointers.size < 2) this.pinchStart = undefined;
    if (this.pointers.size === 0) {
      this.panLast = null;
    } else {
      const point = [...this.pointers.values()][0];
      this.panLast = { ...point };
    }
  }

  onShowTransmitter(_sensor: Sensor): void {}
  onSabtChideman(_ghamir: Ghamir): void {}
  onSabtPokht(_ghamir: Ghamir): void {}

  private rebuild(): void {
    this.buildSensorGroups();

    const sensorCount = Math.max(1, this.transmitters?.length ?? 0);
    const contentWidth = Math.max(MIN_CONTENT_WIDTH, sensorCount * SENSOR_PITCH);
    const width = SIDE_PADDING * 2 + contentWidth + ROKH_LABEL_WIDTH;
    const previousScene = this.scene();
    const previousViewBox = this.viewBox();
    const wasZoomed = previousViewBox.width < previousScene.width - 0.5;
    const nextScene = { width, height: SCENE_HEIGHT };

    const sensorCellWidth = contentWidth / sensorCount;
    const sensors = (this.transmitters ?? []).map((data, index) => ({
      data,
      index,
      // The former CSS grid inherited RTL direction. Keep that visual contract:
      // the first item in the ordered input array starts from the right.
      x: SIDE_PADDING + sensorCellWidth * (sensorCount - index - 0.5),
      temperatureY:
        index % 2 === 0 ? UPPER_TEMPERATURE_Y : LOWER_TEMPERATURE_Y,
      active: this.sensorGroupIsActive(data),
    }));

    const ghamirCount = Math.max(1, this.ghamirs?.length ?? 0);
    const ghamirSlotWidth = contentWidth / ghamirCount;
    const ghamirs = (this.ghamirs ?? []).map((data, index) => {
      const visualIndex = ghamirCount - index - 1;
      const left = SIDE_PADDING + visualIndex * ghamirSlotWidth + 3;
      const right = SIDE_PADDING + (visualIndex + 1) * ghamirSlotWidth - 3;
      const radiusX = (right - left) / 2;
      const cooking = this.ghamirIsCooking(data);
      const preheating = this.ghamirIsPreheating(data);
      const cooling = this.ghamirIsCooling(data);
      const hasProduct = this.ghamirHasProduct(data);
      const fillId = cooking
        ? this.ids.archCooking
        : preheating
          ? this.ids.archPreheat
          : cooling
            ? this.ids.archCooling
            : hasProduct
              ? this.ids.archLoaded
              : this.ids.archEmpty;

      return {
        data,
        index,
        centerX: left + radiusX,
        archPath:
          `M ${left} ${ARCH_BOTTOM} L ${left} ${ARCH_SPRING} ` +
          `A ${radiusX} 42 0 0 1 ${right} ${ARCH_SPRING} ` +
          `L ${right} ${ARCH_BOTTOM} Z`,
        fillId,
        hasProduct,
        cooking,
        preheating,
        cooling,
        bricks: hasProduct
          ? this.buildBricks(left, right, ARCH_BOTTOM)
          : [],
      } satisfies GhamirViewModel;
    });

    this.scene.set(nextScene);
    this.sensorVMs.set(sensors);
    this.ghamirVMs.set(ghamirs);

    if (!wasZoomed || previousScene.width <= 0) {
      this.fitToView();
      return;
    }

    const widthRatio = previousViewBox.width / previousScene.width;
    const centerRatio =
      (previousViewBox.x + previousViewBox.width / 2) / previousScene.width;
    const nextWidth = width * widthRatio;
    this.setViewBox({
      x: centerRatio * width - nextWidth / 2,
      y: previousViewBox.y,
      width: nextWidth,
      height: previousViewBox.height,
    });
  }

  private buildSensorGroups(): void {
    const groups = new Map<string, MetaobjectDataModel[]>();

    for (const sensor of this.transmitters ?? []) {
      const key = this.ghamirKey(sensor.Ghamir ?? sensor);
      const group = groups.get(key) ?? [];
      group.push(sensor);
      groups.set(key, group);
    }

    for (const group of groups.values()) {
      group.sort(
        (a, b) =>
          Number(!!a.IsMajazi) - Number(!!b.IsMajazi) ||
          Number(a.SlaveAddress) - Number(b.SlaveAddress)
      );
    }

    this.sensorsByGhamir = groups;
  }

  private sensorGroupIsActive(sensor: MetaobjectDataModel): boolean {
    const group = this.sensorsFor(sensor.Ghamir ?? sensor);
    return group.some(
      (groupSensor) => this.hasValve(groupSensor) || !!groupSensor.Pishgarm
    );
  }

  private buildBricks(
    left: number,
    right: number,
    bottom: number
  ): BrickViewModel[] {
    const horizontalPadding = Math.max(6, (right - left) * 0.2);
    const stackLeft = left + horizontalPadding;
    const stackWidth = right - left - horizontalPadding * 2;
    const columns = 4;
    const rows = 3;
    const gap = 1.5;
    const brickWidth = (stackWidth - gap * (columns - 1)) / columns;
    const brickHeight = 6;
    const bricks: BrickViewModel[] = [];

    for (let row = 0; row < rows; row++) {
      const rowColumns = row % 2 === 0 ? columns : columns - 1;
      const rowWidth =
        rowColumns * brickWidth + Math.max(0, rowColumns - 1) * gap;
      const rowLeft = left + (right - left - rowWidth) / 2;
      for (let column = 0; column < rowColumns; column++) {
        bricks.push({
          x: rowLeft + column * (brickWidth + gap),
          y: bottom - 38 - row * (brickHeight + gap),
          width: brickWidth,
          height: brickHeight,
        });
      }
    }

    return bricks;
  }

  private observeSize(): void {
    const updateSize = (width: number, height: number) => {
      this.viewportSize = {
        width: Math.max(1, width),
        height: Math.max(1, height),
      };
      // viewBox is set to itself so computed LOD is recalculated on resize.
      this.viewBox.set({ ...this.viewBox() });
    };

    const element = this.host.nativeElement;
    updateSize(element.clientWidth || 1200, element.clientHeight || SCENE_HEIGHT);
    if (typeof ResizeObserver === 'undefined') return;

    this.resizeObserver = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      this.zone.run(() => updateSize(rect.width, rect.height));
    });
    this.resizeObserver.observe(element);
  }

  private beginPinch(): void {
    const points = [...this.pointers.values()];
    for (const pointerId of this.pointers.keys()) {
      try {
        this.svgRef.nativeElement.setPointerCapture?.(pointerId);
      } catch {
        // Some browsers capture only after the first pointer move.
      }
    }
    const distance = Math.hypot(
      points[0].x - points[1].x,
      points[0].y - points[1].y
    );
    const focus = this.clientToSvg(
      (points[0].x + points[1].x) / 2,
      (points[0].y + points[1].y) / 2
    );
    this.pinchStart = { distance, viewBox: this.viewBox(), focus };
    this.panLast = null;
  }

  private updatePinch(): void {
    if (!this.pinchStart) return;
    const points = [...this.pointers.values()];
    const distance = Math.hypot(
      points[0].x - points[1].x,
      points[0].y - points[1].y
    );
    const factor = this.pinchStart.distance / Math.max(1, distance);
    const start = this.pinchStart.viewBox;
    this.applyZoomFrom(
      start,
      factor,
      this.pinchStart.focus.x,
      this.pinchStart.focus.y
    );
  }

  private applyZoom(factor: number, focusX: number, focusY: number): void {
    this.applyZoomFrom(this.viewBox(), factor, focusX, focusY);
  }

  private applyZoomFrom(
    start: ViewBox,
    factor: number,
    focusX: number,
    focusY: number
  ): void {
    const scene = this.scene();
    const minimumWidth = Math.max(170, scene.width * 0.08);
    const width = this.clamp(start.width * factor, minimumWidth, scene.width);
    const viewportAspect = this.viewportSize.width / this.viewportSize.height;
    const height = Math.min(
      scene.height,
      Math.max(72, width / Math.max(0.5, viewportAspect))
    );
    const x = focusX - ((focusX - start.x) * width) / start.width;
    const y = focusY - ((focusY - start.y) * height) / start.height;

    this.setViewBox({ x, y, width, height });
  }

  private setViewBox(viewBox: ViewBox): void {
    const scene = this.scene();
    const width = this.clamp(viewBox.width, 1, scene.width);
    const height = this.clamp(viewBox.height, 1, scene.height);
    const x = this.clamp(viewBox.x, 0, Math.max(0, scene.width - width));
    const y = this.clamp(viewBox.y, 0, Math.max(0, scene.height - height));
    this.viewBox.set({ x, y, width, height });
  }

  private clientToSvg(clientX: number, clientY: number): Point {
    const svg = this.svgRef.nativeElement;
    const matrix = svg.getScreenCTM();
    if (matrix) {
      const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
      return { x: point.x, y: point.y };
    }

    const rect = svg.getBoundingClientRect();
    const viewBox = this.viewBox();
    return {
      x: viewBox.x + ((clientX - rect.left) / rect.width) * viewBox.width,
      y: viewBox.y + ((clientY - rect.top) / rect.height) * viewBox.height,
    };
  }

  private ghamirKey(value: MetaobjectDataModel): string {
    return String(value?.Id ?? value?.$Caption ?? value?.Number ?? '');
  }

  private clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(maximum, Math.max(minimum, value));
  }
}
