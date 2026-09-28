import { parse } from "node-html-parser";
import { CookieJar } from "tough-cookie";
import { REPORT_URL } from "./progress";
import { parseRoster } from "./report";
import { readBoundedText, validateCookieHeader } from "./session";

const LOGIN_ORIGIN = "https://login.abeka.com";
const SCHOOL_ORIGIN = "https://atschool.abeka.com";
const TENANT_PATH = "/abekab2c.onmicrosoft.com/B2C_1A_Signin_Legacy";
const CALLBACK_URL = `${SCHOOL_ORIGIN}/signin-oidc-b2c`;

export type LoginProbeCode =
  | "INVALID_REQUEST"
  | "SIGN_IN_REJECTED"
  | "INTERACTION_REQUIRED"
  | "LOGIN_FLOW_CHANGED"
  | "PROVIDER_UNAVAILABLE";

type ProbeDiagnostic =
  | "SETTINGS_FIELDS"
  | "CALLBACK_MISSING_FORM"
  | "CALLBACK_METHOD"
  | "CALLBACK_DESTINATION"
  | "CALLBACK_TOKEN_MISSING"
  | "CALLBACK_STATE_MISSING"
  | `${"CREDENTIAL_RESPONSE" | "CALLBACK_RESPONSE"}_${number}_${"JSON" | "HTML" | "OTHER"}`;

function responseDiagnostic(
  stage: "CREDENTIAL_RESPONSE" | "CALLBACK_RESPONSE",
  response: Response,
): ProbeDiagnostic {
  const type = response.headers.get("content-type") ?? "";
  const format = type.includes("application/json")
    ? "JSON"
    : type.includes("text/html")
      ? "HTML"
      : "OTHER";
  return `${stage}_${response.status}_${format}`;
}

export class LoginProbeError extends Error {
  constructor(
    readonly code: LoginProbeCode,
    readonly diagnostic?: ProbeDiagnostic,
  ) {
    super(code);
  }
}

export function validateLoginCredentials(value: unknown) {
  if (!value || typeof value !== "object")
    throw new LoginProbeError("INVALID_REQUEST");
  const { username, password } = value as Record<string, unknown>;
  if (
    typeof username !== "string" ||
    !username.trim() ||
    username.length > 320 ||
    typeof password !== "string" ||
    !password ||
    password.length > 1024 ||
    /[\x00-\x1f\x7f]/.test(username + password)
  )
    throw new LoginProbeError("INVALID_REQUEST");
  return { username: username.trim(), password };
}

function allowedUrl(value: string) {
  const url = new URL(value);
  if (
    ![LOGIN_ORIGIN, SCHOOL_ORIGIN].includes(url.origin) ||
    url.username ||
    url.password
  )
    throw new LoginProbeError("LOGIN_FLOW_CHANGED");
  return url;
}

function loginSettings(html: string) {
  // Read JSON only. Never execute scripts returned by the provider.
  const json = html.match(/\b(?:var\s+)?SETTINGS\s*=\s*(\{[\s\S]*?\});/);
  let settings;
  try {
    settings = JSON.parse(json?.[1] ?? "") as Record<string, unknown>;
  } catch {
    throw new LoginProbeError("LOGIN_FLOW_CHANGED");
  }
  const hosts = settings.hosts as Record<string, unknown> | undefined;
  if (
    settings.api !== "CombinedSigninAndSignup" ||
    hosts?.tenant !== TENANT_PATH ||
    hosts.policy !== "B2C_1A_Signin_Legacy" ||
    typeof settings.csrf !== "string" ||
    typeof settings.transId !== "string" ||
    !settings.csrf ||
    !settings.transId ||
    settings.csrf.length > 4096 ||
    settings.transId.length > 8192 ||
    !html.includes('"ID":"signInName"') ||
    !html.includes('"ID":"password"')
  )
    throw new LoginProbeError("LOGIN_FLOW_CHANGED", "SETTINGS_FIELDS");
  return { csrf: settings.csrf, transaction: settings.transId };
}

/** Verified web sign-in, not an official Abeka OAuth integration.
 * One credential submission. Only backend callers may consume the returned cookie;
 * identity tokens and the provider cookie jar never leave this invocation.
 */
