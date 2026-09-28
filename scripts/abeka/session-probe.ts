import {
  AuthenticationRequired,
  DETAIL_URL,
  ProbeError,
  parseProgress,
  summarize,
} from "./progress";
import { validateCookieHeader } from "../../lib/abeka/session";
export { validateCookieHeader } from "../../lib/abeka/session";

const MAX_RESPONSE_BYTES = 1_000_000;
const SUBJECTS = ["117", "5298"] as const;

async function boundedJson(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) throw new ProbeError("Respuesta vacía.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES)
        throw new ProbeError("Respuesta demasiado grande.");
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

// Fixed, previously authorized pilot: no arbitrary URL or student input.
export async function probeSession(
  cookieInput: unknown,
  request: typeof fetch = fetch,
) {
  const cookie = validateCookieHeader(cookieInput);
  const results = [];
  for (const subjectId of SUBJECTS) {
    let response: Response | undefined;
    try {
      response = await request(`${DETAIL_URL}/GetVideoLessonDetails`, {
        method: "POST",
        redirect: "manual",
        signal: AbortSignal.timeout(30_000),
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          Cookie: cookie,
        },
        body: JSON.stringify({ loginId: "661704", subjectId }),
      });
      if ([301, 302, 303, 307, 308, 401, 403].includes(response.status))
        throw new AuthenticationRequired(
          "Abeka no aceptó la sesión o los permisos. No se importó nada.",
        );
      if (
        response.status !== 200 ||
        !response.headers.get("content-type")?.includes("application/json")
      )
        throw new ProbeError(
          "Abeka no devolvió un reporte válido. No se importó nada.",
        );
      results.push({
        subjectId,
        ...summarize(parseProgress(await boundedJson(response))),
      });
    } catch (error) {
      if (error instanceof ProbeError) throw error;
      throw new ProbeError(
        "La consulta falló o agotó el tiempo. No se importó nada.",
      );
    } finally {
      if (response?.body && !response.bodyUsed)
        await response.body.cancel().catch(() => undefined);
    }
  }
  return { transport: "node-fetch", results, sessionPersisted: false };
}
