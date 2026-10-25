"use client";
import {LanguageSwitcher} from '@/components/i18n';
import {T} from '@/components/i18n';
export default function ErrorPage({reset}:{reset:()=>void}) {return <main className="panel login-card"><div className="language-row"><LanguageSwitcher/></div><h1><T text="Unable to load this page"/></h1><p><T text="Check the connection and database setup, then try again. Local visit drafts remain on this device."/></p><button className="btn btn-primary" onClick={reset}><T text="Try again"/></button></main>;}
