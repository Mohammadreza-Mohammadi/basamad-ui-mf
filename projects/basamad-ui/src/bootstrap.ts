// این فایل صرفاً برای dev-server محلی (ng serve basamad-ui-mf) استفاده می‌شه تا کامپوننت‌های
// basamad-ui در حالت مستقل تست بشن. در حالت remote واقعی هیچوقت اجرا نمی‌شه چون host فقط از
// exposedModule ها (./ComponentMap و ...) استفاده می‌کنه، نه از این باندل bootstrap.
import { HttpClient } from '@angular/common/http';
import { Component, ErrorHandler, importProvidersFrom, Injectable, signal } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { BasamadUiModule } from './lib/basamad-ui.module';
import { ControlUiPipe, LocalStorageService } from 'barsa-novin-ray-core';

// در اپ واقعی این global ها توسط اسکریپت‌های legacy میزبان ست می‌شن. این dev-harness مستقل
// هیچکدوم رو نداره، پس شیء خالی می‌ذاریم تا optional chaining ها (?.) کرش نکنن.
for (const g of ['Common', 'Ul', 'Ui', 'Util', 'Bw', 'BBB', 'LoginAction', 'UlvMainCtrl', 'Ext', 'Offline', 'GanttChartHelper']) {
    if (!(g in window)) (window as any)[g] = {};
}

const tryGetValue = (source: any, path: string, fallback?: any): any => {
    const value = path
        .split('.')
        .reduce((current, key) => current == null ? undefined : current[key], source);

    return value == null ? fallback : value;
};

(window as any).Common.Util ??= {};
(window as any).Common.Util.TryGetValue ??= tryGetValue;
(window as any).Util.TryGetValue ??= tryGetValue;

@Injectable()
class DevErrorHandler implements ErrorHandler {
    handleError(error: any): void {
        console.error(error);

        let overlay = document.querySelector<HTMLPreElement>('#dev-error-overlay');
        if (!overlay) {
            overlay = document.createElement('pre');
            overlay.id = 'dev-error-overlay';
            Object.assign(overlay.style, {
                position: 'fixed',
                inset: '1rem',
                zIndex: '999999',
                overflow: 'auto',
                margin: '0',
                padding: '1rem',
                direction: 'ltr',
                color: '#fff',
                background: '#7a0017',
                border: '2px solid #ff8f8f',
                whiteSpace: 'pre-wrap',
            });
            document.body.appendChild(overlay);
        }

        overlay.textContent = error?.stack ?? error?.message ?? String(error);
    }
}

@Component({
    selector: 'bu-dev-harness',
    standalone: true,
    imports: [BasamadUiModule],
    template: `
        <main class="dev-harness" dir="rtl">
            @if (sampleData(); as sample) {
                <bu-monitoring-koreh
                    [mo]="sample"
                    [fieldDict]="sample.$FieldDict"
                    [deviceSize]="'xl'"
                    [isMobile]="false"
                    [standalone]="true"
                />
            } @else if (loadError()) {
                <section class="state state--error">
                    <h2>بارگذاری داده نمونه ناموفق بود</h2>
                    <p>{{ loadError() }}</p>
                </section>
            } @else {
                <section class="state">در حال بارگذاری داده نمونه کوره…</section>
            }
        </main>
    `,
    styles: [`
        :host {
            display: block;
            min-height: 100vh;
            background: #000;
        }

        .dev-harness {
            min-height: 100vh;
            font-family: Tahoma, Arial, sans-serif;
        }

        .state {
            padding: 2rem;
            color: #f2bb05;
            text-align: center;
        }

        .state--error {
            color: #ff8f8f;
        }
    `]
})
export class DevHarnessComponent {
    readonly sampleData = signal<any | null>(null);
    readonly loadError = signal('');

    constructor(http: HttpClient) {
        http.get<any>('mock-data/monitoring-koreh.json').subscribe({
            next: (sample) => this.sampleData.set(sample),
            error: (error) => this.loadError.set(error?.message ?? String(error)),
        });
    }
}

bootstrapApplication(DevHarnessComponent, {
    providers: [
        provideHttpClient(),
        provideRouter([]),
        provideAnimations(),
        ControlUiPipe,
        LocalStorageService,
        { provide: ErrorHandler, useClass: DevErrorHandler },
        importProvidersFrom(BasamadUiModule)
    ]
}).catch((err) => console.error(err));
