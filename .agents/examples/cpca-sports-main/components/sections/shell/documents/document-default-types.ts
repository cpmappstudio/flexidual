"use client";

type DocumentVisibility = "required" | "optional" | "hidden";

export interface EditableDocumentConfig {
  documentTypeId: string;
  name: string;
  description?: string;
  visibility: DocumentVisibility;
}

export function createEditableDocumentTypeId(name: string) {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");

  return `document_${base || "custom"}_${Date.now().toString(36)}`;
}

export function mapEditableDocumentConfigs(
  configs: Array<{
    documentTypeId: string;
    name: string;
    description?: string;
    visibility: DocumentVisibility;
  }>,
): EditableDocumentConfig[] {
  return configs.map((config) => ({
    documentTypeId: config.documentTypeId,
    name: config.name,
    description: config.description,
    visibility: config.visibility,
  }));
}

export function serializeEditableDocumentConfigs(
  configs: EditableDocumentConfig[],
) {
  return JSON.stringify(
    configs.map((config) => ({
      documentTypeId: config.documentTypeId,
      name: config.name.trim(),
      description: config.description?.trim() || undefined,
      visibility: config.visibility,
    })),
  );
}
