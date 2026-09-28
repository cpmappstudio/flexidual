import assert from "node:assert/strict";
import { once } from "node:events";
import { get } from "node:http";
import { test } from "node:test";
import { AuthenticationRequired } from "../scripts/abeka/progress";
import { probeSession, validateCookieHeader } from "../scripts/abeka/session-probe";
import { createSessionProbeServer } from "../scripts/abeka/local-session-form";

const cookie = "Session=fake-test-only; Auth=fake";
const payload = { d: [JSON.stringify({ SessionName: "Test", LessonDisplayName: "Lesson 1", PercentDisplay: "100%",
  SegmentId: "1", SubscriptionItem: "2", SubscriptionNumber: "3", LessonLengthDisplay: "1 Mins 0 Secs",
  LessonProgressDisplay: "1 Mins 0 Secs", Completed: "Yes", LastViewed: "09/01/2026" })] };
const reply = () => Response.json(payload);

test("accepts only a bounded cookie header, not credentials, HAR, cURL or header injection", () => {
  assert.equal(validateCookieHeader(cookie), cookie);
  const consentCookie = `${cookie}; CookieScriptConsent={"action":"reject","categories":["strict"]}`;
  assert.equal(validateCookieHeader(consentCookie), consentCookie);
  for (const input of [undefined, null, "", "password", "Cookie: Auth=x", "curl https://abeka.com", "{}",
    "A=x\r\nX-Foo: a", "A=x\n", "x=" + "a".repeat(16384)])
    assert.throws(() => validateCookieHeader(input));
});

test("server probe pins destinations, disables redirects and returns aggregates only", async () => {
  let calls = 0;
  const mock: typeof fetch = async (url, options) => {
    calls++;
    assert.equal(String(url), "https://atschool.abeka.com/Account/Streaming/StreamingDetailsProgress.aspx/GetVideoLessonDetails");
    assert.equal(options?.redirect, "manual");
    assert.equal(new Headers(options?.headers).get("Cookie"), cookie);
    assert.deepEqual(JSON.parse(String(options?.body)), { loginId: "661704", subjectId: calls === 1 ? "117" : "5298" });
    assert.ok(options?.signal);
    return reply();
  };
  const result = await probeSession(cookie, mock);
  assert.equal(calls, 2);
  assert.equal(result.sessionPersisted, false);
  assert.equal(result.results[0].completed, 1);
  assert.ok(!JSON.stringify(result).includes(cookie));
  assert.ok(!JSON.stringify(result).includes("lastViewed"));
});

test("authentication failures stop before a second request and never follow redirects", async () => {
  for (const status of [302, 307, 401, 403]) {
    let calls = 0;
    await assert.rejects(probeSession(cookie, async () => { calls++; return new Response("", { status }); }), AuthenticationRequired);
    assert.equal(calls, 1);
  }
});

test("rejects unexpected HTML, invalid JSON, empty and oversized reports without leaking bodies", async () => {
  for (const response of [new Response("secret-login-page"), Response.json({ d: [] }),
    new Response("secret-invalid-json", { headers: { "content-type": "application/json" } }),
    new Response("a".repeat(1_000_001), { headers: { "content-type": "application/json" } })])
    await assert.rejects(probeSession(cookie, async () => response), error => error instanceof Error && !error.message.includes("secret"));
});

test("redacts transport errors and does not request with invalid cookie input", async () => {
  await assert.rejects(probeSession(cookie, async () => { throw new Error(cookie); }), error =>
    error instanceof Error && !error.message.includes(cookie));
  let called = false;
  await assert.rejects(probeSession("", async () => { called = true; return reply(); }));
  assert.equal(called, false);
});

test("local form rejects other origins and hosts, requires CSRF token, and never reflects session", async () => {
  let calls = 0;
  const server = createSessionProbeServer(async value => {
    calls++; assert.equal(value, cookie);
    return { transport: "node-fetch", results: [], sessionPersisted: false };
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  try {
    const page = await fetch(origin); const html = await page.text();
    assert.equal(page.headers.get("cache-control"), "no-store");
    assert.match(page.headers.get("content-security-policy")!, /frame-ancestors 'none'/);
    assert.ok(!html.includes("localStorage") && !html.includes("posthog"));
    const token = /'X-Probe-Token':'([a-f0-9]+)'/.exec(html)![1];
    const headers = { Origin: origin, "Content-Type": "application/json", "X-Probe-Token": token };
    const badHostStatus = await new Promise<number | undefined>((resolve, reject) => {
      get(origin, { headers: { Host: "example.com" } }, response => {
        response.resume(); response.on("end", () => resolve(response.statusCode));
      }).on("error", reject);
    });
    assert.equal(badHostStatus, 403);
    for (const extra of [{ Origin: "https://example.com" }, { "X-Probe-Token": "wrong" }]) {
      const denied = await fetch(`${origin}/probe`, { method: "POST", headers: { ...headers, ...extra }, body: JSON.stringify({ cookie }) });
      assert.equal(denied.status, 403); await denied.text();
    }
    assert.equal(calls, 0);
    const response = await fetch(`${origin}/probe`, { method: "POST", headers, body: JSON.stringify({ cookie }) });
    assert.equal(response.status, 200);
    const result = await response.text(); assert.ok(!result.includes(cookie)); assert.equal(calls, 1);
    const malformed = await fetch(`${origin}/probe`, { method: "POST", headers, body: cookie });
    assert.equal(malformed.status, 400); assert.ok(!(await malformed.text()).includes(cookie));
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
