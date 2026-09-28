import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LoginProbeError,
  probeAbekaLogin,
  validateLoginCredentials,
} from "../lib/abeka/login-probe";

const school = "https://atschool.abeka.com";
const login = "https://login.abeka.com";
const tenant = "/abekab2c.onmicrosoft.com/B2C_1A_Signin_Legacy";
const settings = {
  api: "CombinedSigninAndSignup",
  csrf: "test-csrf",
  transId: "test-tx",
  hosts: { tenant, policy: "B2C_1A_Signin_Legacy" },
};
const loginHtml = `<script>var SETTINGS = ${JSON.stringify(settings)};</script><script>{"ID":"signInName"}{"ID":"password"}</script>`;
const credentials = { username: "test-admin", password: "not-a-real-password" };
const redirect = (location: string, cookie?: string) =>
  new Response(null, {
    status: 302,
    headers: {
      Location: location,
      ...(cookie ? { "Set-Cookie": cookie } : {}),
    },
  });

function fakeProvider(overrides: Partial<Record<number, () => Response>> = {}) {
  const calls: { url: string; body: string; cookies: string }[] = [];
  const responses = [
    () => redirect(`${school}/login.aspx`, "schoolOnly=one; Path=/; Secure"),
    () => redirect(`${login}${tenant}/oauth2/v2.0/authorize`),
    () =>
      new Response(loginHtml, {
        headers: { "Set-Cookie": "loginOnly=two; Path=/; Secure" },
      }),
    () => Response.json({ status: "200" }),
    () =>
      new Response(
        `<form method="post" action="${school}/signin-oidc-b2c"><input name="id_token" value="fake-token"><input name="state" value="fake-state"></form>`,
      ),
    () =>
      redirect(
        `${school}/Account/`,
        ".AspNet.Cookies=authenticated; Path=/; Secure",
      ),
    () => new Response("Signed in"),
    () =>
      new Response(
        '<select id="ddlSchools"><option value="123">Example School</option></select><table id="gdvUsers"></table>',
      ),
  ];
  const request = (async (url, init) => {
    calls.push({
      url: String(url),
      body: String(init?.body ?? ""),
      cookies: new Headers(init?.headers).get("Cookie") ?? "",
    });
    assert.equal(init?.redirect, "manual");
    const index = calls.length - 1;
    return (
      overrides[index] ??
      responses[index] ??
      (() => {
        throw new Error("Unexpected request");
      })
    )();
  }) as typeof fetch;
  return { calls, request };
}

test("login verifies the report and returns metadata only; cookie domains remain isolated", async () => {
  const { calls, request } = fakeProvider();
  assert.deepEqual(await probeAbekaLogin(credentials, request), {
    externalSchoolId: "123",
    externalSchoolName: "Example School",
    students: 0,
  });
  assert.equal(calls.length, 8);
  assert.equal(
    calls.filter((c) => c.body.includes(credentials.password)).length,
    1,
  );
  assert.ok(calls[3].cookies.includes("loginOnly=two"));
  assert.ok(!calls[3].cookies.includes("schoolOnly"));
  assert.ok(calls[5].cookies.includes("schoolOnly=one"));
  assert.ok(!calls[5].cookies.includes("loginOnly"));
  assert.ok(calls[7].cookies.includes(".AspNet.Cookies=authenticated"));
});

test("credential POST redirects are not followed or retried", async () => {
  const { calls, request } = fakeProvider({
    3: () => redirect("https://example.org/steal"),
  });
  await assert.rejects(probeAbekaLogin(credentials, request), {
    code: "INTERACTION_REQUIRED",
  });
  assert.equal(calls.length, 4);
});

test("valid credential JSON is accepted with non-JSON or missing MIME labels", async () => {
  for (const contentType of ["text/plain; charset=utf-8", "text/html", null]) {
    for (const status of [200, "200"]) {
      const { calls, request } = fakeProvider({
        3: () => {
          const response = new Response(JSON.stringify({ status }));
          if (contentType) response.headers.set("Content-Type", contentType);
          else response.headers.delete("Content-Type");
          return response;
        },
      });
      assert.equal(
        (await probeAbekaLogin(credentials, request)).externalSchoolId,
        "123",
      );
      assert.equal(calls.length, 8);
      assert.equal(
        calls.filter((c) => c.body.includes(credentials.password)).length,
        1,
      );
    }
  }
});

test("malformed or unexpected credential bodies stop without leaking content", async () => {
  for (const body of [
    "",
    `<html>${credentials.password}</html>`,
    `invalid JSON ${credentials.password}`,
    "null",
    "[]",
    "{}",
    '{"status":[200]}',
    '{"status":true}',
  ]) {
    const { calls, request } = fakeProvider({
      3: () =>
        new Response(body, { headers: { "Content-Type": "application/json" } }),
    });
    await assert.rejects(probeAbekaLogin(credentials, request), {
      message: "INTERACTION_REQUIRED",
      diagnostic: "CREDENTIAL_RESPONSE_200_JSON",
    });
    assert.equal(calls.length, 4);
  }
});

