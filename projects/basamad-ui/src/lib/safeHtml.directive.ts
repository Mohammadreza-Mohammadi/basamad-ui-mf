import { Directive, OnInit } from '@angular/core';
import { BaseDirective, getDeviceIsMobile } from 'barsa-novin-ray-core';


@Directive({
    selector: '[buSafeHtml]',
  standalone:false

})
export class SafeHtmlDirective extends BaseDirective implements OnInit {
    // barsa-novin-ray-core جدید: BaseDirective خودش _el و _renderer2 رو با inject() تأمین می‌کنه و
    // constructorش بدون آرگومانه؛ پس constructor سفارشی حذف شد و از فیلدهای protected ارث‌بری‌شده استفاده می‌شه.
    override ngOnInit(): void {
        super.ngOnInit();
        const isMobile = getDeviceIsMobile();
        if (!isMobile) {
            return;
        }
        const dom = this._el.nativeElement as HTMLElement;
        this._renderer2.addClass(dom, 'mobile');
    }
}
