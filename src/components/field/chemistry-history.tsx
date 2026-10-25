import {T,DateText} from '@/components/i18n';
import type { ChemistryEntry } from '@/lib/field/chemistry';
import type { ReadingKey } from '@/lib/field/types';
const labels:Record<ReadingKey,string>={fc:'FC',ph:'pH',ta:'TA',cya:'CYA',ch:'CH',salt:'Salt',cc:'CC',tc:'TC',temperature_f:'Water temperature'};
function Entry({entry}:{entry:ChemistryEntry}){
 return <li className="field-chemistry-entry"><time dateTime={entry.completed_at}><DateText value={entry.completed_at} options={{month:'short',day:'numeric'}}/></time><div>
 <p className="field-chemistry-readings">{(Object.entries(entry.readings) as [ReadingKey,number][]).map(([key,value])=><span key={key}><strong><T text={labels[key]}/></strong> {value}{key==='ph'?'':key==='temperature_f'?' °F':<T text={' ppm'}/>}</span>)}</p>
 <p className="field-chemistry-doses">{entry.dosages.length?entry.dosages.map((dose,i)=><span key={i}><T text={dose.product}/>: <strong>{dose.quantity} {dose.unit}</strong></span>):<T text={'No chemicals added'}/>}</p>
 </div></li>;
}
export function ChemistryHistory({entries,poolName}:{entries:ChemistryEntry[];poolName:string}){
 return <section className="field-chemistry-history" aria-label={`${poolName} chemical history`}>
 <div className="field-row-between"><h3><T text="Chemical history"/></h3><span className="field-tiny"><T text="Last 30 days"/></span></div>
 {entries.length?<><ul><Entry entry={entries[0]}/></ul>{entries.length>1&&<details><summary><T text={`View ${entries.length-1} earlier service${entries.length===2?'':'s'}`}/></summary><ul>{entries.slice(1).map(entry=><Entry key={entry.visit_id} entry={entry}/>)}</ul></details>}<p className="field-reference"><T text="Past service only. Enter fresh readings below."/></p></>:<p className="field-tiny"><T text="No chemical records in the last 30 days."/></p>}
 </section>;
}
