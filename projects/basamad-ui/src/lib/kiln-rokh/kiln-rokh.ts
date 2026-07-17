import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  inject,
  Input,
  Output,
  SimpleChanges,
  ViewChild,
  ViewEncapsulation,
  AfterViewInit,
  OnDestroy,
  OnChanges,
  Renderer2,
  DOCUMENT,
} from '@angular/core';
import {
  AbbrevationDeviceSize,
  BaseComponent,
  measureText,
  measureTextBy,
  MetaobjectDataModel,
  MoReportValuePipe,
} from 'barsa-novin-ray-core';
import { Ghamir, Sensor } from '../models';
import { MapMoListToGhamirs } from '../constants';
import { fromEvent, Subscription } from 'rxjs';
import { debounceTime } from 'rxjs/operators';

@Component({
  selector: 'bu-kiln-rokh',
  standalone: false,
  templateUrl: './kiln-rokh.html',
  styleUrl: './kiln-rokh.scss',
})
export class KilnRokh
  extends BaseComponent
  implements AfterViewInit, OnChanges, OnDestroy
{
  @ViewChild('ghamirTrack', { static: true }) ghamirTrackRef!: ElementRef;
  @ViewChild('sensorTrack', { static: false }) sensorTrackRef!: ElementRef;
  @ViewChild('topshadowGap', { static: true }) topShadowGap!: ElementRef;

  @Input() mobile!: boolean;
  @Input() allColumns!: any[];
  @Input() rokhNumber!: number;
  @Input() title!: string;
  @Input() deviceSize!: AbbrevationDeviceSize;
  @Input() ghamirs!: MetaobjectDataModel[];
  @Input() transmitters!: MetaobjectDataModel[];
  @Output() zoom = new EventEmitter();
  @Input() mode: 'designer' | 'runtime' = 'designer';
  private dragging: { type: 'sensor' | 'ghamir'; id: string } | null = null;
  private dragOffsetX = 0;

  gapGhamir!: number;
  ghamirWidth!: number;
  ghamirRangeDamaWidth!: number;

  // css sizing strings (ke template/to css variables estefade mishe)
  fontSizeGhamir!: string;
  fontSizeAjorGhamir!: string;
  gradiantDamaFontsize!: string;
  valvesSize!: string;
  sizeAjorFontsize!: string;
  protected _el = inject(ElementRef);
  protected _renderer2 = inject(Renderer2);

  private resizeSub?: Subscription;
  private ro?: ResizeObserver;
  private document = inject(DOCUMENT);

  ngOnInit(): void {
    super.ngOnInit();
    this._setRelativeLeft();
    this.setOddShirNumber(this.transmitters);
  }
  ngAfterViewInit(): void {
    // شروع observables / observers
    // debounce روی resize برای کاهش بار
    if ('fonts' in this.document) {
      this.document.fonts.ready.then(() => {
        this._calculateFontSize();
        // موقعیت‌دهی مجازی‌ها
        requestAnimationFrame(() => this.adjustVirtualPositions());
      });
    }

    // 2. یک بازگشت به عقب (Fallback) ایمن برای مواقعی که API کار نمی‌کند یا فونت‌ها به سرعت لود می‌شوند
    // این کد مطمئن می‌شود محاسبه حداقل یک بار انجام شود.
    setTimeout(() => {
      this._calculateFontSize();
      // موقعیت‌دهی مجازی‌ها
      requestAnimationFrame(() => this.adjustVirtualPositions());
    }, 500); // 500 میلی‌ثانیه صبر می‌کنیم.

    this.resizeSub = fromEvent(window, 'resize')
      .pipe(debounceTime(80))
      .subscribe(() => {
        // محاسبه فونت و تنظیم مکان مجازی‌ها
        this._calculateFontSize();
        // موقعیت‌دهی مجازی‌ها
        requestAnimationFrame(() => this.adjustVirtualPositions());
      });

    // اگر container تغییر اندازه پیدا کرد (مثلاً parent تغییر کنه)
    try {
      this.ro = new ResizeObserver(() => {
        requestAnimationFrame(() => {
          this._calculateFontSize();
          this.adjustVirtualPositions();
        });
      });
      if (this._el?.nativeElement) {
        this.ro.observe(this._el.nativeElement);
      }
    } catch (e) {
      // مرورگرهای خیلی قدیمی ممکنه ResizeObserver نداشته باشند
      // در آنصورت rely به window resize می‌کنیم
      // no-op
    }

    // initial calc (با تاخیر کوتاه تا ngFor رندر شود)
    setTimeout(() => {
      this._calculateFontSize();
      this.adjustVirtualPositions();
    }, 0);
  }

  ngOnChanges(changes: SimpleChanges): void {
    super.ngOnChanges(changes);
    const { transmitters } = changes;
    if (transmitters && !transmitters.firstChange) {
      // بعد از تغییر داده‌ها محاسبه کن
      this.setOddShirNumber(transmitters.currentValue);
      setTimeout(() => {
        this._calculateFontSize();
        this.adjustVirtualPositions();
      }, 0);
    }
  }
  setOddShirNumber(transmitters): void {
    let shirNodeIndex = 0;
    transmitters.forEach((sensor) => {
      if (sensor.ShirNode > 0 && sensor.ShirNode < 100) {
        sensor.ShirNodeIsOdd = shirNodeIndex % 2 === 0;
        shirNodeIndex++;
      }
    });
  }

  ngOnDestroy(): void {
    if (this.resizeSub) this.resizeSub.unsubscribe();
    if (this.ro) this.ro.disconnect();
  }
  _setRelativeLeft(): void {
    this.transmitters.forEach((c, i) => {
      c.RelativeLeft = c.RelativeLeft || (i + 0.08) / this.transmitters.length;
    });
    this.ghamirs.forEach((c, i) => {
      c.RelativeLeft = c.RelativeLeft || (i + 0.08) / this.ghamirs.length;
    });
  }
  /**
   * محاسبهٔ دینامیک فونت/REM بر اساس عرض container و تعداد ghamirها
   * نتیجه در CSS variables روی root element کامپوننت نوشته می‌شود (همان که template و scss شما از آن استفاده می‌کنند)
   */
  _calculateFontSize(): void {
    try {
      // اگر دیتایی وجود نداره کاری نمی‌کنیم
      if (!this.ghamirs || this.ghamirs.length === 0) return;

      const rootEl: HTMLElement = this._el.nativeElement;
      const elWidth =
        rootEl.offsetWidth ||
        rootEl.getBoundingClientRect().width ||
        window.innerWidth;
      // مقداری حاشیه‌ی منطقی کم می‌کنیم تا overflow ایجاد نشود

      // فاصله بین ghamirها از CSS متغیر گرفته می‌شود
      const ghamirGapStr = getComputedStyle(document.body).getPropertyValue(
        '--ghamir-gap'
      );
      const ghamirGap = Number(ghamirGapStr.replace('px', '')) || 2;

      const containerRefWidth = Math.max(80, elWidth - ghamirGap * 2);
      const sensorCount = this.transmitters.length+2;
      const countOfGhamir = this.ghamirs.length + 2;

      rootEl.style.setProperty(
        '--topshadow-gap',
        `${ghamirGap / (sensorCount / countOfGhamir)}px`
      );

      // شروع متغیرها
      let remVal = 0.18; // rem اولیه (پایین‌تر باشه کارت‌ها رو خیلی ریز می‌کنه)
      const step = 0.005; // گام افزایش REM
      const maxRem = 2.5;

      // محاسبهٔ عرض تقریبی متن در هر "ghamir"
      // متن مرجع را '555' در نظر میگیریم (مثل کد اصلی شما)
      let fontSizeGhamir = remVal;
      while (true) {
        // measureText از core استفاده می‌شود
        const textWidthPx = measureTextBy(
          '10 سانتی',
          `${remVal}rem`,
          'sahel-fd'
        );

        const totalWidth = (textWidthPx + ghamirGap) * countOfGhamir;

        // اگر از عرض ظرف عبور کردیم، یک گام عقب برو و تموم کن
        if (totalWidth >= containerRefWidth) {
          fontSizeGhamir = Math.max(0.2, remVal - step); // حداقل 0.5rem
          break;
        }

        // افزایش rem و ادامه
        remVal += step;
        if (remVal > maxRem) {
          fontSizeGhamir = Math.min(maxRem, remVal);
          break;
        }
      }
      remVal = 0.18;
      let fontSizeSensor = remVal;
      while (true) {
        // measureText از core استفاده می‌شود
        const textWidthPx = measureTextBy('555', `${remVal}rem`, 'sahel-fd');
        const extraTextWidthPx2 = measureTextBy(
          '555',
          `${remVal}rem`,
          'sahel-fd'
        );

        const totalWidth =
          textWidthPx * sensorCount +
          this.topShadowGap.nativeElement.offsetWidth * sensorCount;

        // اگر از عرض ظرف عبور کردیم، یک گام عقب برو و تموم کن
        if (totalWidth >= elWidth - extraTextWidthPx2 * 2) {
          fontSizeSensor = Math.max(0.2, remVal - step); // حداقل 0.5rem
          break;
        }
        // افزایش rem و ادامه
        remVal += step;
        if (remVal > maxRem) {
          fontSizeSensor = Math.min(maxRem, remVal);
          break;
        }
      }

      // تبدیل و ست کردن CSS variables (همان اسامی که در استایل‌های شما استفاده می‌شد)
      // توجه: بعضی متغیرها را همانند کد قبلیت تنظیم کردم
      rootEl.style.setProperty('--klink-sizeAjor-size', `${fontSizeGhamir}rem`);

      const fontSizeAjorGhamir = `${Math.max(
        0.7,
        Math.min(1.4, fontSizeGhamir - 0.05)
      )}rem`;
      rootEl.style.setProperty('--klink-sizeAjor-fontsize', fontSizeAjorGhamir);
      this.sizeAjorFontsize = fontSizeAjorGhamir;

      rootEl.style.setProperty(
        '--klink-sizeAjor-nimeh-fontsize',
        `${fontSizeGhamir / 2}rem`
      );

      rootEl.style.setProperty(
        '--klink-gradiant-dama-fontsize',
        `calc(${fontSizeAjorGhamir} + var(--ghamir-gap) / 2)`
      );
      this.gradiantDamaFontsize = `calc(${fontSizeAjorGhamir} + var(--ghamir-gap) / 2)`;

      rootEl.style.setProperty(
        '--klink-ghamir-fontsize',
        `${Math.min(fontSizeGhamir, 1)}rem`
      );

      rootEl.style.setProperty(
        '--klink-valves-number-fontsize',
        `${Math.min(fontSizeGhamir, 1)}rem`
      );

      rootEl.style.setProperty(
        '--klink-valves-size',
        `${Math.min(fontSizeGhamir, 2)}rem`
      );
      this.valvesSize = `${Math.min(fontSizeGhamir, 2)}rem`;

      // sensor dama font
      rootEl.style.setProperty(
        '--klink-sensor-dama-fontsize',
        `${Math.min(fontSizeSensor, 2)}rem`
      );
      rootEl.style.setProperty(
        '--klink-sensor-dama-div-fontsize',
        `${Math.min(fontSizeSensor, 1)}rem`
      );

      rootEl.style.setProperty(
        '--klink-sensor-alarm-size',
        `${fontSizeGhamir}rem`
      );

      // محاسبه ابعاد ghamir و ghamirRangeDamaWidth مشابه کد قبلی
      this.ghamirWidth = Math.floor(
        (containerRefWidth - countOfGhamir * ghamirGap - ghamirGap) /
          countOfGhamir
      );
      this.ghamirRangeDamaWidth = Math.round(
        elWidth / Math.max(1, countOfGhamir)
      );
      // gapGhamir را هم می‌توانیم ثبت کنیم (در صورت نیاز)
      this.gapGhamir = ghamirGap;
      this._renderer2.setStyle(
        this.ghamirTrackRef.nativeElement,
        'height',
        this.ghamirTrackRef.nativeElement.firstChild.offsetHeight + 'px'
      );

      // اگر نیاز به تشخیص بهتر باشد، می‌توان scaleFactor را بر اساس viewport تنظیم کرد
    } catch (err) {
      // fail-safe: اگر خطایی پیش آمد، از مقادیر پیش‌فرض استفاده کن
      // console.warn('calc font size failed', err);
    }
  }

  /**
   * برای هر کارت بررسی می‌کند آیا عنصر virtual وجود دارد و اگر نزدیک لبه باشد کلاس left/right را تنظیم می‌کند.
   * این تابع فرض می‌کند در template شما (یا بعداً) عنصری با کلاس .sensor-virtual وجود دارد؛
   * در غیر اینصورت هیچ کاری انجام نخواهد شد و template اصلی‌تان نیاز به تغییر ندارد.
   */
  adjustVirtualPositions(): void {
    try {
      if (!this._el || !this._el.nativeElement) return;
      const rootRect = this._el.nativeElement.getBoundingClientRect();
      const vw = window.innerWidth;
      // تلاش می‌کنیم کارت‌ها را بر اساس کلاس موجود در template پیدا کنیم.
      // در template شما کارت‌های ghamir داخل .klin-ghamir-info رندر می‌شوند.
      const cards: NodeListOf<HTMLElement> =
        this._el.nativeElement.querySelectorAll('.klin-ghamir-info');

      cards.forEach((card: HTMLElement) => {
        // در template اولیه ممکن است مقدار مجازی یک عنصر مجزا نداشته باشه؛
        // ما سعی می‌کنیم دنبال .sensor-virtual (که در صورت اضافه بودن توسط template یا بعداً موجود است) بگردیم.
        const virt = card.querySelector(
          '.sensor-virtual'
        ) as HTMLElement | null;
        if (!virt) {
          // fallback: گاهی ممکن است virtual به شکل دیگری اضافه شده باشد؛ امتحان کن .sizeAjorText که زیر مقدار است
          // اما این fallback فقط در صورت نیاز فعال می‌شود. در غیر اینصورت از کار صرف‌نظر می‌شود.
          return;
        }

        const rect = card.getBoundingClientRect();
        const approxVirt = Math.min(80, vw * 0.06);
        if (rect.right + approxVirt > vw - 6) {
          virt.classList.add('left');
          virt.classList.remove('right');
        } else if (rect.left - approxVirt < 6) {
          virt.classList.add('right');
          virt.classList.remove('left');
        } else {
          virt.classList.remove('left', 'right');
        }
      });
    } catch (e) {
      // ignore
    }
  }

  /********** متدهای کمکی **********/
  onShowTransmitter(sensor: Sensor): void {
    // placeholder
  }
  onSabtChideman(ghamir: Ghamir): void {
    // placeholder
  }
  onSabtPokht(ghamir: Ghamir): void {
    // placeholder
  }
}