export async function signInAbeka(
  input: { username: string; password: string },
  request: typeof fetch = fetch,
) {
  const credentials = validateLoginCredentials(input);
  const jar = new CookieJar();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  let requests = 0;

  async function send(url: string, body?: URLSearchParams, csrf?: string) {
    allowedUrl(url);
    if (++requests > 12) throw new LoginProbeError("LOGIN_FLOW_CHANGED");
    const headers = new Headers({ Cookie: await jar.getCookieString(url) });
    if (body) headers.set("Content-Type", "application/x-www-form-urlencoded");
    if (csrf) headers.set("X-CSRF-TOKEN", csrf);
    const response = await request(url, {
      method: body ? "POST" : "GET",
      body: body?.toString(),
      headers,
      redirect: "manual",
      signal: controller.signal,
    });
    for (const cookie of response.headers.getSetCookie())
      await jar.setCookie(cookie, url);
    if (response.status === 429 || response.status >= 500)
      throw new LoginProbeError("PROVIDER_UNAVAILABLE");
    return response;
  }

  async function follow(url: string, response?: Response) {
    for (let hop = 0; hop < 6; hop++) {
      const current = response ?? (await send(url));
      response = undefined;
      if (![301, 302, 303, 307, 308].includes(current.status))
        return { url, response: current };
      const location = current.headers.get("location");
      await current.body?.cancel();
      if (!location) throw new LoginProbeError("LOGIN_FLOW_CHANGED");
      url = allowedUrl(new URL(location, url).href).href;
    }
    throw new LoginProbeError("LOGIN_FLOW_CHANGED");
  }

  try {
    const page = await follow(REPORT_URL);
    if (
      page.response.status !== 200 ||
      new URL(page.url).origin !== LOGIN_ORIGIN
    )
      throw new LoginProbeError("LOGIN_FLOW_CHANGED");
    const settings = loginSettings(
      await readBoundedText(page.response, 2_000_000),
    );
    const query = new URLSearchParams({
      tx: settings.transaction,
      p: "B2C_1A_Signin_Legacy",
    });
    // This exact form endpoint is used by Abeka's public sign-in page.
    // Never follow a redirect carrying the password, retry it, or use password grant.
    const signedIn = await send(
      `${LOGIN_ORIGIN}${TENANT_PATH}/SelfAsserted?${query}`,
      new URLSearchParams({
        request_type: "RESPONSE",
        signInName: credentials.username,
        password: credentials.password,
      }),
      settings.csrf,
    );
    credentials.password = "";
    if (signedIn.status !== 200)
      throw new LoginProbeError(
        "INTERACTION_REQUIRED",
        responseDiagnostic("CREDENTIAL_RESPONSE", signedIn),
      );
    // The provider's client explicitly parses JSON regardless of its MIME label.
    // Validate the bounded body instead; never execute a returned script or HTML.
    const body = await readBoundedText(signedIn, 65_536);
    let result: unknown;
    try {
      result = JSON.parse(body);
    } catch {
      throw new LoginProbeError(
        "INTERACTION_REQUIRED",
        responseDiagnostic("CREDENTIAL_RESPONSE", signedIn),
      );
    }
    if (
      !result ||
      typeof result !== "object" ||
      Array.isArray(result) ||
      !("status" in result) ||
      (typeof result.status !== "string" && typeof result.status !== "number")
    )
      throw new LoginProbeError(
        "INTERACTION_REQUIRED",
        responseDiagnostic("CREDENTIAL_RESPONSE", signedIn),
      );
    if (result.status !== 200 && result.status !== "200")
      throw new LoginProbeError("SIGN_IN_REJECTED");
    const confirmQuery = new URLSearchParams({
      rememberMe: "false",
      csrf_token: settings.csrf,
      tx: settings.transaction,
      p: "B2C_1A_Signin_Legacy",
    });
    const confirmed = await follow(
      `${LOGIN_ORIGIN}${TENANT_PATH}/api/CombinedSigninAndSignup/confirmed?${confirmQuery}`,
    );
    const document = parse(
      await readBoundedText(confirmed.response, 2_000_000),
    );
    const form = document.querySelector("form");
    if (confirmed.response.status !== 200)
      throw new LoginProbeError(
        "INTERACTION_REQUIRED",
        responseDiagnostic("CALLBACK_RESPONSE", confirmed.response),
      );
    if (!form)
      throw new LoginProbeError(
        "INTERACTION_REQUIRED",
        "CALLBACK_MISSING_FORM",
      );
    if (form.getAttribute("method")?.toLowerCase() !== "post")
      throw new LoginProbeError("LOGIN_FLOW_CHANGED", "CALLBACK_METHOD");
    const action = new URL(form.getAttribute("action") ?? "", confirmed.url);
    if (action.href !== CALLBACK_URL)
      throw new LoginProbeError("LOGIN_FLOW_CHANGED", "CALLBACK_DESTINATION");
    const fields = new URLSearchParams();
    for (const field of form.querySelectorAll("input")) {
      const name = field.getAttribute("name");
      if (name && ["id_token", "state", "session_state"].includes(name))
        fields.set(name, field.getAttribute("value") ?? "");
    }
    if (!fields.get("id_token"))
      throw new LoginProbeError(
        "INTERACTION_REQUIRED",
        "CALLBACK_TOKEN_MISSING",
      );
    if (!fields.get("state"))
      throw new LoginProbeError("LOGIN_FLOW_CHANGED", "CALLBACK_STATE_MISSING");
    const callback = await send(CALLBACK_URL, fields);
    const landing = await follow(CALLBACK_URL, callback);
    await landing.response.body?.cancel();
    // A successful password response alone is not success: verify access to reporting.
    const report = await send(REPORT_URL);
    if (report.status !== 200) throw new LoginProbeError("SIGN_IN_REJECTED");
    const roster = parseRoster(await readBoundedText(report, 8_000_000));
    return {
      cookie: validateCookieHeader(await jar.getCookieString(REPORT_URL)),
      externalSchoolId: roster.externalSchoolId,
      externalSchoolName: roster.externalSchoolName,
      students: roster.students.length,
    };
  } catch (error) {
    if (error instanceof LoginProbeError) throw error;
    // fetch and parser errors can contain URLs/tokens. Never propagate those errors.
    throw new LoginProbeError("PROVIDER_UNAVAILABLE");
  } finally {
    credentials.password = "";
    await jar.removeAllCookies();
    clearTimeout(timeout);
  }
}

/** The development probe deliberately never returns a session to its caller. */
export async function probeAbekaLogin(
  input: { username: string; password: string },
  request: typeof fetch = fetch,
) {
  const result = await signInAbeka(input, request);
  return {
    externalSchoolId: result.externalSchoolId,
    externalSchoolName: result.externalSchoolName,
    students: result.students,
  };
}
