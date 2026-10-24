import {expect,it} from 'vitest';
import {chemistryPeriod,groupChemistry,type ChemistryRow} from '../src/lib/field/chemistry';
it('uses 30 calendar days across month and DST boundaries',()=>{expect(chemistryPeriod('2026-03-09')).toEqual({from:'2026-02-08',through:'2026-03-09'});});
it('separates pools, preserves zero readings and actual doses, and excludes older/future Florida days',()=>{
 const row=(id:string,pool:string,time:string):ChemistryRow=>({visit_id:id,pool_id:pool,completed_at:time,readings:{fc:0,ph:7.4},dosages:[{product:'Liquid Chlorine',quantity:0.5,unit:'gal'}]});
 const rows=[row('recent','main','2026-10-23T12:00:00Z'),row('older','main','2026-09-24T04:00:00Z'),row('outside','main','2026-09-24T03:59:59Z'),row('future','main','2026-10-24T04:00:00Z'),row('spa','spa','2026-10-22T12:00:00Z')];
 const grouped=groupChemistry([...rows,rows[0]],'2026-10-23');
 expect(grouped.main.map(e=>e.visit_id)).toEqual(['recent','older']);
 expect(grouped.main[0].readings.fc).toBe(0);expect(grouped.main[0].dosages[0].quantity).toBe(0.5);
 expect(grouped.spa).toHaveLength(1);
});
