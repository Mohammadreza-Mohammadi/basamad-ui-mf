import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  Output,
  EventEmitter,
  ViewChild,
  SimpleChanges,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  AbbrevationDeviceSize,
  BarsaApi,
  BaseComponent,
  MetaobjectDataModel,
  PortalService,
} from 'barsa-novin-ray-core';

// SVG port of the WinForms `WinccKilnControl` — a WinCC-style rendition of one kiln rokh.
// It consumes the same raw transmitter/ghamir MetaObject lists as `bu-kiln-rokh`, so it drops
// into the same dynamic-component pipeline; only the visual style differs.

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Brick {
  x: number;
  y: number;
  width: number;
  height: number;
  alarm: boolean;
}

interface ChamberVM {
  id: string;
  number: string;
  archPath: string;
  isFull: boolean;
  productUnknown: boolean;
  receivedCode: string;
  productName: string;
  bricks: Brick[];
  productBox: Rect;
  productTextX: number;
  productTextY: number;
  productTextSize: number;
  codeTextY: number;
  plaque: Rect;
  plaqueTextX: number;
  plaqueTextY: number;
}

interface FactoryProductOption {
  FactoryProductId: string | number;
  ProductId: string | number;
  ProductName: string;
  CurrentCode: string | number;
}

interface UnknownProductSelection {
  ghamirId: string;
  number: string;
  expectedCode: string;
}

interface ValveVM {
  x: number;
  y: number;
  size: number;
  radius: number;
  fill: string;
  fillLight: string;
  gradientId: string;
  number: string;
  textSize: number;
}

interface SensorVM {
  key: string;
  x: number;
  number: string;
  numberSize: number;
  error: boolean;
  alarm: boolean;
  isVirtual: boolean;
  stemTopY: number;
  stemX2: number;
  box: Rect;
  boxError: boolean;
  valueText: string;
  valueSize: number;
  cookBox: Rect;
  cookText: string;
  cookSize: number;
  cookInvalid: boolean;
  cookVisible: boolean;
  valve: ValveVM | null;
}

let nextComponentId = 0;

const OUTER = 14;
const DESKTOP_ROW_HEIGHT = 180;
const MOBILE_ROW_HEIGHT = 260;
const MOBILE_SCENE_MIN_WIDTH = 1100;
const MIN_LABEL_WIDTH = 38;
const MAX_LABEL_WIDTH = 54;

// Palette mirrors WinccKilnControl.
const TEMPERATURE_BLUE = '#0a229d';
const CYAN = '#146d8c';

