export * from "../../lib/abeka/progress";
import type { APIRequestContext } from "@playwright/test";
import {
  AuthenticationRequired,
  DETAIL_URL,
  ProbeError,
  parseProgress,
} from "../../lib/abeka/progress";

export async function readProgress(
  request: APIRequestContext,
  loginId: string,
  subjectId: string,
) {
  if (!/^\d+$/.test(loginId) || !/^\d+$/.test(subjectId))
    throw new ProbeError("Identificador inválido.");
  const response = await request.post(`${DETAIL_URL}/GetVideoLessonDetails`, {
    data: { loginId, subjectId },
    maxRedirects: 0,
    timeout: 30_000,
    failOnStatusCode: false,
  });
  try {
    if ([301, 302, 303, 307, 308, 401, 403].includes(response.status()))
      throw new AuthenticationRequired("Sesión no válida.");
    if (
      response.status() !== 200 ||
      !response.headers()["content-type"]?.includes("application/json")
    )
      throw new ProbeError("Respuesta no válida.");
    return parseProgress(await response.json());
  } finally {
    await response.dispose();
  }
}
