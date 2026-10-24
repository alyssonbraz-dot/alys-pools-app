"use client";
export default function ErrorPage({reset}:{reset:()=>void}) {return <main className="panel login-card"><h1>Unable to load this page</h1><p>Check the connection and database setup, then try again. Local visit drafts remain on this device.</p><button className="btn btn-primary" onClick={reset}>Try again</button></main>;}
