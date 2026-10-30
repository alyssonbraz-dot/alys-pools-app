# V2.2 — arquivos alterados

Comparação com a main aprovada `ee6399d`. Arquivos novos e modificados na branch `feature/alys-v2-2-complete-redesign`. Segredos, fixtures locais e resultados temporários não integram a entrega.

## Aplicação e componentes

- [src/app/(protected)/finance/page.tsx](../src/app/(protected)/finance/page.tsx)
- [src/app/(protected)/more/page.tsx](../src/app/(protected)/more/page.tsx)
- [src/app/(protected)/page.tsx](../src/app/(protected)/page.tsx)
- [src/app/(protected)/reports/page.tsx](../src/app/(protected)/reports/page.tsx)
- [src/app/(protected)/route/page.tsx](../src/app/(protected)/route/page.tsx)
- [src/app/(protected)/service/page.tsx](../src/app/(protected)/service/page.tsx)
- [src/app/(protected)/stops/page.tsx](../src/app/(protected)/stops/page.tsx)
- [src/app/(protected)/visit/[id]/page.tsx](../src/app/(protected)/visit/[id]/page.tsx)
- [src/app/api/stops/route.ts](../src/app/api/stops/route.ts)
- [src/app/api/system-health/route.ts](../src/app/api/system-health/route.ts)
- [src/app/globals.css](../src/app/globals.css)
- [src/app/join/page.tsx](../src/app/join/page.tsx)
- [src/app/not-found.tsx](../src/app/not-found.tsx)
- [src/app/offline/page.tsx](../src/app/offline/page.tsx)
- [src/components/company-settings.tsx](../src/components/company-settings.tsx)
- [src/components/customer-onboarding.tsx](../src/components/customer-onboarding.tsx)
- [src/components/design/bottom-sheet.tsx](../src/components/design/bottom-sheet.tsx)
- [src/components/design/icon.tsx](../src/components/design/icon.tsx)
- [src/components/design/primitives.tsx](../src/components/design/primitives.tsx)
- [src/components/design/viewport-runtime.tsx](../src/components/design/viewport-runtime.tsx)
- [src/components/device-sync-summary.tsx](../src/components/device-sync-summary.tsx)
- [src/components/field/chemical-entry.tsx](../src/components/field/chemical-entry.tsx)
- [src/components/field/chemistry-history.tsx](../src/components/field/chemistry-history.tsx)
- [src/components/field/current-pool.tsx](../src/components/field/current-pool.tsx)
- [src/components/field/field-app.tsx](../src/components/field/field-app.tsx)
- [src/components/field/field.css](../src/components/field/field.css)
- [src/components/field/history.tsx](../src/components/field/history.tsx)
- [src/components/field/offline-workspace.tsx](../src/components/field/offline-workspace.tsx)
- [src/components/field/service-controls.tsx](../src/components/field/service-controls.tsx)
- [src/components/route-date-navigation.tsx](../src/components/route-date-navigation.tsx)
- [src/components/shell.tsx](../src/components/shell.tsx)
- [src/components/ui.tsx](../src/components/ui.tsx)
- [src/lib/chemical-entry.ts](../src/lib/chemical-entry.ts)
- [src/lib/field/data.ts](../src/lib/field/data.ts)
- [src/lib/field/navigation.ts](../src/lib/field/navigation.ts)
- [src/lib/field/types.ts](../src/lib/field/types.ts)
- [src/lib/field/validation.ts](../src/lib/field/validation.ts)
- [src/lib/i18n/messages.json](../src/lib/i18n/messages.json)

## Banco aditivo e testes

- [supabase/migrations/202610300025_route_skip_events.sql](../supabase/migrations/202610300025_route_skip_events.sql)
- [supabase/tests/v22_skips.sql](../supabase/tests/v22_skips.sql)

## Testes de interface e configuração

- [playwright.config.ts](../playwright.config.ts)
- [tests/chemical-entry.test.ts](../tests/chemical-entry.test.ts)
- [tests/demo/local-demo.spec.ts](../tests/demo/local-demo.spec.ts)
- [tests/field-navigation.test.ts](../tests/field-navigation.test.ts)
- [tests/integration/fast-technician.spec.ts](../tests/integration/fast-technician.spec.ts)
- [tests/integration/offline-shell.spec.ts](../tests/integration/offline-shell.spec.ts)
- [tests/integration/review-fixes.spec.ts](../tests/integration/review-fixes.spec.ts)
- [tests/integration/route.spec.ts](../tests/integration/route.spec.ts)
- [tests/integration/v2-workflows.spec.ts](../tests/integration/v2-workflows.spec.ts)
- [tests/integration/v21-release.spec.ts](../tests/integration/v21-release.spec.ts)
- [tests/integration/v211-hotfix.spec.ts](../tests/integration/v211-hotfix.spec.ts)
- [tests/integration/v211-mobile.spec.ts](../tests/integration/v211-mobile.spec.ts)
- [tests/integration/v212-mobile.spec.ts](../tests/integration/v212-mobile.spec.ts)
- [tests/integration/v22-design.spec.ts](../tests/integration/v22-design.spec.ts)

## Demonstração local

- [demo/README.md](../demo/README.md)
- [demo/app.js](../demo/app.js)
- [demo/index.html](../demo/index.html)
- [demo/styles.css](../demo/styles.css)
- [demo/template.html](../demo/template.html)

## Documentação e evidências

- [README.md](../README.md)
- [docs/LOCAL-DEVELOPMENT.md](../docs/LOCAL-DEVELOPMENT.md)
- [docs/V22-FILES.md](../docs/V22-FILES.md)
- [docs/V22-PERFORMANCE.json](../docs/V22-PERFORMANCE.json)
- [docs/V22-REDESIGN.md](../docs/V22-REDESIGN.md)
- [docs/screenshots/v22/after-current-pool.png](../docs/screenshots/v22/after-current-pool.png)
- [docs/screenshots/v22/after-customers.png](../docs/screenshots/v22/after-customers.png)
- [docs/screenshots/v22/after-dashboard.png](../docs/screenshots/v22/after-dashboard.png)
- [docs/screenshots/v22/after-history.png](../docs/screenshots/v22/after-history.png)
- [docs/screenshots/v22/after-more.png](../docs/screenshots/v22/after-more.png)
- [docs/screenshots/v22/after-service.png](../docs/screenshots/v22/after-service.png)
- [docs/screenshots/v22/after-sync-recovery.png](../docs/screenshots/v22/after-sync-recovery.png)
- [docs/screenshots/v22/before-customers.png](../docs/screenshots/v22/before-customers.png)
- [docs/screenshots/v22/before-dashboard.png](../docs/screenshots/v22/before-dashboard.png)
- [docs/screenshots/v22/before-history.png](../docs/screenshots/v22/before-history.png)
- [docs/screenshots/v22/before-service.png](../docs/screenshots/v22/before-service.png)

## Versão do pacote

- [package-lock.json](../package-lock.json)
- [package.json](../package.json)
