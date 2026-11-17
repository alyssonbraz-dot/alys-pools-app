import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
const code = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
function harness(app = false) {
  const events: Record<string, (e: Record<string, unknown>) => void> = {};
  const stores = new Map<string, Map<string, Response>>();
  const notifications: Record<string, unknown>[] = [];
  let fail = false;
  const key = (url: string | URL) =>
    new URL(String(url), "https://app.example.test").href;
  const open = async (name: string) => {
    let entries = stores.get(name);
    if (!entries) {
      entries = new Map();
      stores.set(name, entries);
    }
    return {
      match: async (url: string) => entries!.get(key(url))?.clone(),
      put: async (url: string, response: Response) => {
        entries!.set(key(url), response.clone());
      },
    };
  };
  const fetcher = vi.fn(async (url: string) => {
    if (url === (app ? "/app" : "") + "/offline")
      return new Response(
        (app ? '<script src="/app/_next/static/app.js?dpl=build1"></script><link href="/app/_next/static/app.css?dpl=build1" rel="stylesheet">' : '<script src="/_next/static/app.js?dpl=build1"></script><link href="/_next/static/app.css?dpl=build1" rel="stylesheet">'),
      );
    if (fail && url.includes(".css"))
      return new Response("Unavailable", { status: 503 });
    return new Response("public asset");
  });
  const context = {
    URL,
    Headers,
    Response,
    Promise,
    console,
    fetch: fetcher,
    caches: {
      open,
      keys: async () => [...stores.keys()],
      delete: async (name: string) => stores.delete(name),
    },
    self: {
      registration: {scope: "https://app.example.test"+(app?"/app/":"/")},
      location: { origin: "https://app.example.test" },
      skipWaiting: vi.fn(),
      clients: {
        matchAll: async () => [
          {
            url:"https://app.example.test"+(app?"/app/stops":"/stops"),
            postMessage: (data: Record<string, unknown>) =>
              notifications.push(data),
          },
        ],
        claim: async () => {},
      },
      addEventListener: (name: string, handler: (typeof events)[string]) => {
        events[name] = handler;
      },
    },
  };
  runInNewContext(code, context);
  async function emit(name: string, data?: unknown) {
    const promises: Promise<unknown>[] = [];
    events[name]({
      data,
      waitUntil: (p: Promise<unknown>) => promises.push(p),
    });
    await Promise.all(promises);
  }
  return {
    events,
    emit,
    stores,
    fetcher,
    notifications,
    fail: () => {
      fail = true;
    },
    recover: () => {
      fail = false;
    },
  };
}
describe("offline shell installation and recovery", () => {
  it("preserves deployment queries and announces ready only after resources are cached", async () => {
    const h = harness();
    await h.emit("install");
    expect(h.fetcher.mock.calls.map((c) => c[0])).toContain(
      "/_next/static/app.js?dpl=build1",
    );
    expect(h.notifications.at(-1)?.ready).toBe(true);
    expect(
      h.stores
        .get("alys-field-shell-v30")
        ?.has("https://app.example.test/offline"),
    ).toBe(true);
  });
  it("reports a failed asset truthfully and permits retry without reinstalling or clearing old work", async () => {
    const h = harness();
    h.stores.set(
      "alys-field-shell-v1",
      new Map([
        ["https://app.example.test/offline", new Response("previous shell")],
      ]),
    );
    h.fail();
    await h.emit("install");
    expect(h.notifications.at(-1)?.ready).toBe(false);
    expect(h.notifications.at(-1)?.error).toContain("503");
    expect(h.stores.has("alys-field-shell-v1")).toBe(true);
    h.recover();
    await h.emit("message", { type: "WARM_OFFLINE_SHELL" });
    expect(h.notifications.at(-1)?.ready).toBe(true);
    expect(h.stores.has("alys-field-shell-v1")).toBe(false);
  });
});

it("app worker caches only app resources and leaves marketing/API requests alone",async()=>{
 const h=harness(true);h.stores.set('marketing-cache',new Map());h.stores.set('alys-field-shell-v30',new Map());await h.emit('install');expect(h.notifications.at(-1)?.ready).toBe(true);expect(h.stores.has('alys-field-shell-app-v30')).toBe(true);expect(h.stores.has('marketing-cache')).toBe(true);expect(h.stores.has('alys-field-shell-v30')).toBe(true);
 for(const path of ['/','/blog','/application','/app/api/photos']){const respondWith=vi.fn();h.events.fetch({request:{url:'https://app.example.test'+path,method:'GET',mode:'navigate',headers:new Headers()},respondWith});expect(respondWith).not.toHaveBeenCalled();}
 expect(h.fetcher.mock.calls.map(c=>c[0]).every(p=>p.startsWith('/app/'))).toBe(true);
});
