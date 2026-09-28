import { parse } from "node-html-parser";
import {
  AuthenticationRequired,
  DETAIL_URL,
  REPORT_URL,
  ProbeError,
  parseProgress,
} from "./progress";
import { readBoundedText, validateCookieHeader } from "./session";
import {
  CATALOG_URL,
  PERMISSIONS_URL,
  parseCatalogGroups,
  parseCatalogGrades,
  parseCatalogSubjects,
} from "./catalog";

const ID = /^[1-9]\d{0,15}$/;
export const MAX_SUBJECTS = 24;

export function parseRoster(html: string) {
  const document = parse(html);
  const select = document.querySelector("#ddlSchools");
  const school =
    select?.querySelector("option[selected]") ??
    select?.querySelector("option");
  const externalSchoolId = school?.getAttribute("value") ?? "";
  const externalSchoolName = school?.text.trim() ?? "";
  const table = document.querySelector("#gdvUsers");
  if (
    !ID.test(externalSchoolId) ||
    !externalSchoolName ||
    externalSchoolName.length > 300 ||
    !table
  )
    throw new ProbeError("REPORT_FORMAT_CHANGED");
  let unavailableStudents = 0;
  const students = table.querySelectorAll("tr").flatMap((row) => {
    if (row.querySelector("#lblUserType")?.text.trim() !== "Student") return [];
    if (
      !row
        .querySelectorAll("#bulUserStatus li")
        .some((item) => item.text.trim() === "1")
    )
      return [];
    const login = row.querySelector("#hidLoginId");
    if (!login && !row.querySelector("#detailsLinkButton")) {
      unavailableStudents++;
      return [];
    }
    const loginId = login?.getAttribute("value") ?? "";
    const name = row.querySelector("#lbldisplayName")?.text.trim() ?? "";
    if (!ID.test(loginId) || !name || name.length > 300)
      throw new ProbeError("REPORT_FORMAT_CHANGED");
    return [{ loginId, name }];
  });
  if (
    students.length > 5000 ||
    new Set(students.map((s) => s.loginId)).size !== students.length
  )
    throw new ProbeError("REPORT_FORMAT_CHANGED");
  return {
    externalSchoolId,
    externalSchoolName,
    students,
    unavailableStudents,
  };
}

export function parseSubjects(html: string, loginId: string) {
  const document = parse(html);
  if (document.querySelector("#hidLoginId")?.getAttribute("value") !== loginId)
    throw new ProbeError("STUDENT_MISMATCH");
  const select = document.querySelector("#ddlClasses");
  if (!select) throw new ProbeError("REPORT_FORMAT_CHANGED");
  const subjects = select.querySelectorAll("option").map((option) => ({
    id: option.getAttribute("value") ?? "",
    name: option.text.trim(),
  }));
  if (
    subjects.length > MAX_SUBJECTS ||
    subjects.some((s) => !ID.test(s.id) || !s.name) ||
    new Set(subjects.map((s) => s.id)).size !== subjects.length
  )
    throw new ProbeError("REPORT_FORMAT_CHANGED");
  return subjects;
}

// Fixed provider URLs: never accept a client URL or follow auth redirects with the cookie.
export function abekaClient(
  cookieInput: string,
  request: typeof fetch = fetch,
) {
  const cookie = validateCookieHeader(cookieInput);
  async function read(url: string, body?: object) {
    let response: Response | undefined;
    try {
      response = await request(url, {
        method: body ? "POST" : "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(12_000),
        headers: {
          Cookie: cookie,
          ...(body
            ? { "Content-Type": "application/json; charset=utf-8" }
            : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if ([301, 302, 303, 307, 308, 401, 403].includes(response.status))
        throw new AuthenticationRequired("NEEDS_RECONNECT");
      if (response.status !== 200) throw new ProbeError("PROVIDER_UNAVAILABLE");
      if (
        body &&
        !response.headers.get("content-type")?.includes("application/json")
      )
        throw new AuthenticationRequired("NEEDS_RECONNECT");
      return await readBoundedText(response, body ? 1_000_000 : 8_000_000);
    } catch (error) {
      if (error instanceof ProbeError) throw error;
      throw new ProbeError("PROVIDER_UNAVAILABLE");
    } finally {
      if (response?.body && !response.bodyUsed)
        await response.body.cancel().catch(() => undefined);
    }
  }
  return {
    catalogGroups: async () => parseCatalogGroups(await read(CATALOG_URL)),
    catalogGrades: async (groupId: string) => {
      if (!ID.test(groupId)) throw new ProbeError("INVALID_ID");
      return parseCatalogGrades(
        await read(`${PERMISSIONS_URL}/GetGroupGrades`, { GroupID: groupId }),
      );
    },
    catalogSubjects: async (groupId: string, grade: string) => {
      if (!ID.test(groupId) || !ID.test(grade))
        throw new ProbeError("INVALID_ID");
      return parseCatalogSubjects(
        await read(`${PERMISSIONS_URL}/GetGroupSubjects`, {
          GroupID: groupId,
          grade,
        }),
      );
    },
    roster: async () => parseRoster(await read(REPORT_URL)),
    subjects: async (loginId: string) => {
      if (!ID.test(loginId)) throw new ProbeError("INVALID_ID");
      return parseSubjects(
        await read(`${DETAIL_URL}?loginId=${loginId}`),
        loginId,
      );
    },
    progress: async (loginId: string, subjectId: string) => {
      if (!ID.test(loginId) || !ID.test(subjectId))
        throw new ProbeError("INVALID_ID");
      try {
        return parseProgress(
          JSON.parse(
            await read(`${DETAIL_URL}/GetVideoLessonDetails`, {
              loginId,
              subjectId,
            }),
          ),
        );
      } catch (error) {
        if (error instanceof ProbeError) throw error;
        throw new ProbeError("REPORT_FORMAT_CHANGED");
      }
    },
  };
}
