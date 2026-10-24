import { describe,it,expect } from 'vitest';
import { revenue,recurringDays,floridaDate } from '../src/lib/domain';
import { customerSchema,poolSchema,visitSchema } from '../src/lib/validation';
describe('receitas separadas',()=>{
 it('exclui subcontratos e inativos do MRR próprio',()=>{
 expect(revenue([
 {source:'own',billing_model:'monthly',price_cents:14000,status:'active'},
 {source:'own',billing_model:'monthly',price_cents:99999,status:'inactive'},
 {source:'subcontract',billing_model:'per_visit',price_cents:4500,status:'active'},
 {source:'subcontract',billing_model:'fixed_contract',price_cents:30000,status:'active'},
 {source:'subcontract',billing_model:'monthly',price_cents:50000,status:'active'}
 ])).toEqual({ownMrrCents:14000,subcontractMonthlyCents:50000});
 });
});
it('recorrência remove duplicatas e valida dias',()=>{expect(recurringDays([5,1,1,3])).toEqual([1,3,5]);expect(()=>recurringDays([7])).toThrow();});
it('data respeita Flórida na virada do dia',()=>{expect(floridaDate(new Date('2026-01-01T02:00:00Z'))).toContain('December 31, 2025');});
it('rejeita nome vazio, email inválido e volume não positivo',()=>{
 expect(customerSchema.safeParse({name:' ',email:'bad',phone:'',status:'active'}).success).toBe(false);
 expect(poolSchema.safeParse({property_id:'00000000-0000-4000-8000-000000000001',name:'Spa',gallons:'0',water_type:'salt',type:'spa',status:'active'}).success).toBe(false);
});
it('valida leituras antes do futuro registro de visita',()=>{
 const reading={pool_id:'00000000-0000-4000-8000-000000000001',free_chlorine_ppm:3,ph:7.4,alkalinity_ppm:80};
 expect(visitSchema.safeParse(reading).success).toBe(true);
 expect(visitSchema.safeParse({...reading,ph:15}).success).toBe(false);
});
