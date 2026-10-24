import { FieldApp } from '@/components/field/field-app';

// This route deliberately has no protected layout and contains no session, route or customer data.
// It is the public app shell cached by the worker; FieldApp opens only the last verified account's IDB scope.
export default function OfflinePage() {
  return <main className="content"><header className="page-header"><div><div className="page-kicker">ALYS POOL MANAGER</div><h1>Field route</h1></div></header><p className="notice mb-5">This device may hold customer information for offline work. Use a protected personal device and sign out before sharing it. Local changes remain pending until the server confirms synchronization.</p><FieldApp offline/></main>;
}
