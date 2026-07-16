"use client";

import { useState } from "react";
import {
  AddDocumentTypeForm,
  DocumentTypeActions,
  DocumentTypeCard,
} from "@/components/sections/shell/documents/document-type-components";
import {
  createEditableDocumentTypeId,
  type EditableDocumentConfig,
} from "./document-default-types";

interface DocumentDefaultsManagerProps {
  documents: EditableDocumentConfig[] | null;
  loadingText: string;
  emptyTitle: string;
  emptyDescription: string;
  activeHint: string;
  hiddenHint: string;
  onChange: (documents: EditableDocumentConfig[]) => void;
}

export function DocumentDefaultsManager({
  documents,
  loadingText,
  emptyTitle,
  emptyDescription,
  activeHint,
  hiddenHint,
  onChange,
}: DocumentDefaultsManagerProps) {
  const [isAddingDocument, setIsAddingDocument] = useState(false);

  const handleAddDocument = async (document: {
    name: string;
    description?: string;
    required: boolean;
  }) => {
    const nextDocuments = [
      ...(documents ?? []),
      {
        documentTypeId: createEditableDocumentTypeId(document.name),
        name: document.name,
        description: document.description,
        visibility: document.required
          ? ("required" as const)
          : ("optional" as const),
      },
    ];

    onChange(nextDocuments);
  };

  if (documents === null) {
    return (
      <div className="rounded-lg border border-dashed px-4 py-5">
        <p className="text-sm text-muted-foreground">{loadingText}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <DocumentTypeActions
        isAddingDocument={isAddingDocument}
        setIsAddingDocument={setIsAddingDocument}
      />

      {isAddingDocument ? (
        <AddDocumentTypeForm
          onAddDocument={handleAddDocument}
          onClose={() => setIsAddingDocument(false)}
        />
      ) : null}

      {documents.length === 0 && !isAddingDocument ? (
        <div className="rounded-lg border border-dashed px-4 py-5">
          <h3 className="text-sm font-medium">{emptyTitle}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {emptyDescription}
          </p>
        </div>
      ) : null}

      {documents.map((document) => (
        <DocumentTypeCard
          key={document.documentTypeId}
          name={document.name}
          description={document.description}
          visibility={document.visibility}
          canEdit
          canDelete
          onSaveEdit={async ({ name, description, required }) => {
            onChange(
              documents.map((current) =>
                current.documentTypeId !== document.documentTypeId
                  ? current
                  : {
                      ...current,
                      name,
                      description,
                      visibility: required
                        ? "required"
                        : current.visibility === "hidden"
                          ? "hidden"
                          : "optional",
                    },
              ),
            );
          }}
          onDelete={async () => {
            onChange(
              documents.filter(
                (current) => current.documentTypeId !== document.documentTypeId,
              ),
            );
          }}
          onVisibilityChange={async (visibility) => {
            onChange(
              documents.map((current) =>
                current.documentTypeId !== document.documentTypeId
                  ? current
                  : {
                      ...current,
                      visibility,
                    },
              ),
            );
          }}
        >
          <p className="text-sm text-muted-foreground">
            {document.visibility === "hidden" ? hiddenHint : activeHint}
          </p>
        </DocumentTypeCard>
      ))}
    </div>
  );
}
