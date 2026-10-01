export const MAX_TASK_SUBMISSION_FILES = 20;
export const MAX_TASK_MATERIAL_FILES = 20;
export const MAX_TASK_FILE_BYTES = 18 * 1024 * 1024;
export const MAX_TASK_TOTAL_BYTES = 100 * 1024 * 1024;

const TASK_FILE_EXTENSIONS: Record<string, string[]> = {
  "application/pdf": ["pdf"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    "docx",
  ],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": [
    "pptx",
  ],
};

export const TASK_FILE_ACCEPT = Object.entries(TASK_FILE_EXTENSIONS)
  .flatMap(([mime, extensions]) => [
    mime,
    ...extensions.map((ext) => `.${ext}`),
  ])
  .join(",");

export function taskFileContentType(name: string) {
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  return Object.entries(TASK_FILE_EXTENSIONS).find(([, extensions]) =>
    extensions.includes(extension),
  )?.[0];
}

export function isValidTaskFile(file: {
  name: string;
  size: number;
  type: string;
}) {
  return (
    Number.isSafeInteger(file.size) &&
    file.size > 0 &&
    file.size <= MAX_TASK_FILE_BYTES &&
    file.name.trim().length > 0 &&
    file.name.length <= 180 &&
    !/[\x00-\x1f\x7f/\\]/.test(file.name) &&
    taskFileContentType(file.name) === file.type
  );
}

export function validTaskFileSet(
  files: readonly { size: number }[],
  maxFiles: number,
) {
  return (
    files.length <= maxFiles &&
    files.reduce((total, file) => total + file.size, 0) <= MAX_TASK_TOTAL_BYTES
  );
}
