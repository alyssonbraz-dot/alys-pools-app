export type UnitSystem='imperial'|'metric';
export const LITERS_PER_GALLON=3.785411784;
export const ML_PER_FL_OZ=29.5735295625;
export const KG_PER_LB=0.45359237;
export const gallonsToLiters=(n:number)=>n*LITERS_PER_GALLON;
export const litersToGallons=(n:number)=>n/LITERS_PER_GALLON;
export const fahrenheitToCelsius=(n:number)=>(n-32)*5/9;
export const celsiusToFahrenheit=(n:number)=>n*9/5+32;
export function canonicalDose<T extends {quantity:number;unit:string}>(d:T):T{const u=d.unit.trim().toLowerCase();return {...d,...(u==='ml'?{quantity:d.quantity/ML_PER_FL_OZ,unit:'fl oz'}:u==='l'?{quantity:litersToGallons(d.quantity),unit:'gal'}:u==='kg'?{quantity:d.quantity/KG_PER_LB,unit:'lb'}:{})};}
export function displayDose<T extends {quantity:number;unit:string}>(dose:T,system:UnitSystem):T{const d=canonicalDose(dose);if(system==='imperial')return d;return {...d,...(d.unit==='gal'?{quantity:gallonsToLiters(d.quantity),unit:'L'}:d.unit==='fl oz'?{quantity:d.quantity*ML_PER_FL_OZ,unit:'mL'}:d.unit==='lb'?{quantity:d.quantity*KG_PER_LB,unit:'kg'}:{})};}
export const readableNumber=(n:number)=>Number(n.toFixed(6));
export function effectiveUnits(property:string|undefined,company:UnitSystem='imperial'):UnitSystem{return property==='metric'?'metric':property==='imperial'?'imperial':company;}
