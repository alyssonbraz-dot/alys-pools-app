import {it,expect} from 'vitest';
import {csvCell,customerManagementSchema} from '../src/lib/customer-management';
import {roadOrder,calculateDriving,floridaStart} from '../src/lib/routing';
it('CSV escapes quotes/newlines and prevents spreadsheet formula execution',()=>{expect(csvCell('=HYPERLINK("evil")')).toBe('"\'=HYPERLINK(""evil"")"');expect(csvCell('A\nB')).toBe('"A\nB"');expect(csvCell('+123')).toBe('"\'+123"');});
it('uses asymmetric road time matrix instead of straight-line costs',()=>{expect(roadOrder([[0,90,5],[10,0,4],[5,6,0]])).toEqual([0,2,1]);expect(()=>roadOrder([[0,null],[null,0]])).toThrow();});
it('accepts lead metadata but rejects cross-shaped coordinates and negative prices',()=>{
 const base={property_id:null,first_name:'Fictional',last_name:'Client',email:'test@example.test',phone:'',status:'lead',service_address:'Fictional address',property_name:'Demo',billing_address:'',internal_notes:'',monthly_price_cents:14000,service_frequency:2,assigned_technician_id:null,tags:['demo'],email_reports_enabled:false,latitude:null,longitude:null};
 expect(customerManagementSchema.safeParse(base).success).toBe(true);expect(customerManagementSchema.safeParse({...base,latitude:26}).success).toBe(false);expect(customerManagementSchema.safeParse({...base,monthly_price_cents:-1}).success).toBe(false);
});
it('returns actual provider distance, geometry and ordered arrivals',async()=>{
 const calls:string[]=[];const fetcher:typeof fetch=async(input)=>{const url=String(input);calls.push(url);return Response.json(url.includes('/table/')?{code:'Ok',durations:[[0,90,5],[10,0,4],[5,6,0]]}:{code:'Ok',routes:[{distance:1609.344,duration:120,geometry:{coordinates:[[-80.1,26.1],[-80.2,26.2],[-80.3,26.3]]},legs:[{distance:800,duration:60},{distance:809.344,duration:60}]}]});};
 const stops=[1,2,3].map(n=>({id:String(n),latitude:26+n/100,longitude:-80-n/100,service_minutes:20}));
 const result=await calculateDriving(stops,{baseUrl:'https://routing.example',optimize:true,startedAt:floridaStart('2026-10-25','08:00')},fetcher);
 expect(result.ordered_stop_ids).toEqual(['1','3','2']);expect(result.distance_m).toBe(1609.344);expect(result.duration_s).toBe(120);expect(result.arrivals).toHaveLength(3);expect(calls[0]).toContain('/table/v1/driving/');expect(calls[1]).toContain('/route/v1/driving/');expect(new Date(result.arrivals[1].at).getTime()-new Date(result.arrivals[0].at).getTime()).toBe(21*60000);
});
