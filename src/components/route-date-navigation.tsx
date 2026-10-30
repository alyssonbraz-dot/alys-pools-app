'use client';
import {Icon} from './design/icon';
import {T,DateText,LocaleInput,useLanguage} from './i18n';
import {addServiceDays,serviceDay} from '@/lib/service-time';
export function RouteDateNavigation({date,timeZone,onChange}:{date:string;timeZone:string;onChange:(date:string)=>void}){
 const {t}=useLanguage();const today=serviceDay(new Date(),timeZone);
 return <nav className="route-date-navigation" aria-label={t('Route date navigation')}><div className="route-date-buttons">
  <button type="button" className="field-button field-button-secondary field-button-small route-day-step" aria-label={t('← Previous Day')} onClick={()=>onChange(addServiceDays(date,-1))}><span className="route-day-label"><T text="← Previous Day"/></span><span className="route-day-arrow" aria-hidden><Icon name="back"/></span></button>
  <label className="route-date-current"><span className="sr-only"><T text="Service date"/></span><span aria-hidden><DateText value={date} options={{weekday:'short',month:'short',day:'numeric',timeZone}}/></span><LocaleInput aria-label="Service date" type="date" value={date} required onClick={e=>{try{e.currentTarget.showPicker?.();}catch{/* Native keyboard/calendar remains available. */}}} onChange={e=>{if(e.target.validity.valid&&e.target.value)onChange(e.target.value);}}/></label>
  <button type="button" className="field-button field-button-secondary field-button-small route-day-step" aria-label={t('Next Day →')} onClick={()=>onChange(addServiceDays(date,1))}><span className="route-day-label"><T text="Next Day →"/></span><span className="route-day-arrow" aria-hidden><Icon name="arrow"/></span></button>
  <button type="button" className="field-button field-button-secondary field-button-small route-day-today" aria-pressed={date===today} onClick={()=>{if(date!==today)onChange(today);}}><T text="Today"/></button>
 </div></nav>;
}
