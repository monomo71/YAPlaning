import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../server/app.ts";
import { api } from "../src/types.ts";

test("Browserclient verstuurt geldige JSON voor lege POST-verzoeken, ook achter een proxy", async () => {
  const app = await createApp({ dbPath: ":memory:", serveStatic: false });
  const original = globalThis.fetch;
  try {
    const setup = await app.inject({
      url: "/api/setup",
      method: "POST",
      headers: { "x-yap-request": "1" },
      payload: {
        name: "Tester",
        email: "http@example.test",
        password: "Http-test123!",
      },
    });
    const cookie = String(setup.headers["set-cookie"]).split(";")[0];
    const rejected = await app.inject({
      url: "/api/games/runner/start",
      method: "POST",
      headers: {
        cookie,
        "x-yap-request": "1",
        "content-type": "application/octet-stream",
      },
      payload: "",
    });
    assert.equal(rejected.statusCode, 415);
    const seen: string[] = [];
    globalThis.fetch = (async (url, init) => {
      const headers = new Headers(init?.headers);
      headers.set("cookie", cookie);
      // Een proxy kan een ongetypeerde POST als octet-stream doorgeven.
      if (!headers.has("content-type"))
        headers.set("content-type", "application/octet-stream");
      const r = await app.inject({
        url: String(url),
        method: init?.method as any,
        headers: Object.fromEntries(headers.entries()),
        payload: init?.body as string,
      });
      assert.equal(headers.get("content-type"), "application/json");
      assert.equal(init?.body, "{}");
      seen.push(String(url));
      return new Response(r.body, {
        status: r.statusCode,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
    assert.ok((await api("/games/runner/start", "POST")).runId);
    assert.ok((await api("/games/tetris/start", "POST")).runId);
    assert.equal((await api("/logout", "POST")).ok, true);
    assert.equal(seen.length, 3);
  } finally {
    globalThis.fetch = original;
    await app.close();
  }
});
