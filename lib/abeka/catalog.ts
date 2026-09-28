import { parse } from "node-html-parser";
import { ProbeError } from "./progress";

export const CATALOG_URL =
  "https://atschool.abeka.com/Account/Streaming/StreamingPermissions/ClassPermissions.aspx";
export const PERMISSIONS_URL =
  "https://atschool.abeka.com/Account/Streaming/StreamingPermissions/PermissionsProvider.asmx";
export const MAX_CATALOG_SUBJECTS = 500;
export type CatalogSubject = {
  subjectId: string;
  name: string;
  totalLessons: number;
};
const id = /^[1-9]\d{0,15}$/;
const invalid = () => new ProbeError("REPORT_FORMAT_CHANGED");

export function parseCatalogGroups(html: string) {
  const document = parse(html);
  const schools = document.querySelectorAll("#ddlSchools option");
  const selected =
    schools.find((o) => o.hasAttribute("selected")) ?? schools[0];
  const schoolId = selected?.getAttribute("value") ?? "";
  const subscriptions = document.querySelectorAll("#ddlSubscriptions option");
  // Only the observed single-subscription page is supported; never silently import a partial catalog.
  if (!id.test(schoolId) || subscriptions.length !== 1) throw invalid();
  const links = document
    .querySelectorAll("[onclick]")
    .filter((a) => a.getAttribute("onclick")?.startsWith("editPermissions("));
  const groups = links.map((a) => {
    const value = a
      .getAttribute("onclick")
      ?.match(/^editPermissions\("([1-9]\d{0,15})",/)?.[1];
    if (!value) throw invalid();
    return value;
  });
  if (
    !groups.length ||
    groups.length > 20 ||
    new Set(groups).size !== groups.length
  )
    throw invalid();
  return { schoolId, groups };
}

function list(
  text: string,
  field: "Grades" | "Subjects",
  maximum: number,
): Record<string, unknown>[] {
  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== "object" || !("d" in value)) throw invalid();
    const d = value.d;
    if (!d || typeof d !== "object" || !(field in d)) throw invalid();
    const rows = (d as Record<string, unknown>)[field];
    if (
      !Array.isArray(rows) ||
      !rows.length ||
      rows.length > maximum ||
      rows.some((r) => !r || typeof r !== "object" || Array.isArray(r))
    )
      throw invalid();
    return rows;
  } catch {
    throw invalid();
  }
}

export function parseCatalogGrades(text: string): string[] {
  const grades = list(text, "Grades", 24).map((row) => {
    if (!Number.isSafeInteger(row.GradeCode) || !id.test(String(row.GradeCode)))
      throw invalid();
    return String(row.GradeCode);
  });
  if (new Set(grades).size !== grades.length) throw invalid();
  return grades;
}

export function parseCatalogSubjects(text: string): CatalogSubject[] {
  const subjects = list(text, "Subjects", 50).map((row) => {
    if (
      !Number.isSafeInteger(row.SubjectId) ||
      !id.test(String(row.SubjectId)) ||
      typeof row.SubjectName !== "string" ||
      !row.SubjectName.trim() ||
      row.SubjectName.length > 300 ||
      typeof row.TotalLessons !== "number" ||
      !Number.isInteger(row.TotalLessons) ||
      row.TotalLessons < 1 ||
      row.TotalLessons > 500
    )
      throw invalid();
    // Checked, Percentage and LessonCount describe permissions, NOT student progress.
    return {
      subjectId: String(row.SubjectId),
      name: row.SubjectName.trim(),
      totalLessons: row.TotalLessons,
    };
  });
  if (new Set(subjects.map((s) => s.subjectId)).size !== subjects.length)
    throw invalid();
  return subjects;
}

export function mergeCatalogSubjects(rows: CatalogSubject[]): CatalogSubject[] {
  const subjects = new Map<string, CatalogSubject>();
  for (const row of rows) {
    const previous = subjects.get(row.subjectId);
    if (
      previous &&
      (previous.name !== row.name || previous.totalLessons !== row.totalLessons)
    )
      throw invalid();
    subjects.set(row.subjectId, row);
  }
  if (subjects.size > MAX_CATALOG_SUBJECTS) throw invalid();
  return [...subjects.values()];
}
