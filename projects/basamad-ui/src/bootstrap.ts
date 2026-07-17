// این فایل صرفاً برای dev-server محلی (ng serve basamad-ui-mf) استفاده می‌شه تا کامپوننت‌های
// basamad-ui در حالت مستقل تست بشن. در حالت remote واقعی هیچوقت اجرا نمی‌شه چون host فقط از
// exposedModule ها (./ComponentMap و ...) استفاده می‌کنه، نه از این باندل bootstrap.
import { Component, importProvidersFrom } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { BasamadUiModule } from './lib/basamad-ui.module';

// در اپ واقعی این global ها توسط اسکریپت‌های legacy میزبان ست می‌شن. این dev-harness مستقل
// هیچکدوم رو نداره، پس شیء خالی می‌ذاریم تا optional chaining ها (?.) کرش نکنن.
for (const g of ['Common', 'Ul', 'Ui', 'Util', 'Bw', 'BBB', 'LoginAction', 'UlvMainCtrl', 'Ext', 'Offline', 'GanttChartHelper']) {
    if (!(g in window)) (window as any)[g] = {};
}

@Component({
    selector: 'bu-dev-harness',
    standalone: true,
    imports: [BasamadUiModule],
    template: `
        <div style="padding: 16px; direction: rtl; font-family: Tahoma, sans-serif;">
            <h3>Basamad UI — Dev Harness</h3>
            <p>این صفحه فقط برای dev-server محلیه؛ در حالت remote واقعی host از expose ها استفاده می‌کنه.</p>
        </div>
    `
})
export class DevHarnessComponent {}

bootstrapApplication(DevHarnessComponent, {
    providers: [
        provideHttpClient(),
        provideRouter([]),
        provideAnimations(),
        importProvidersFrom(BasamadUiModule)
    ]
}).catch((err) => console.error(err));
