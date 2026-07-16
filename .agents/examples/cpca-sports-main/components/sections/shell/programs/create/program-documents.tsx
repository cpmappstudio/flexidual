"use client";

import { useTranslations } from "next-intl";
import { DocumentDefaultsManager } from "@/components/sections/shell/documents/document-defaults-manager";
import type { EditableDocumentConfig } from "@/components/sections/shell/documents/document-default-types";

interface ProgramDocumentsProps {
  documents: EditableDocumentConfig[] | null;
  onChange: (documents: EditableDocumentConfig[]) => void;
}

export function ProgramDocuments({
  documents,
  onChange,
}: ProgramDocumentsProps) {
  const tPrograms = useTranslations("Programs.create");

  return (
    <DocumentDefaultsManager
      documents={documents}
      loadingText={tPrograms("documents.loading")}
      emptyTitle={tPrograms("documents.emptyStateTitle")}
      emptyDescription={tPrograms("documents.emptyStateDescription")}
      activeHint={tPrograms("documents.activeHint")}
      hiddenHint={tPrograms("documents.hiddenHint")}
      onChange={onChange}
    />
  );
}
