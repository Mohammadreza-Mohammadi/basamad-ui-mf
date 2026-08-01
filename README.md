# basamad-ui-mf

`basamad-ui` به‌صورت یک **Native Federation remote** مستقل — الگوبرداری‌شده از `BarsaSvgMapReport`
(در ریپوی `ng-web-systemsaz-1`) اما به‌عنوان یک workspace کاملاً جدا و مستقل با گیت خودش.

روی **Angular 22** ساخته شده (منطبق با پروژه‌ی میزبان `ng-web-systemsaz-1` و وابستگی‌های `barsa-*` / `@fundamental-ngx`).

## پروژه‌ها (`angular.json`)

- `basamad-ui` — کتابخانه (خروجی npm با `ng-packagr`).
- `basamad-ui-mf` — همان سورس، ولی به‌صورت remote فدریشن (`@angular-architects/native-federation`).

## دستورها

```bash
npm install

# build خروجی remote (dist/basamad-ui-mf) — remoteEntry.json اینجا ساخته می‌شه
npm run build
# versioned zip: remote-entries/basamad-ui/v<version>/basamad-ui-v<version>.zip
# each production build automatically increments the patch version

# dev-server محلی روی پورت 4202
npm run serve

# build کتابخانه‌ی npm
npm run build:lib
```

## چیزهایی که expose می‌شن (`projects/basamad-ui/federation.config.js`)

- `./ComponentMap` — از `public-api.ts` (شامل `COMPONENT_MAP` کامل + همه‌ی export ها)
- `./BasamadUiModule` — کل NgModule
- هر کامپوننت به‌صورت جدا: `./MonitoringKoreh`, `./ChartJabejay`, `./KilnRokh`, ...

## نکته‌ی مصرف در host

remote با نام `BasamadUi` منتشر می‌شه. host باید همین نسخه‌های `@angular/*`، `rxjs`،
`barsa-novin-ray-core` و `barsa-sap-ui` رو به‌صورت singleton share کنه تا `NG0203/NG0201` نده.