test("non-JSON MIME labels do not turn provider rejection into success", async () => {
  const { calls, request } = fakeProvider({
    3: () =>
      new Response(
        JSON.stringify({ status: "400", message: credentials.password }),
      ),
  });
  await assert.rejects(probeAbekaLogin(credentials, request), {
    message: "SIGN_IN_REJECTED",
  });
  assert.equal(calls.length, 4);
});

test("credential responses remain size-bounded even when they contain valid JSON", async () => {
  const { calls, request } = fakeProvider({
    3: () =>
      new Response(
        JSON.stringify({ status: "200", message: "x".repeat(65_536) }),
      ),
  });
  await assert.rejects(probeAbekaLogin(credentials, request), {
    message: "PROVIDER_UNAVAILABLE",
  });
  assert.equal(calls.length, 4);
});

test("foreign-host redirects are rejected before sending any request there", async () => {
  const { calls, request } = fakeProvider({
    1: () => redirect("https://login.abeka.com.evil.invalid/"),
  });
  await assert.rejects(probeAbekaLogin(credentials, request), {
    code: "LOGIN_FLOW_CHANGED",
  });
  assert.equal(calls.length, 2);
  assert.ok(calls.every((c) => !c.body));
});

test("unknown verification flow stops before password submission", async () => {
  const { calls, request } = fakeProvider({
    2: () =>
      new Response(loginHtml.replace("CombinedSigninAndSignup", "VerifyMfa")),
  });
  await assert.rejects(probeAbekaLogin(credentials, request), {
    code: "LOGIN_FLOW_CHANGED",
    diagnostic: "SETTINGS_FIELDS",
  });
  assert.equal(calls.length, 3);
});

test("provider rejection messages never escape and there is no automatic retry", async () => {
  const { calls, request } = fakeProvider({
    3: () => Response.json({ status: "400", message: credentials.password }),
  });
  await assert.rejects(probeAbekaLogin(credentials, request), (e: unknown) => {
    assert.ok(e instanceof LoginProbeError);
    assert.equal(e.message, "SIGN_IN_REJECTED");
    return true;
  });
  assert.equal(calls.length, 4);
});

test("identity token cannot be posted to an unexpected callback", async () => {
  const { calls, request } = fakeProvider({
    4: () =>
      new Response(
        '<form method="post" action="https://example.org/steal"><input name="id_token" value="test"></form>',
      ),
  });
  await assert.rejects(probeAbekaLogin(credentials, request), {
    code: "LOGIN_FLOW_CHANGED",
    diagnostic: "CALLBACK_DESTINATION",
  });
  assert.equal(calls.length, 5);
});

test("diagnostics distinguish non-JSON credential responses without exposing their body", async () => {
  const { request } = fakeProvider({
    3: () =>
      new Response(credentials.password, {
        status: 403,
        headers: { "Content-Type": "text/html" },
      }),
  });
  await assert.rejects(probeAbekaLogin(credentials, request), {
    code: "INTERACTION_REQUIRED",
    diagnostic: "CREDENTIAL_RESPONSE_403_HTML",
  });
});

test("diagnostics distinguish missing callback form from missing token", async () => {
  for (const [html, diagnostic] of [
    ["<p>Unexpected step</p>", "CALLBACK_MISSING_FORM"],
    [
      `<form method="post" action="${school}/signin-oidc-b2c"><input name="state" value="private-state"></form>`,
      "CALLBACK_TOKEN_MISSING",
    ],
  ]) {
    const { request } = fakeProvider({ 4: () => new Response(html) });
    await assert.rejects(probeAbekaLogin(credentials, request), {
      code: "INTERACTION_REQUIRED",
      diagnostic,
    });
  }
});

test("no success is reported without authenticated report access", async () => {
  const { request } = fakeProvider({
    7: () => redirect(`${school}/login.aspx`),
  });
  await assert.rejects(probeAbekaLogin(credentials, request), {
    code: "SIGN_IN_REJECTED",
  });
});

test("network exceptions cannot leak passwords or authentication URLs", async () => {
  const request = (async () => {
    throw new Error(credentials.password);
  }) as typeof fetch;
  await assert.rejects(probeAbekaLogin(credentials, request), {
    message: "PROVIDER_UNAVAILABLE",
  });
});

test("credentials have size and type limits", () => {
  for (const value of [
    null,
    {},
    { username: "a", password: "" },
    { username: "a", password: "a".repeat(1025) },
    { username: "a\r\n", password: "b" },
  ])
    assert.throws(() => validateLoginCredentials(value), {
      code: "INVALID_REQUEST",
    });
  assert.deepEqual(
    validateLoginCredentials({ username: " admin ", password: " pass " }),
    { username: "admin", password: " pass " },
  );
});
