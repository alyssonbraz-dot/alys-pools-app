import {describe,it,expect} from 'vitest';
import {translate,translateAttribute,normalizeLanguage,formatDate} from '../src/lib/i18n/core';
describe('local interface languages',()=>{
 it('defaults to English without browser automatic switching',()=>{expect(normalizeLanguage(undefined)).toBe('en');expect(normalizeLanguage('fr')).toBe('en');expect(translate('Today’s Route','en')).toBe('Today’s Route');});
 it('supports Portuguese and Spanish and leaves names/notes untouched',()=>{expect(translate('Today’s Route','pt')).toBe('Rota de hoje');expect(translate('Customers','es')).toBe('Clientes');expect(translate('Fictional Smith Residence','pt')).toBe('Fictional Smith Residence');});
 it('formats dynamic counts and preserves captured values literally',()=>{expect(translate('View 3 earlier services','pt')).toBe('Ver 3 serviços anteriores');expect(translate('7 remaining','es')).toBe('7 restantes');expect(translate('Pool $&: pH is required.','pt')).toBe('Pool $&: pH é obrigatório.');});
 it('localizes reading accessibility labels while keeping the pool name',()=>{expect(translateAttribute('Demo Pool Free Chlorine (ppm)','pt')).toBe('Demo Pool Cloro livre (ppm)');});
 it('keeps Florida service day when changing display locale',()=>{expect(formatDate('2026-01-01T02:00:00Z','pt',{dateStyle:'long'})).toContain('31 de dezembro de 2025');});
});
