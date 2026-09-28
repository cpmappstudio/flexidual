import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRoster, parseSubjects, abekaClient } from "../lib/abeka/report";
import {
  encryptSession,
  decryptSession,
  encryptCredentials,
  decryptCredentials,
} from "../lib/abeka/encryption";
import { AuthenticationRequired } from "../lib/abeka/progress";

const row = (id: string, status = "1", role = "Student") =>
  `<tr><td><span id="lbldisplayName">Example &amp; Student</span><input id="hidLoginId" value="${id}"></td><td id="lblUserType">${role}</td><td><ul id="bulUserStatus"><li>${status}</li></ul></td></tr>`;
const roster = (rows: string) =>
  `<select id="ddlSchools"><option selected value="123">Example School</option></select><table id="gdvUsers">${rows}</table>`;

test("roster reads active students, not administrators or disabled accounts", () => {
  assert.deepEqual(
    parseRoster(
      roster(row("42") + row("43", "3") + row("44", "1", "Administrator")),
    ),
    {
      externalSchoolId: "123",
      externalSchoolName: "Example School",
      unavailableStudents: 0,
      students: [{ loginId: "42", name: "Example & Student" }],
    },
  );
});
test("rejects ambiguous rosters and unexpected provider pages", () => {
  assert.throws(() => parseRoster(roster(row("42") + row("42"))));
  assert.throws(() => parseRoster("<html>Login</html>"));
  assert.throws(() => parseRoster(roster(row("not-an-id"))));
});

test("counts active accounts with no report link without fabricating an identifier", () => {
  const withoutReport = row("43").replace(
    '<input id="hidLoginId" value="43">',
    "",
  );
  const result = parseRoster(roster(row("42") + withoutReport));
  assert.equal(result.students.length, 1);
  assert.equal(result.unavailableStudents, 1);
});
test("subject discovery checks student identity and bounded unique identifiers", () => {
  const html =
    '<input id="hidLoginId" value="42"><select id="ddlClasses"><option value="117">Math</option></select>';
  assert.deepEqual(parseSubjects(html, "42"), [{ id: "117", name: "Math" }]);
  assert.throws(() => parseSubjects(html, "43"));
  assert.throws(() =>
    parseSubjects(html.replace("117", "https://evil.test"), "42"),
  );
});
test("encrypted session is randomized, authenticated and bound to the institution", async () => {
  const secret = "ab".repeat(32);
  const one = await encryptSession("session=private", secret, "school-one");
  const two = await encryptSession("session=private", secret, "school-one");
  assert.notDeepEqual(one, two);
  assert.equal(
    await decryptSession(one, secret, "school-one"),
    "session=private",
  );
  await assert.rejects(() => decryptSession(one, secret, "school-two"));
  one.ciphertext =
    (one.ciphertext.startsWith("ff") ? "00" : "ff") + one.ciphertext.slice(2);
  await assert.rejects(() => decryptSession(one, secret, "school-one"));
  await assert.rejects(() => encryptSession("secret", "bad-key", "school"));
});
test("provider authentication redirects are not followed and errors never reflect a cookie", async () => {
  const requests: string[] = [];
  const fake: typeof fetch = async (url, options) => {
    requests.push(String(url));
    assert.equal(options?.redirect, "manual");
    return new Response(null, {
      status: 302,
      headers: { Location: "https://login.example.com" },
    });
  };
  await assert.rejects(
    () => abekaClient("session=secret", fake).roster(),
    AuthenticationRequired,
  );
  assert.equal(requests.length, 1);
  await assert.rejects(
    () =>
      abekaClient("session=secret", async () => {
        throw new Error("session=secret");
      }).roster(),
    /PROVIDER_UNAVAILABLE/,
  );
});

test("credential ciphertext is bound to institution and purpose, and cannot be read with another key", async () => {
  const key = "ab".repeat(32);
  const credentials = { username: "example", password: "not-real" };
  const encrypted = await encryptCredentials(credentials, key, "one");
  assert.deepEqual(
    await decryptCredentials(encrypted, key, "one"),
    credentials,
  );
  assert.notDeepEqual(
    encrypted,
    await encryptCredentials(credentials, key, "one"),
  );
  await assert.rejects(() => decryptCredentials(encrypted, key, "two"));
  await assert.rejects(() =>
    decryptCredentials(encrypted, "cd".repeat(32), "one"),
  );
  await assert.rejects(() => decryptSession(encrypted, key, "one"));
  const cookie = await encryptSession(JSON.stringify(credentials), key, "one");
  await assert.rejects(() => decryptCredentials(cookie, key, "one"));
});
test("connector refuses arbitrary student IDs and bounds responses", async () => {
  let called = false;
  const fake: typeof fetch = async () => {
    called = true;
    return new Response("x".repeat(1_000_001), {
      headers: { "Content-Type": "application/json" },
    });
  };
  await assert.rejects(() =>
    abekaClient("session=test", fake).subjects("../../other"),
  );
  assert.equal(called, false);
  await assert.rejects(
    () => abekaClient("session=test", fake).progress("42", "117"),
    /RESPONSE_TOO_LARGE/,
  );
});
