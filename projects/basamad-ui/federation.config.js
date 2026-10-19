const { withNativeFederation, share } = require('@angular-architects/native-federation/config');

module.exports = withNativeFederation({
    name: 'BasamadUi',

    exposes: {
        // نقشه‌ی کامل کامپوننت‌ها + خود ماژول (DynamicComponentService میزبان این map رو لود می‌کنه)
        './ComponentMap':  './projects/basamad-ui/src/public-api.ts',
        './BasamadUiModule': './projects/basamad-ui/src/lib/basamad-ui.module.ts',

        // تک‌تک کامپوننت‌ها برای لود مستقیم از سمت host
        './MonitoringKoreh':            './projects/basamad-ui/src/lib/monitoring-koreh/monitoring-koreh.component.ts',
        './MonitoringKorehItem':        './projects/basamad-ui/src/lib/monitoring-koreh-item/monitoring-koreh-item.component.ts',
        './PokhtbanKlinOnlineMonitoring': './projects/basamad-ui/src/lib/pokhtban-klin-online-monitoring/pokhtban-klin-online-monitoring.component.ts',
        './PokhtProgress':              './projects/basamad-ui/src/lib/monitoring-koreh-item/pokht-progress/pokht-progress.component.ts',
        './CircleProgress':             './projects/basamad-ui/src/lib/pokhtban-klin-online-monitoring/circle-progress/circle-progress.component.ts',
        './ChartJabejay':               './projects/basamad-ui/src/lib/chart-jabejay/chart-jabejay.component.ts',
        './GroupedBarChart':            './projects/basamad-ui/src/lib/grouped-bar-chart/grouped-bar-chart.component.ts',
        './KilnAligner':                './projects/basamad-ui/src/lib/kiln-aligner/kiln-aligner.component.ts',
        './KilnRokh':                   './projects/basamad-ui/src/lib/kiln-rokh/kiln-rokh.ts',
        './CookingCharts':              './projects/basamad-ui/src/lib/cooking/cooking-charts.component.ts'
    },

    // این فهرست باید دقیقاً با host یکی بمونه تا نمونه‌ی Angular/rxjs/barsa مشترک بمونه (رفع NG0203/NG0201).
    // ⚠️ share(...) لازمه: پردازش includeSecondaries فقط داخل share() انجام می‌شه.
    shared: share({
        '@angular/core':             { singleton: true, strictVersion: false, requiredVersion: 'auto', includeSecondaries: true },
        '@angular/common':           { singleton: true, strictVersion: false, requiredVersion: 'auto', includeSecondaries: true },
        '@angular/common/http':      { singleton: true, strictVersion: false, requiredVersion: 'auto' },
        '@angular/platform-browser': { singleton: true, strictVersion: false, requiredVersion: 'auto', includeSecondaries: true },
        '@angular/router':           { singleton: true, strictVersion: false, requiredVersion: 'auto' },
        '@angular/forms':            { singleton: true, strictVersion: false, requiredVersion: 'auto' },
        '@angular/animations':       { singleton: true, strictVersion: false, requiredVersion: 'auto', includeSecondaries: true },
        '@angular/service-worker':   { singleton: true, strictVersion: false, requiredVersion: 'auto' },
        'rxjs':                      { singleton: true, strictVersion: false, requiredVersion: 'auto', includeSecondaries: true },
        'tslib':                     { singleton: true, strictVersion: false, requiredVersion: 'auto' },
        // barsa-novin-ray-core توکن‌های DI و DynamicComponentService رو نگه می‌داره؛ باید با host singleton بمونه.
        'barsa-novin-ray-core':      { singleton: true, strictVersion: false, requiredVersion: 'auto' }
    }),

    // چون این workspace هیچ lib داخلیِ tsconfig-paths نداره (همه‌ی barsa از node_modules میان)،
    // این باید خالی بمونه؛ وگرنه native-federation دنبال dist های ناموجود می‌گرده و «invalid path mapping» می‌ده.
    sharedMappings: [],

    skip: [
        'rxjs/ajax',
        'rxjs/fetch',
        'rxjs/testing',
        'rxjs/webSocket'
        // نکته: barsa-chat اینجا skip نمی‌شه؛ به‌جاش یک stub محلی (stubs/barsa-chat) به‌صورت
        // وابستگی file: نصب شده تا import('barsa-chat') داخل barsa-sap-ui در همه‌ی pass های esbuild
        // (از جمله bundling پکیج‌های shared) قابل resolve باشه. فیچر چت هیچوقت اجرا نمی‌شه.
    ],

    features: {
        // false: تا Sheriff کل گراف workspace رو آنالیز نکنه (dist بقیه lib ها ساخته نشده).
        ignoreUnusedDeps: false
    }
});
