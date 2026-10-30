import type {Dosage} from './field/types';
export const CHEMICAL_UNITS:Record<string,string[]>={'Liquid Chlorine':['gal','fl oz'],'Muriatic Acid':['fl oz'],'Sodium Bicarbonate':['lb'],'Soda Ash':['lb'],'Calcium Chloride':['lb'],'Cyanuric Acid':['lb'],'Salt':['lb'],'Stabilizer':['lb'],'Chlorine Tablets':['units'],'Shock':['lb'],'Other':['custom']};
export const QUANTITY_PRESETS:Record<string,number[]>={gal:[0.25,0.5,1],'fl oz':[8,16,32],lb:[1,2,4],units:[1,2,3],L:[0.5,1,2],mL:[250,500,1000],kg:[0.5,1,2],custom:[1,2,3]};
export type ChemicalPreferences={favorites:string[];recent:string[]};
export const DEFAULT_CHEMICAL_PREFERENCES:ChemicalPreferences={favorites:['Liquid Chlorine','Muriatic Acid'],recent:[]};
export function parseChemicalPreferences(value:unknown):ChemicalPreferences{if(!value||typeof value!=='object')return DEFAULT_CHEMICAL_PREFERENCES;const data=value as Record<string,unknown>;const valid=(v:unknown)=>Array.isArray(v)?[...new Set(v.filter((x):x is string=>typeof x==='string'&&!!CHEMICAL_UNITS[x]))].slice(0,8):[];return {favorites:valid(data.favorites),recent:valid(data.recent)};}
export function rememberChemical(preferences:ChemicalPreferences,product:string){return {...preferences,recent:[product,...preferences.recent.filter(p=>p!==product)].slice(0,4)};}
export function validChemical(dose:Dosage){return dose.product.trim().length>0&&dose.product.length<=100&&Number.isFinite(dose.quantity)&&dose.quantity>0&&dose.quantity<=10000&&dose.unit.trim().length>0&&dose.unit.length<=20;}