@Component({
  selector: 'bu-wincc-kiln',
  standalone: false,
  templateUrl: './wincc-kiln.html',
  styleUrl: './wincc-kiln.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WinccKiln
  extends BaseComponent
  implements OnChanges, AfterViewInit, OnDestroy
{
  private static readonly instances = new Set<WinccKiln>();

  @ViewChild('productDialog')
  set productDialog(ref: ElementRef<HTMLDialogElement> | undefined) {
    if (!ref) return;
    queueMicrotask(() => {
      if (!this.destroyed && this.selection() && ref.nativeElement.isConnected && !ref.nativeElement.open) {
        ref.nativeElement.showModal();
      }
    });
  }

  @Input() allColumns: any[] = [];
  @Input() rokhNumber = 1;
  @Input() kilnNumber = 1;
  @Input() title = '';
  @Input() mobile = false;
  @Input() deviceSize: AbbrevationDeviceSize = 'xl';
  @Input() ghamirs: MetaobjectDataModel[] = [];
  @Input() transmitters: MetaobjectDataModel[] = [];
  /** Matches WinccKilnControl: true puts the first numbered node at the right. */
  @Input() startsFromRight = false;
  @Input() mode: 'designer' | 'runtime' = 'designer';
  @Output() refreshRequested = new EventEmitter<void>();

  private readonly componentId = ++nextComponentId;
  readonly productDialogTitleId = `wincc-product-dialog-${this.componentId}`;
  readonly productChoiceId = `wincc-product-choice-${this.componentId}`;
  readonly bandGradientId = `wincc-band-${this.componentId}`;
  readonly labelGradientId = `wincc-label-${this.componentId}`;
  readonly brickPatternId = `wincc-brick-${this.componentId}`;
  private readonly expandedCookNumbers = new Set<string>();
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly zone = inject(NgZone);
  private readonly portal = inject(PortalService);
  private resizeObserver?: ResizeObserver;
  private layoutWidth = 720;
  private productRequest = 0;
  private destroyed = false;

  readonly sceneWidth = signal<number>(720);
  readonly sceneHeight = signal<number>(DESKTOP_ROW_HEIGHT);
  readonly rowHeight = signal<number>(DESKTOP_ROW_HEIGHT);
  readonly wall = signal<Rect>({ x: 0, y: 0, width: 0, height: 0 });
  readonly topBand = signal<Rect>({ x: 0, y: 0, width: 0, height: 0 });
  readonly label = signal<Rect>({ x: 0, y: 0, width: 0, height: 0 });
  readonly brickRowHeight = signal<number>(12);
  readonly brickWidth = signal<number>(30);
  readonly sensorVMs = signal<SensorVM[]>([]);
  readonly chamberVMs = signal<ChamberVM[]>([]);
  readonly unknownChambers = computed(() => this.chamberVMs().filter((item) => item.productUnknown));
  readonly selection = signal<UnknownProductSelection | null>(null);
  readonly productOptions = signal<FactoryProductOption[]>([]);
  readonly selectedProductId = signal<string | null>(null);
  readonly productLoading = signal(false);
  readonly productSaving = signal(false);
  readonly productError = signal('');

  readonly viewBoxAttr = computed(
    () => `0 0 ${this.sceneWidth()} ${this.sceneHeight()}`,
  );
  readonly cyan = CYAN;
  readonly temperatureBlue = TEMPERATURE_BLUE;

  labelText(): string {
    return `کوره ${this.kilnNumber}، رخ ${this.rokhNumber}`;
  }

  readonly brickTileHeight = computed(() => this.brickRowHeight() * 2);
  readonly brickPatternPath = computed(() => {
    const bw = this.brickWidth();
    const rh = this.brickRowHeight();
    return `M0 0H${bw}M0 ${rh}H${bw}M0 0V${rh}M${bw / 2} ${rh}V${rh * 2}`;
  });
  readonly labelTransform = computed(() => {
    const l = this.label();
    return `translate(${l.x + l.width / 2} ${l.y + l.height / 2}) rotate(90)`;
  });

  override ngOnInit(): void {
    super.ngOnInit();
    this.rebuild();
  }

  override ngOnChanges(changes: SimpleChanges): void {
    super.ngOnChanges(changes);
    if (
      changes['transmitters'] ||
      changes['ghamirs'] ||
      changes['startsFromRight'] ||
      changes['mobile']
    ) {
      if (changes['mobile']) {
        this.applyLayout(this.fixedRowHeight());
      }
      this.rebuild();
    }
  }

  ngAfterViewInit(): void {
    WinccKiln.instances.add(this);
    this.observeWidth();
    WinccKiln.refreshRegisteredLayouts();
  }

  override ngOnDestroy(): void {
    this.destroyed = true;
    this.productRequest++;
    this.resizeObserver?.disconnect();
    WinccKiln.instances.delete(this);
    WinccKiln.refreshRegisteredLayouts();
    super.ngOnDestroy();
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    WinccKiln.refreshRegisteredLayouts();
  }

  private rebuild(): void {
    const nodesSource = [...(this.transmitters ?? [])].sort(
      (left, right) => Number(left.SlaveAddress) - Number(right.SlaveAddress),
    );
    const chambersSource = [...(this.ghamirs ?? [])].sort(
      (left, right) => Number(left.Number) - Number(right.Number),
    );
    const nodeCount = Math.max(1, nodesSource.length);
    const chamberCount = Math.max(1, chambersSource.length);

    const labelWidth = clamp(
      this.layoutWidth * 0.025,
      MIN_LABEL_WIDTH,
      MAX_LABEL_WIDTH,
    );
    const contentWidth = Math.max(1, this.layoutWidth - labelWidth - OUTER * 2);
    const sceneWidth = OUTER + contentWidth + labelWidth + OUTER;
    const kilnHeight = this.sceneHeight() - OUTER * 2;
    const topBandHeight = clamp(kilnHeight * 0.115, 22, 36);
    const wall: Rect = {
      x: OUTER,
      y: OUTER + topBandHeight,
      width: contentWidth,
      height: kilnHeight - topBandHeight,
    };
    const topBand: Rect = {
      x: OUTER,
      y: OUTER,
      width: contentWidth,
      height: topBandHeight,
    };
    const wallBottom = OUTER + kilnHeight;

    // brick wall tile
    const rowHeight = clamp(wall.height / 14, 8, 14);

    // chambers
    const slot = contentWidth / chamberCount;
    const archBottom = wallBottom - clamp(wall.height * 0.045, 4, 10);
    const archHeight = clamp(
      slot * 1.55,
      58,
      Math.min(138, wall.height * 0.52),
    );
    const archTop = archBottom - archHeight;
    const spring = archBottom - archHeight * 0.57;

    // SVG x grows left-to-right; reverse the visual index when numbering starts at the right.
    const place = (index: number, count: number) =>
      this.startsFromRight ? count - 1 - index : index;

    const chamberVMs: ChamberVM[] = [];
    for (let i = 0; i < chambersSource.length; i++) {
      const chamber = chambersSource[i];
      const vi = place(i, chambersSource.length);
      const gap = clamp(slot * 0.08, 1.5, 5);
      const left = wall.x + vi * slot + gap;
      const right = wall.x + (vi + 1) * slot - gap;
      if (right <= left + 2) continue;

      const isFull = this.ghamirIsFull(chamber);
      const productUnknown = isFull && this.ghamirProductUnknown(chamber);
      const productName = productUnknown
        ? 'نامشخص'
        : isFull
          ? this.ghamirProductName(chamber)
          : '';
      const receivedCode = productUnknown
        ? String(this.ghamirField(chamber, 'كد محصول دريافتي', 'ReceivedProductCode') ?? '')
        : '';
      const width = right - left;
      const numberSize = clamp(slot * 0.24, 7, 11);
      const plaqueWidth = clamp(slot * 0.32, 16, 26);
      const plaqueHeight = numberSize + 4;
      const centerX = (left + right) / 2;
      const productLabelHeight = productUnknown
        ? clamp(archHeight * 0.3, 22, 30)
        : clamp(archHeight * 0.18, 14, 22);

      chamberVMs.push({
        id: String(chamber.Id ?? ''),
        number: String(chamber.Number ?? ''),
        archPath:
          `M ${left} ${archBottom} L ${left} ${spring} ` +
          `C ${left + width * 0.08} ${archTop} ${right - width * 0.08} ${archTop} ${right} ${spring} ` +
          `L ${right} ${archBottom} Z`,
        isFull,
        productUnknown,
        receivedCode,
        productName,
        bricks: isFull
          ? this.buildBricks(
              left,
              right,
              archBottom - productLabelHeight - 3,
              this.ghamirHasAlarm(chamber),
            )
          : [],
        productBox: {
          x: left + 2,
          y: archBottom - productLabelHeight - 1,
          width: Math.max(0, width - 4),
          height: productLabelHeight,
        },
        productTextX: centerX,
        productTextY: productUnknown
          ? archBottom - productLabelHeight * 0.69 - 1
          : archBottom - productLabelHeight / 2 - 1,
        productTextSize: clamp(slot * 0.16, 6, 10),
        codeTextY: archBottom - productLabelHeight * 0.27 - 1,
        plaque: {
          x: centerX - clamp(slot * 0.16, 8, 13),
          y: archTop - numberSize - 4,
          width: plaqueWidth,
          height: plaqueHeight,
        },
        plaqueTextX: centerX,
        plaqueTextY: archTop - numberSize - 4 + plaqueHeight / 2,
      });
    }

    // sensors
    const pitch = contentWidth / nodeCount;
    const valueHeight = clamp(wall.height * 0.105, 16, 27);
    // Match the desktop viewer: every value reserves room for four digits and uses one
    // consistent font size, so individual temperatures never grow, shrink or overlap.
    const valueWidth = Math.max(18, Math.min(40, pitch - 2));
    const valueFont = clamp(pitch * 0.28, 6, 9);
    const numberFont = clamp(pitch * 0.32, 6, 10);
    const upperY = archTop + 3;
    const lowerY =
      wallBottom - valueHeight * 2 - clamp(wall.height * 0.035, 3, 9);

    const sensorVMs: SensorVM[] = [];
    for (let i = 0; i < nodesSource.length; i++) {
      const node = nodesSource[i];
      const x = topBand.x + pitch * (place(i, nodesSource.length) + 0.5);
      const error = this.sensorHasError(node);
      const valueY = i % 2 === 0 ? upperY : lowerY;
      const valveNumber = Number(node.ShirNode);
      const key = String(node.SlaveAddress ?? i);
      const isVirtual = asBoolean(node.IsMajazi);
      const cookNumber = Number(node.AdadPokht);
      const cookInvalid = Number.isFinite(cookNumber) && cookNumber > 9999;

      sensorVMs.push({
        key,
        x,
        number: String(node.SlaveAddress ?? ''),
        numberSize: numberFont,
        error,
        alarm: this.sensorHasCutAlarm(node),
        isVirtual,
        stemTopY: topBand.y - 8,
        stemX2: x + Math.min(4, pitch * 0.18),
        box: {
          x: x - valueWidth / 2,
          y: valueY,
          width: valueWidth,
          height: valueHeight,
        },
        boxError: error,
        valueText: this.temperatureText(node),
        valueSize: valueFont,
        cookBox: {
          x: x - valueWidth / 2,
          y: valueY + valueHeight + 2,
          width: valueWidth,
          height: valueHeight,
        },
        cookText: this.numericText(node.AdadPokht),
        cookSize: Math.max(6, valueFont * 0.82),
        cookInvalid,
        cookVisible: cookInvalid || this.expandedCookNumbers.has(key),
        valve:
          valveNumber > 0 && valveNumber < 100
            ? this.buildValve(
                node,
                x,
                Math.max(wall.y + 4, archTop - valueHeight - 25),
                pitch,
              )
            : null,
      });
    }

    this.sceneWidth.set(sceneWidth);
    this.wall.set(wall);
    this.topBand.set(topBand);
    this.label.set({
      x: OUTER + contentWidth,
      y: OUTER,
      width: labelWidth,
      height: kilnHeight,
    });
    this.brickRowHeight.set(rowHeight);
    this.brickWidth.set(rowHeight * 2.5);
    this.chamberVMs.set(chamberVMs);
    this.sensorVMs.set(sensorVMs);
  }

  private static refreshRegisteredLayouts(): void {
    const visible = [...WinccKiln.instances].filter((instance) => {
      const element = instance.host.nativeElement;
      return element.isConnected && element.getClientRects().length > 0;
    });

    for (const instance of visible) {
      instance.applyLayout(instance.fixedRowHeight());
    }
  }

  private applyLayout(height: number): void {
    const measuredWidth = this.host.nativeElement.clientWidth || 720;
    const width = this.mobile
      ? Math.max(MOBILE_SCENE_MIN_WIDTH, measuredWidth)
      : Math.max(320, measuredWidth);
    const changed =
      Math.abs(this.layoutWidth - width) > 0.5 || this.rowHeight() !== height;
    if (!changed) return;

    this.layoutWidth = width;
    this.rowHeight.set(height);
    this.sceneHeight.set(height);
    this.rebuild();
  }

  private fixedRowHeight(): number {
    return this.mobile ? MOBILE_ROW_HEIGHT : DESKTOP_ROW_HEIGHT;
  }

  private observeWidth(): void {
    if (typeof ResizeObserver === 'undefined') return;

    this.resizeObserver = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (!width || Math.abs(width - this.layoutWidth) <= 0.5) return;
      this.zone.run(() => this.applyLayout(this.rowHeight()));
    });
    this.resizeObserver.observe(this.host.nativeElement);
  }

  private buildValve(
    node: MetaobjectDataModel,
    x: number,
    y: number,
    pitch: number,
  ): ValveVM {
    const size = clamp(pitch * 0.66, 13, 23);
    const fill = this.valveFill(node);
    return {
      x: x - size / 2,
      y,
      size,
      radius: Math.min(5, size * 0.22),
      fill,
      fillLight: lighten(fill, 55),
      gradientId: `wincc-valve-${this.componentId}-${String(node.SlaveAddress ?? x).replace(/[^a-zA-Z0-9_-]/g, '-')}`,
      number: String(node.ShirNode ?? ''),
      textSize: clamp(size * 0.52, 7, 11),
    };
  }

  private buildBricks(
    left: number,
    right: number,
    bottom: number,
    alarm: boolean,
  ): Brick[] {
    const width = right - left;
    const pad = width * 0.2;
    const brickWidth = Math.max(2, (width - pad * 2) / 4.5);
    const brickHeight = clamp(width * 0.09, 2, 6);
    const bricks: Brick[] = [];
    for (let row = 0; row < 3; row++) {
      const columns = row % 2 === 0 ? 4 : 3;
      const rowWidth = columns * brickWidth + (columns - 1);
      const startX = (left + right - rowWidth) / 2;
      const y = bottom - 5 - (row + 1) * (brickHeight + 1);
      for (let column = 0; column < columns; column++) {
        bricks.push({
          x: startX + column * (brickWidth + 1),
          y,
          width: brickWidth,
          height: brickHeight,
          alarm,
        });
      }
    }
    return bricks;
  }

  async openProductSelection(chamber: ChamberVM): Promise<void> {
    if (!chamber.productUnknown || !chamber.id || !chamber.receivedCode) return;
    this.selection.set({
      ghamirId: chamber.id,
      number: chamber.number,
      expectedCode: chamber.receivedCode,
    });
    this.selectedProductId.set(null);
    this.productOptions.set([]);
    await this.loadProductOptions();
  }

  closeProductSelection(): void {
    if (this.productSaving()) return;
    this.productRequest++;
    this.selection.set(null);
    this.productLoading.set(false);
    this.productOptions.set([]);
    this.selectedProductId.set(null);
    this.productError.set('');
  }

  onProductDialogCancel(event: Event): void {
    if (this.productSaving()) event.preventDefault();
    else this.closeProductSelection();
  }

  onProductChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.selectedProductId.set(value || null);
    this.productError.set('');
  }

  async saveProductSelection(): Promise<void> {
    const selection = this.selection();
    const selectedId = this.selectedProductId();
    if (!selection || this.productSaving() || this.productLoading()) return;
    const selected = this.productOptions().find((item) =>
      String(item.FactoryProductId) === selectedId &&
      !!item.ProductId && String(item.ProductId) !== '0',
    );
    if (!selected) {
      this.productError.set('محصول انتخاب‌شده معتبر نیست.');
      return;
    }

    const current = this.ghamirs.find((item) => String(item.Id) === selection.ghamirId);
    if (!current || !this.ghamirIsFull(current) ||
        !this.ghamirProductUnknown(current) ||
        String(this.ghamirField(current, 'كد محصول دريافتي', 'ReceivedProductCode') ?? '') !== selection.expectedCode) {
      this.productError.set('وضعیت قمیر تغییر کرده است؛ نما را تازه‌سازی کنید.');
      this.selectedProductId.set(null);
      this.reportProductError(this.productError());
      return;
    }

    this.productSaving.set(true);
    this.productError.set('');
    try {
      const result = await this.portal.RunBlMethodAsync<boolean>(
        'SetUnknownGhamirProductMapping',
        [selection.ghamirId, selection.expectedCode, selected.FactoryProductId],
      );
      this.zone.run(() => {
        if (this.destroyed) return;
        if (result !== true) {
          this.productError.set('ثبت محصول انجام نشد. نما را تازه‌سازی کنید.');
          this.reportProductError(this.productError());
          return;
        }
        this.productSaving.set(false);
        this.closeProductSelection();
        this.refreshRequested.emit();
      });
    } catch (error) {
      this.zone.run(() => {
        if (this.destroyed) return;
        const message = this.productFailureMessage(error);
        this.productError.set(message);
        this.selectedProductId.set(null);
        this.reportProductError(message, message.includes('تعارض'));
      });
    } finally {
      this.zone.run(() => {
        if (!this.destroyed) this.productSaving.set(false);
      });
    }
  }

  private async loadProductOptions(reportErrors = true): Promise<void> {
    const selection = this.selection();
    if (!selection) return;
    const request = ++this.productRequest;
    this.productLoading.set(true);
    this.productError.set('');
    try {
      const result = await this.portal.RunBlMethodAsync<FactoryProductOption[]>(
        'GetFactoryProductsForUnknownGhamir',
        [selection.ghamirId, selection.expectedCode],
      );
      this.zone.run(() => {
        if (this.destroyed || request !== this.productRequest) return;
        if (!Array.isArray(result)) {
          this.productError.set('فهرست محصولات دریافت نشد.');
          return;
        }
        this.productOptions.set(result.filter((item) =>
          item != null && item.FactoryProductId != null &&
          String(item.FactoryProductId) !== '0' &&
          item.ProductId != null && String(item.ProductId) !== '0',
        ));
      });
    } catch (error) {
      this.zone.run(() => {
        if (this.destroyed || request !== this.productRequest) return;
        this.productError.set(this.productFailureMessage(error));
        if (reportErrors) this.reportProductError(this.productError());
      });
    } finally {
      this.zone.run(() => {
        if (!this.destroyed && request === this.productRequest) this.productLoading.set(false);
      });
    }
  }

  private productFailureMessage(error: unknown): string {
    const value = error as { message?: string; Message?: string; response?: { Message?: string } };
    const detail = typeof error === 'string'
      ? error : String(value?.message ?? value?.Message ?? value?.response?.Message ?? '');
    if (detail.includes('وضعیت قمیر'))
      return 'وضعیت قمیر تغییر کرده است؛ نما را تازه‌سازی کنید.';
    if (detail.includes('نگاشت') || detail.includes('کد اکنون'))
      return 'نگاشت این کد با محصول دیگری تعارض دارد؛ نما را تازه‌سازی کنید.';
    if (detail.includes('محصول انتخاب‌شده'))
      return 'محصول انتخاب‌شده معتبر نیست.';
    return 'خطا در دریافت یا ثبت محصول. نما را تازه‌سازی کنید.';
  }

  private reportProductError(message: string, refreshOptions = false): void {
    BarsaApi.Bw.Msg.Error(message, () => {
      if (this.destroyed) return;
      if (refreshOptions && this.selection()) {
        void this.loadProductOptions(false).finally(() => {
          if (!this.destroyed) this.refreshRequested.emit();
        });
      } else {
        this.refreshRequested.emit();
      }
    });
  }

  // --- data helpers (same field access as bu-kiln-rokh) --------------------
  ghamirIsFull(ghamir: MetaobjectDataModel): boolean {
    const isEmpty = this.ghamirField(ghamir, 'خالي است', 'IsEmpty');
    if (isEmpty == null) return asBoolean(ghamir.IsFull);
    return isEmpty === false || isEmpty === 0 ||
      isEmpty === '0' || isEmpty === 'false' || isEmpty === 'False';
  }

  private ghamirProductUnknown(ghamir: MetaobjectDataModel): boolean {
    return asBoolean(this.ghamirField(ghamir, 'محصول نامشخص است', 'IsProductUnknown'));
  }

  private ghamirField(ghamir: MetaobjectDataModel, caption: string, reportName: string): unknown {
    const fields = ghamir as Record<string, any>;
    const fieldName = fields['$FieldDict']?.[caption];
    return (fieldName ? fields[fieldName] : undefined) ??
      fields[caption] ?? fields[caption.replace(/ /g, '_')] ?? fields[reportName];
  }

  private ghamirProductName(ghamir: MetaobjectDataModel): string {
    return String(
      ghamir.Mahsol?.$Caption ??
        ghamir['Mahsol$Caption'] ??
        ghamir.A_Mahsol_F3?.$Caption ??
        ghamir.ProductName ??
        '',
    ).trim();
  }

  private ghamirHasAlarm(_ghamir: MetaobjectDataModel): boolean {
    return false;
  }

  sensorHasError(sensor: MetaobjectDataModel): boolean {
    return !!(
      asBoolean(sensor.Error) ||
      this.sensorHasCutAlarm(sensor) ||
      Number(sensor.Value) >= 1000
    );
  }

  sensorHasCutAlarm(sensor: MetaobjectDataModel): boolean {
    return (
      asBoolean(sensor.IsTransmitterGhat) ||
      asBoolean(sensor.TransmitterFailed) ||
      asBoolean(sensor.IsTermokoplGhat) ||
      asBoolean(sensor.TermokoplFailed)
    );
  }

  toggleCookValue(event: Event, sensor: SensorVM): void {
    event.stopPropagation();
    if (this.expandedCookNumbers.has(sensor.key)) {
      this.expandedCookNumbers.delete(sensor.key);
    } else {
      this.expandedCookNumbers.add(sensor.key);
    }
    this.sensorVMs.update((items) =>
      items.map((item) =>
        item.key === sensor.key
          ? {
              ...item,
              cookVisible:
                item.cookInvalid || this.expandedCookNumbers.has(item.key),
            }
          : item,
      ),
    );
  }

  onSensorKeydown(event: KeyboardEvent, sensor: SensorVM): void {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    this.toggleCookValue(event, sensor);
  }

  private temperatureText(sensor: MetaobjectDataModel): string {
    const value = Number(sensor.Value);
    if (value >= 10000) return '***';
    if (!Number.isFinite(value)) return String(sensor.Value ?? '');
    return String(Math.round(value));
  }

  private numericText(value: unknown): string {
    const numericValue = Number(value);
    return Number.isFinite(numericValue)
      ? String(Math.round(numericValue))
      : String(value ?? '');
  }

  private valveFill(sensor: MetaobjectDataModel): string {
    const rawMode = sensor.HalatShir;
    const caption = String(sensor['HalatShir$Caption'] ?? '');
    const isManual =
      caption.includes('دستی') ||
      rawMode === false ||
      rawMode === 0 ||
      rawMode === '0' ||
      rawMode === 3 ||
      rawMode === '3';

    return isManual ? '#b82318' : '#00a42b';
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function asBoolean(value: unknown): boolean {
  return (
    value === true ||
    value === 1 ||
    value === '1' ||
    value === 'true' ||
    value === 'True'
  );
}

function lighten(hex: string, amount: number): string {
  const value = hex.replace('#', '');
  const r = Math.min(255, parseInt(value.slice(0, 2), 16) + amount);
  const g = Math.min(255, parseInt(value.slice(2, 4), 16) + amount);
  const b = Math.min(255, parseInt(value.slice(4, 6), 16) + amount);
  return `rgb(${r}, ${g}, ${b})`;
}
