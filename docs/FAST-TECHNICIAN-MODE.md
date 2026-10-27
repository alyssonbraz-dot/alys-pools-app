# Fast Technician Mode

Goal: approximately15–30 seconds of interaction for a routine service, excluding maintenance. This is a design target, not a measured claim about a physical phone or camera.

## Inspection and incremental implementation

The existing app already provided server-verified authentication, Owner/Admin/Technician profiles, organization/assignment RLS, pool checklists, previous chemical context, measurement/dose shortcuts, private JPEG uploads, IndexedDB drafts/outbox, idempotent completion and an asynchronous report worker. These features and migrations001–013 are retained.

The gaps addressed here are the order of the service form, issue flags, byte-progress feedback, unnecessary route reloads and a queue that previously processed only the batch present when synchronization started. A second local completion during a slow upload now gets drained by the same sync run. No paid package or new provider was added.

## Technician experience

Technicians automatically get the compact Stops view, including when opening `/`. Their navigation contains Stops, History and Settings. Owners/Admins retain customer management, assignments and route planning. The server still enforces access when a technician manually requests a hidden page/API; hiding navigation does not grant or revoke database permissions.

Start Service opens immediately. The single screen contains each pool's **Readings → Chemicals → Checklist**, then visit-level **Issue flags → Photo → Complete & Next**. There are no required stepper pages. Previous measurements/monthly chemistry remain reference values; new measurements and task selections start empty. Common chlorine/pH values and quantities are touch shortcuts, not dosage recommendations. Chlorine and acid have direct add buttons; quantities still require an explicit choice.

Flags: **Green Pool, Equipment Issue, Low Water, Access Denied, Other**. Multiple flags are allowed, without duplicates. Flags never mark tasks, invent measurements, change the stop outcome or waive required readings/photos. For a no-access incident, preserve the draft/issue or use an authorized skip; do not fabricate measurements. Internal issue details belong in the existing staff-only notes fields.

Capture is compressed to JPEG in the browser and durably saved before allowing completion. The server independently decodes/re-encodes it, removes metadata, verifies the assigned stop and writes to private storage. Upload starts after local completion, so camera capture does not add a network prerequisite. The global progress panel names the stop being synchronized, even while another stop is open.

## Local completion and synchronization

1. Complete & Next validates the pool configuration and required photo locally.
2. IndexedDB commits the submission and marks **Pending Sync**. Only then does the next assigned, uncompleted stop open. A local storage failure keeps the operator on the current visit.
3. Background synchronization verifies identity using the lightweight `/api/session` endpoint. Starting a visit and confirming a batch no longer reload the whole route or monthly chemistry.
4. Upload progress is byte-based. It remains below100% until storage acknowledgement, with a message while awaiting secure storage confirmation. Bytes transferred do not imply a saved visit.
5. Only the server completion transaction marks the stop **Synced** and allows local draft/photo removal. The report outbox is inserted by that transaction; Resend delivery happens afterwards, separately.
6. A failed upload/confirmation remains **Failed** with its original UUID, fields, flags, timestamps and blobs. Newer visits are still processed. Repeated completion cannot replace an already queued submission; stale-tab draft edits, photo additions and removals are rejected.

When the app is open, retry checks run every15 seconds. Failed transient requests use durable exponential backoff15s →30s →60s →120s →240s →300s maximum; manual Retry sync bypasses the wait.422 validation rejection and409 conflict are never automatically edited/retried. Only a definite422 can unlock a saved submission for correction; it first reloads current pool requirements.401/403 preserve work and require the correct account, with bounded rechecks. Closing/suspending the app stops foreground retry; reopen it to resume. IndexedDB persistence is not a backup or encryption and remains subject to device/browser storage policy.

The sync run takes newly queued stops between batches and attempts each stop at most once per run. Stable photo IDs make an interrupted upload retry recoverable; stable visit IDs, immutable chemical rows and the existing report idempotency key prevent duplicates after an uncertain response. An upload failure never deletes its local photo.

## Security and history

Migration014 adds immutable `visit_issue_flags`, with organization/visit FK and SELECT RLS delegated to assigned-visit access. The original validated completion transaction is retained as a non-public base routine; browser roles cannot call it directly. The public RPC validates flag values/duplicates, calls the original transaction and inserts flags atomically. A duplicate visit returns the original result without changing its flags or creating another report.

Historical flags are shown only for authorized visits. Reports include controlled flag labels, not internal notes. Reports containing an issue use a neutral “visit recorded” heading; they do not claim issue-free maintenance. Previously frozen delivery payloads are preserved.

Owner/Admin permissions remain compatible with existing installations. Technician permissions remain limited to assigned stops and authorized historical/current information; profile creation and role changes still use trusted administration. To add a technician, create the Auth user through the trusted admin channel and insert its profile with role `technician` in the correct organization. Never rely on client-controlled signup metadata for membership. Then assign stops/schedules through the owner's Settings/Route workflow.

## Loading and free-plan compatibility

A cached route for the verified account/date/role is displayed while refreshing online. Route/date race protection remains active. The map planner is loaded on demand for online owner planning, not for a technician's routine screen; calendar/arrival display is separated from the Leaflet component. The generic PWA shell still supports cached stops/drafts with no network.

The app continues using Netlify, Supabase and Resend without new paid dependencies or an image service. Foreground retry checks do not upload when the visit outbox is empty or not due. Existing photo/storage quotas and provider rate limits still apply. The delivery preparation now also includes a Netlify production schedule that invokes the protected report worker every fifteen minutes; it does not run locally or on previews, and skips network calls while email delivery is disabled. This recovers server-side report jobs, not device-local unsynced visits. See the [README](../README.md) for configuration, quotas and domain setup. Remote deployment, schedule execution and real email delivery still require production acceptance checks.

## Updating and testing

Apply migration014 before running the new code, without resetting the database:

```bash
npx --yes supabase@2.121.0 migration up --local
npm run lint
npm run typecheck
npm test
npm run test:db
npm run build
```

For browser tests, follow README local Supabase/fixture/stub instructions. A new integration test creates an isolated fictitious technician and three assigned stops, holds the first upload, allows two local completions, fails the upload and retries safely. It checks required photos, real private Storage upload, server-confirmed completion, RLS-negative requests, flags/history and one chemical/report row after repeat completion. It also rejects a cached Owner view for a verified Technician, checks cached-route rendering before a delayed refresh and that Start Service does not reload the route.

Timing evidence records only Complete & Next → next-stop visibility while the upload is held. It excludes data entry, actual maintenance and camera operation. A15–30 second routine still needs testing by technicians on physical devices. The standalone HTML demo remains a separate fictitious local demonstration; it does not demonstrate server roles or production synchronization.
