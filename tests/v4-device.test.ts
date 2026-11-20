import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  flushVisits, getSyncStatus, listLocalVisits, queueVisit, readDraft,
  reconcileRoute, saveDraft, type DeviceScope,
} from '@/lib/v4/device';
import type { RouteDay, VisitInput } from '@/lib/v4/types';

const day = '2026-11-19';
const makeScope = (): DeviceScope => ({ userId: crypto.randomUUID(), orgId: crypto.randomUUID() });
const makeVisit = (): VisitInput => ({
  id: crypto.randomUUID(), date: day, stopId: crypto.randomUUID(),
  notes: 'Skimmed', bodies: [{bodyId: crypto.randomUUID(), ph: 7.5, fc: 0, alkalinity: null, tasks: [], chemicals: []}],
});

function route(visit: VisitInput): RouteDay {
  return { date: day, technician: 'Test', stops: [{ id: visit.stopId, name: 'Test',
    address: '', position: 1, latitude: null, longitude: null, bodies: [],
    completedAt: new Date().toISOString(), visit }] };
}

describe('V4 field storage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('commits one completion per stop and fences stale draft writes from another tab', async () => {
    const scope = makeScope();
    const visit = makeVisit();
    await saveDraft(scope, day, visit.stopId, { notes: 'draft' });
    expect(await readDraft(scope, day, visit.stopId)).toEqual({ notes: 'draft' });
    expect(await readDraft({ ...scope, orgId: 'different' }, day, visit.stopId)).toBeNull();
    const attempts = await Promise.allSettled([
      queueVisit(scope, day, visit), queueVisit(scope, day, {...visit, id: crypto.randomUUID()}),
    ]);
    expect(attempts.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter(result => result.status === 'rejected')).toHaveLength(1);
    const [winner] = await listLocalVisits(scope, day);
    await expect(queueVisit(scope, day, {...winner, notes: 'Unsaved edit'})).rejects.toThrow('another tab');
    await expect(queueVisit(scope, day, structuredClone(winner))).resolves.toBeUndefined();
    await expect(saveDraft(scope, day, visit.stopId, { notes: 'stale' })).rejects.toThrow('another tab');
    expect(await readDraft(scope, day, visit.stopId)).toBeNull();
    expect(await listLocalVisits(scope, day)).toEqual([winner]);
    expect(await listLocalVisits({ ...scope, userId: 'different' }, day)).toEqual([]);
    expect(await getSyncStatus(scope)).toMatchObject({ pending: 1 });
  });

  it('keeps the exact visit ID after a lost response and clears personal data after server reconciliation', async () => {
    const scope = makeScope();
    const visit = makeVisit();
    await queueVisit(scope, day, visit);
    const network = vi.fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('Connection lost after commit'))
      .mockResolvedValueOnce(Response.json({id: visit.id, stopId: visit.stopId}));
    vi.stubGlobal('fetch', network);
    expect((await flushVisits(scope)).pending).toBe(1);
    // A route refresh alone cannot acknowledge a separately uploaded visit photo.
    await reconcileRoute(scope, route(visit));
    expect(await listLocalVisits(scope, day)).toEqual([visit]);
    expect(await Promise.all([flushVisits(scope), flushVisits(scope)])).toEqual([
      { pending: 0, blocked: 0, message: null }, { pending: 0, blocked: 0, message: null },
    ]);
    expect(network.mock.calls).toHaveLength(2);
    for (const [path, options] of network.mock.calls) {
      expect(path).toBe('/api/v4/visits');
      expect(JSON.parse(String(options?.body))).toEqual(visit);
      expect(options?.headers).toMatchObject({
        'X-ALYS-User-ID': scope.userId, 'X-ALYS-Organization-ID': scope.orgId,
      });
    }
    await reconcileRoute(scope, route(visit));
    expect(await listLocalVisits(scope, day)).toEqual([]);
    await expect(saveDraft(scope, day, visit.stopId, { notes: 'stale' })).rejects.toThrow('another tab');
    expect(await readDraft(scope, day, visit.stopId)).toBeNull();
    await expect(queueVisit(scope, day, {...visit, notes: 'different'})).rejects.toThrow('another tab');
    await expect(queueVisit(scope, day, visit)).resolves.toBeUndefined();
    expect((await getSyncStatus(scope)).pending).toBe(0);
  });

  it('allows an assigned stop to sync when another stop has been reassigned', async () => {
    const scope = makeScope();
    const first = { ...makeVisit(), stopId: 'a' };
    const next = { ...makeVisit(), stopId: 'b' };
    await queueVisit(scope, day, first);
    await queueVisit(scope, day, next);
    const network = vi.fn<typeof fetch>(async (_path, options) => {
      const visit = JSON.parse(String(options?.body)) as VisitInput;
      if (visit.id === first.id) return new Response(null, {status: 403});
      return Response.json({id: visit.id, stopId: visit.stopId});
    });
    vi.stubGlobal('fetch', network);
    expect(await flushVisits(scope)).toMatchObject({ pending: 1, blocked: 1 });
    expect(network.mock.calls).toHaveLength(2);
    await reconcileRoute(scope, route(next));
    expect(await listLocalVisits(scope, day)).toEqual([first]);
  });

  it('retains work on account change and refuses a receipt for a different visit', async () => {
    const scope = makeScope(), visit = makeVisit();
    await queueVisit(scope, day, visit);
    const network = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, {status: 403}))
      .mockResolvedValueOnce(Response.json({id: 'unrelated'}));
    vi.stubGlobal('fetch', network);
    expect(await flushVisits(scope)).toMatchObject({pending: 1, blocked: 1});
    expect(await flushVisits(scope)).toMatchObject({pending: 1});
    expect(await listLocalVisits(scope, day)).toEqual([visit]);
  });
});
