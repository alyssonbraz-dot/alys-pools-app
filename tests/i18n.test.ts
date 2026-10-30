import {describe,it,expect} from 'vitest';
import {translate,translateAttribute,normalizeLanguage,formatDate} from '../src/lib/i18n/core';
describe('local interface languages',()=>{
 it('defaults to English without browser automatic switching',()=>{expect(normalizeLanguage(undefined)).toBe('en');expect(normalizeLanguage('fr')).toBe('en');expect(translate('Today’s Route','en')).toBe('Today’s Route');});
 it('supports Portuguese and Spanish and leaves names/notes untouched',()=>{expect(translate('Today’s Route','pt')).toBe('Rota de hoje');expect(translate('Customers','es')).toBe('Clientes');expect(translate('Fictional Smith Residence','pt')).toBe('Fictional Smith Residence');});
 it('formats dynamic counts and preserves captured values literally',()=>{expect(translate('View 3 earlier services','pt')).toBe('Ver 3 serviços anteriores');expect(translate('7 remaining','es')).toBe('7 restantes');expect(translate('Pool $&: pH is required.','pt')).toBe('Pool $&: pH é obrigatório.');});
 it('localizes reading accessibility labels while keeping the pool name',()=>{expect(translateAttribute('Demo Pool Free Chlorine (ppm)','pt')).toBe('Demo Pool Cloro livre (ppm)');});
 it('keeps Florida service day when changing display locale',()=>{expect(formatDate('2026-01-01T02:00:00Z','pt',{dateStyle:'long'})).toContain('31 de dezembro de 2025');});
});

import {formatNumber} from '../src/lib/i18n/core';
it('formats USD and quantities for each interface language without changing values',()=>{expect(formatNumber(1234.5,'pt',{style:'currency',currency:'USD'})).toContain('1.234,50');expect(formatNumber(1234.5,'en',{style:'currency',currency:'USD'})).toBe('$1,234.50');expect(formatNumber(1234.5,'es',{maximumFractionDigits:1})).toBe('1,234.5');expect(normalizeLanguage('es')).toBe('es');expect(translate('Next Day →','pt')).toBe('Próximo dia →');expect(translate('Next Day →','es')).toBe('Día siguiente →');});
it('translates dynamic validation readings and preserves pool names while switching languages',()=>{const text='Fictional Pool: Free Chlorine (ppm) is required.';expect(translate(text,'pt')).toBe('Fictional Pool: Cloro livre (ppm) é obrigatório.');expect(translate(text,'es')).toBe('Fictional Pool: Cloro libre (ppm) es obligatorio.');expect(translate('Fictional Pool: one service photo is required.','es')).not.toContain('service photo');});
it('replaces native network failures with user-facing copy in all languages',()=>{for(const lang of ['en','pt','es'] as const){expect(translate('Failed to fetch',lang)).not.toBe('Failed to fetch');expect(translate('Load failed',lang)).not.toBe('Load failed');}});
