export const MAX_BULK_LESSONS = 500;

export type LessonDraft = {
  title: string;
  description?: string;
  content?: string;
};

export type BulkLessonsParseResult = {
  lessons: LessonDraft[];
  invalidLines: number[];
};

function splitLessonLine(line: string): LessonDraft | null {
  const separatorIndexes = [line.indexOf("–"), line.indexOf("—")].filter(
    (index) => index >= 0,
  );
  const spacedHyphenIndex = line.indexOf(" - ");
  if (spacedHyphenIndex >= 0) separatorIndexes.push(spacedHyphenIndex);

  const separatorIndex =
    separatorIndexes.length > 0 ? Math.min(...separatorIndexes) : -1;
  if (separatorIndex < 0) return { title: line };

  const separatorLength = line.startsWith(" - ", separatorIndex) ? 3 : 1;
  const title = line.slice(0, separatorIndex).trim();
  if (!title) return null;

  const description = line.slice(separatorIndex + separatorLength).trim();
  return { title, description: description || undefined };
}

export function parseBulkLessons(value: string): BulkLessonsParseResult {
  const lessons: LessonDraft[] = [];
  const invalidLines: number[] = [];

  value.split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line || line === "---") return;

    const lesson = splitLessonLine(line);
    if (!lesson) {
      invalidLines.push(index + 1);
      return;
    }
    lessons.push(lesson);
  });

  return { lessons, invalidLines };
}
