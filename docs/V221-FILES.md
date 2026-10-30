# V2.2.1 — arquivos da entrega

Comparação com a main aprovada `05d7c63`, branch `fix/alys-v2-2-1-ios-sync-customers`. Arquivos locais de ambiente, logs, credenciais e traces Playwright não fazem parte da entrega. Migrations 001–025 são preservadas.

## Aplicação, fotos e clientes

- [src/app/(protected)/customers/[id]/page.tsx](../src/app/(protected)/customers/[id]/page.tsx)
- [src/app/(protected)/more/page.tsx](../src/app/(protected)/more/page.tsx)
- [src/app/(protected)/pools/page.tsx](../src/app/(protected)/pools/page.tsx)
- [src/app/api/customers/route.ts](../src/app/api/customers/route.ts)
- [src/app/api/system-health/route.ts](../src/app/api/system-health/route.ts)
- [src/app/globals.css](../src/app/globals.css)
- [src/components/customer-manager.tsx](../src/components/customer-manager.tsx)
- [src/components/customer-onboarding.tsx](../src/components/customer-onboarding.tsx)
- [src/components/customer-tabs.tsx](../src/components/customer-tabs.tsx)
- [src/components/field/field-app.tsx](../src/components/field/field-app.tsx)
- [src/components/field/field.css](../src/components/field/field.css)
- [src/components/field/service-controls.tsx](../src/components/field/service-controls.tsx)
- [src/components/field/sync-notice.tsx](../src/components/field/sync-notice.tsx)
- [src/components/shell.tsx](../src/components/shell.tsx)
- [src/lib/customer-management.ts](../src/lib/customer-management.ts)
- [src/lib/customer-summary.ts](../src/lib/customer-summary.ts)
- [src/lib/field/photos.ts](../src/lib/field/photos.ts)
- [src/lib/i18n/messages.json](../src/lib/i18n/messages.json)
- [src/lib/offline/store.ts](../src/lib/offline/store.ts)
- [src/lib/offline/upload.ts](../src/lib/offline/upload.ts)

## PWA e versão

- [package-lock.json](../package-lock.json)
- [package.json](../package.json)
- [public/sw.js](../public/sw.js)

## Testes

- [playwright.config.ts](../playwright.config.ts)
- [tests/customer-summary.test.ts](../tests/customer-summary.test.ts)
- [tests/email.test.ts](../tests/email.test.ts)
- [tests/integration/fast-technician.spec.ts](../tests/integration/fast-technician.spec.ts)
- [tests/integration/offline-shell.spec.ts](../tests/integration/offline-shell.spec.ts)
- [tests/integration/route.spec.ts](../tests/integration/route.spec.ts)
- [tests/integration/v21-release.spec.ts](../tests/integration/v21-release.spec.ts)
- [tests/integration/v211-hotfix.spec.ts](../tests/integration/v211-hotfix.spec.ts)
- [tests/integration/v22-design.spec.ts](../tests/integration/v22-design.spec.ts)
- [tests/integration/v221-cached-photos.spec.ts](../tests/integration/v221-cached-photos.spec.ts)
- [tests/integration/v221-recovery.spec.ts](../tests/integration/v221-recovery.spec.ts)
- [tests/offline.test.ts](../tests/offline.test.ts)
- [tests/photo-lifecycle.test.ts](../tests/photo-lifecycle.test.ts)
- [tests/service-worker.test.ts](../tests/service-worker.test.ts)
- [tests/upload.test.ts](../tests/upload.test.ts)

## Documentação e capturas

- [README.md](../README.md)
- [docs/LOCAL-DEVELOPMENT.md](../docs/LOCAL-DEVELOPMENT.md)
- [docs/V221-FILES.md](../docs/V221-FILES.md)
- [docs/V221-IOS-SYNC-CUSTOMERS.md](../docs/V221-IOS-SYNC-CUSTOMERS.md)
- [docs/screenshots/v221/after-customer-history.png](../docs/screenshots/v221/after-customer-history.png)
- [docs/screenshots/v221/after-customer-overview.png](../docs/screenshots/v221/after-customer-overview.png)
- [docs/screenshots/v221/after-customer-properties.png](../docs/screenshots/v221/after-customer-properties.png)
- [docs/screenshots/v221/after-customer-service.png](../docs/screenshots/v221/after-customer-service.png)
- [docs/screenshots/v221/after-customers.png](../docs/screenshots/v221/after-customers.png)
- [docs/screenshots/v221/before-customers.png](../docs/screenshots/v221/before-customers.png)
- [docs/screenshots/v221/before-profile.png](../docs/screenshots/v221/before-profile.png)
- [docs/screenshots/v221/sync-auth-required.png](../docs/screenshots/v221/sync-auth-required.png)
- [docs/screenshots/v221/sync-confirmed-history.png](../docs/screenshots/v221/sync-confirmed-history.png)
- [docs/screenshots/v221/sync-failed-photo.png](../docs/screenshots/v221/sync-failed-photo.png)
