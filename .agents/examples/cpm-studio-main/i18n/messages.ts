import "server-only";

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { AppLocale } from "./routing";

type IntlMessages = Record<string, unknown>;

const MESSAGES_ROOT = path.join(process.cwd(), "messages");

async function collectMessageFiles(directoryPath: string): Promise<string[]> {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const nestedFiles = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directoryPath, entry.name);

      if (entry.isDirectory()) {
        return await collectMessageFiles(entryPath);
      }

      if (entry.isFile() && entry.name.endsWith(".json")) {
        return [entryPath];
      }

      return [];
    }),
  );

  return nestedFiles.flat().sort();
}

async function readMessageFile(filePath: string) {
  const rawFile = await readFile(filePath, "utf8");
  const parsed = JSON.parse(rawFile) as unknown;

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Message file must export an object: ${filePath}`);
  }

  return parsed as IntlMessages;
}

function mergeMessages(
  locale: AppLocale,
  files: Array<{ filePath: string; messages: IntlMessages }>,
) {
  const mergedMessages: IntlMessages = {};

  for (const { filePath, messages } of files) {
    for (const [namespace, value] of Object.entries(messages)) {
      if (namespace in mergedMessages) {
        const relativePath = path.relative(MESSAGES_ROOT, filePath);
        throw new Error(
          `Duplicate message namespace "${namespace}" for locale "${locale}" in ${relativePath}`,
        );
      }

      mergedMessages[namespace] = value;
    }
  }

  return mergedMessages;
}

export async function loadMessages(locale: AppLocale) {
  const localeDirectoryPath = path.join(MESSAGES_ROOT, locale);
  const messageFilePaths = await collectMessageFiles(localeDirectoryPath);
  const messageFiles = await Promise.all(
    messageFilePaths.map(async (filePath) => ({
      filePath,
      messages: await readMessageFile(filePath),
    })),
  );

  return mergeMessages(locale, messageFiles);
}
