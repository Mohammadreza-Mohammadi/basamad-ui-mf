import { Directive, ElementRef, OnInit, Renderer2 } from '@angular/core';
import { BaseDirective, getDeviceIsMobile } from 'barsa-novin-ray-core';


@Directive({
    selector: '[buSafeHtml]',
  standalone:false

})
export class SafeHtmlDirective extends BaseDirective implements OnInit {
    constructor(protected _el: ElementRef, private _renderer2: Renderer2) {
        super(_el);
    }
    ngOnInit(): void {
        super.ngOnInit();
        const isMobile = getDeviceIsMobile();
        if (!isMobile) {
            return;
        }
        const dom = this._el.nativeElement as HTMLElement;
        this._renderer2.addClass(dom, 'mobile');
    }
}
