import {OfflineWorkspace} from '@/components/field/offline-workspace';
// Public shell has no server identity. Only the last verified device scope is opened locally.
// Server Auth/RLS continue to authorize every subsequent synchronization request.
export default function OfflinePage(){return <OfflineWorkspace/>;}
