'use client';
import {T,useLanguage} from '@/components/i18n';
import {ChemicalTables} from '@/components/chemical-tables';
import type {ChemistryEntry} from '@/lib/field/chemistry';
export function ChemistryHistory({entries,poolName}:{entries:ChemistryEntry[];poolName:string}){const {t}=useLanguage();return <section className="field-chemistry-history" aria-label={t(`${poolName} chemical history`)}><div className="field-row-between"><h3><T text="Chemical history"/></h3><span className="field-tiny"><T text="Last 30 days"/></span></div>{entries.length?<><ChemicalTables rows={entries.slice(0,1)}/>{entries.length>1&&<details><summary><T text={`View ${entries.length-1} earlier service${entries.length===2?'':'s'}`}/></summary><ChemicalTables rows={entries.slice(1)}/></details>}<p className="field-reference"><T text="Past service only. Enter fresh readings below."/></p></>:<p className="field-tiny"><T text="No chemical records in the last 30 days."/></p>}</section>;}
