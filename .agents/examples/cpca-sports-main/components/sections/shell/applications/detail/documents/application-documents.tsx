"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Upload,
  FileIcon,
  CheckCircle2,
  XCircle,
  Eye,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { Id } from "@/convex/_generated/dataModel";
import {
  APPLICATION_DOCUMENTS,
  type ApplicationDocumentWithUser,
  type DocumentConfig,
  type DocumentType,
  type DocumentVisibility,
} from "@/lib/applications/document-types";
import { cn } from "@/lib/utils";
import {
  AddDocumentTypeForm,
  DocumentTypeActions,
  DocumentTypeCard,
} from "@/components/sections/shell/documents/document-type-components";

interface ApplicationDocumentsProps {
  applicationId: Id<"applications">;
  documents: ApplicationDocumentWithUser[];
  documentConfigs: DocumentConfig[];
  onUpload: (args: {
    applicationId: Id<"applications">;
    documentTypeId: string;
    name: string;
    description?: string;
    storageId: Id<"_storage">;
    fileName: string;
    contentType: string;
    fileSize: number;
  }) => Promise<Id<"applicationDocuments">>;
  onUpdateStatus: (args: {
    documentId: Id<"applicationDocuments">;
    status: "approved" | "rejected";
    rejectionReason?: string;
  }) => Promise<null>;
  onUpdateVisibility: (args: {
    applicationId: Id<"applications">;
    documentTypeId: string;
    visibility: DocumentVisibility;
  }) => Promise<Id<"applicationDocumentConfig">>;
  onGenerateUploadUrl: () => Promise<string>;
  onRemove: (args: { documentId: Id<"applicationDocuments"> }) => Promise<null>;
  onCreateCustomDocumentType: (args: {
    applicationId: Id<"applications">;
    name: string;
    description?: string;
    required: boolean;
  }) => Promise<Id<"applicationDocumentConfig">>;
  onUpdateCustomDocumentType: (args: {
    configId: Id<"applicationDocumentConfig">;
    name: string;
    description?: string;
    required: boolean;
  }) => Promise<null>;
  onDeleteCustomDocumentType: (args: {
    configId: Id<"applicationDocumentConfig">;
  }) => Promise<null>;
}

export function ApplicationDocuments({
  applicationId,
  documents,
  documentConfigs,
  onUpload,
  onUpdateStatus,
  onUpdateVisibility,
  onGenerateUploadUrl,
  onRemove,
  onCreateCustomDocumentType,
  onUpdateCustomDocumentType,
  onDeleteCustomDocumentType,
}: ApplicationDocumentsProps) {
  const { isAdmin } = useIsAdmin();
  const [isAddingDocument, setIsAddingDocument] = useState(false);

  const customDocumentsWithConfig = documentConfigs
    .filter((config) => config.isCustom && config.name)
    .map((config) => ({
      id: config.documentTypeId,
      name: config.name!,
      description: config.description,
      required: config.visibility === "required",
      configId: config._id,
    }));

  const customDocuments: DocumentType[] = customDocumentsWithConfig.map(
    (document) => ({
      id: document.id,
      name: document.name,
      description: document.description,
      required: document.required,
    }),
  );

  const allDocuments = [...APPLICATION_DOCUMENTS, ...customDocuments];

  const getCustomConfigId = (
    documentTypeId: string,
  ): Id<"applicationDocumentConfig"> | null => {
    const customDocument = customDocumentsWithConfig.find(
      (document) => document.id === documentTypeId,
    );

    return customDocument?.configId ?? null;
  };

  const isCustomDocument = (documentTypeId: string) => {
    return customDocumentsWithConfig.some(
      (document) => document.id === documentTypeId,
    );
  };

  const getDocumentVisibility = (
    documentType: DocumentType,
  ): DocumentVisibility => {
    const config = documentConfigs.find(
      (entry) => entry.documentTypeId === documentType.id,
    );

    if (config) {
      return config.visibility;
    }

    return documentType.required ? "required" : "optional";
  };

  const getUploadedDocument = (documentTypeId: string) => {
    return (
      documents.find(
        (document) => document.documentTypeId === documentTypeId,
      ) || null
    );
  };

  const visibleDocuments = allDocuments.filter((document) => {
    const visibility = getDocumentVisibility(document);
    return visibility !== "hidden" || isAdmin;
  });

  return (
    <div className="space-y-4">
      <DocumentTypeActions
        isAddingDocument={isAddingDocument}
        setIsAddingDocument={setIsAddingDocument}
      />

      {isAddingDocument ? (
        <AddDocumentTypeForm
          onAddDocument={async ({ name, description, required }) => {
            await onCreateCustomDocumentType({
              applicationId,
              name,
              description,
              required,
            });
          }}
          onClose={() => setIsAddingDocument(false)}
        />
      ) : null}

      {visibleDocuments.map((document) => (
        <ApplicationDocumentCard
          key={document.id}
          applicationId={applicationId}
          document={document}
          uploadedDocument={getUploadedDocument(document.id)}
          visibility={getDocumentVisibility(document)}
          isCustom={isCustomDocument(document.id)}
          customConfigId={getCustomConfigId(document.id)}
          onUpload={onUpload}
          onUpdateStatus={onUpdateStatus}
          onUpdateVisibility={onUpdateVisibility}
          onGenerateUploadUrl={onGenerateUploadUrl}
          onRemove={onRemove}
          onUpdateCustomDocumentType={onUpdateCustomDocumentType}
          onDeleteCustomDocumentType={onDeleteCustomDocumentType}
        />
      ))}
    </div>
  );
}

interface ApplicationDocumentCardProps {
  applicationId: Id<"applications">;
  document: DocumentType;
  uploadedDocument: ApplicationDocumentWithUser | null;
  visibility: DocumentVisibility;
  isCustom: boolean;
  customConfigId: Id<"applicationDocumentConfig"> | null;
  onUpload: ApplicationDocumentsProps["onUpload"];
  onUpdateStatus: ApplicationDocumentsProps["onUpdateStatus"];
  onUpdateVisibility: ApplicationDocumentsProps["onUpdateVisibility"];
  onGenerateUploadUrl: ApplicationDocumentsProps["onGenerateUploadUrl"];
  onRemove: ApplicationDocumentsProps["onRemove"];
  onUpdateCustomDocumentType: ApplicationDocumentsProps["onUpdateCustomDocumentType"];
  onDeleteCustomDocumentType: ApplicationDocumentsProps["onDeleteCustomDocumentType"];
}

function ApplicationDocumentCard({
  applicationId,
  document,
  uploadedDocument,
  visibility,
  isCustom,
  customConfigId,
  onUpload,
  onUpdateStatus,
  onUpdateVisibility,
  onGenerateUploadUrl,
  onRemove,
  onUpdateCustomDocumentType,
  onDeleteCustomDocumentType,
}: ApplicationDocumentCardProps) {
  const t = useTranslations("Applications.documents");
  const { isAdmin } = useIsAdmin();
  const [isUploading, setIsUploading] = useState(false);
  const canDeleteFile = !!uploadedDocument;

  const handleRemoveFile = async () => {
    if (!uploadedDocument) {
      return;
    }

    try {
      await onRemove({ documentId: uploadedDocument._id });
    } catch (error) {
      console.error("Failed to remove document:", error);
    }
  };

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setIsUploading(true);
    try {
      const uploadUrl = await onGenerateUploadUrl();
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      const { storageId } = await response.json();

      await onUpload({
        applicationId,
        documentTypeId: document.id,
        name: document.name,
        description: document.description,
        storageId,
        fileName: file.name,
        contentType: file.type,
        fileSize: file.size,
      });
    } catch (error) {
      console.error("Failed to upload document:", error);
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  };

  const getStatusBadge = () => {
    if (!uploadedDocument) {
      return (
        <Badge variant="outline" className="gap-1">
          <XCircle className="h-3 w-3" />
          {t("status.notUploaded")}
        </Badge>
      );
    }

    switch (uploadedDocument.status) {
      case "approved":
        return (
          <Badge
            variant="secondary"
            className="gap-1 bg-green-500/10 text-green-700 hover:bg-green-500/20 dark:text-green-400"
          >
            <CheckCircle2 className="h-3 w-3" />
            {t("status.approved")}
          </Badge>
        );
      case "rejected":
        return (
          <Badge variant="destructive" className="gap-1">
            <XCircle className="h-3 w-3" />
            {t("status.rejected")}
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="gap-1">
            {t("status.pending")}
          </Badge>
        );
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString();
  };

  return (
    <DocumentTypeCard
      name={document.name}
      description={document.description}
      visibility={visibility}
      statusBadge={getStatusBadge()}
      className={cn(
        uploadedDocument?.status === "rejected" && "border-destructive",
      )}
      canEdit={isAdmin && isCustom && !!customConfigId}
      canDelete={isAdmin && isCustom && !!customConfigId}
      onSaveEdit={
        customConfigId
          ? async ({ name, description, required }) => {
              await onUpdateCustomDocumentType({
                configId: customConfigId,
                name,
                description,
                required,
              });
            }
          : undefined
      }
      onDelete={
        customConfigId
          ? async () => {
              await onDeleteCustomDocumentType({ configId: customConfigId });
            }
          : undefined
      }
      onVisibilityChange={async (nextVisibility) => {
        await onUpdateVisibility({
          applicationId,
          documentTypeId: document.id,
          visibility: nextVisibility,
        });
      }}
    >
      {uploadedDocument ? (
        <div className="flex items-center justify-between rounded-lg border bg-muted/50 p-3">
          <div className="flex items-center gap-3">
            <FileIcon className="h-5 w-5 text-muted-foreground" />
            <div className="flex flex-col">
              <span className="text-sm font-medium">
                {uploadedDocument.fileName}
              </span>
              <span className="text-xs text-muted-foreground">
                {t("uploadedBy", {
                  date: formatDate(uploadedDocument.uploadedAt),
                  name: uploadedDocument.uploadedByUser
                    ? `${uploadedDocument.uploadedByUser.firstName} ${uploadedDocument.uploadedByUser.lastName}`
                    : "Unknown",
                })}
              </span>
            </div>
          </div>
          {uploadedDocument.url ? (
            <Button size="sm" variant="ghost" className="gap-1" asChild>
              <a
                href={uploadedDocument.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Eye className="h-4 w-4" />
                {t("actions.view")}
              </a>
            </Button>
          ) : null}
        </div>
      ) : null}

      {uploadedDocument?.status === "rejected" &&
      uploadedDocument.rejectionReason ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3">
          <p className="text-sm text-destructive">
            <strong>{t("rejectionReason")}:</strong>{" "}
            {uploadedDocument.rejectionReason}
          </p>
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <input
            type="file"
            id={`file-${document.id}`}
            className="hidden"
            onChange={handleFileChange}
            disabled={isUploading}
            accept=".pdf,.jpg,.jpeg,.png"
          />
          <Button
            asChild
            size="sm"
            className="w-full cursor-pointer"
            disabled={isUploading}
          >
            <label htmlFor={`file-${document.id}`} className="cursor-pointer">
              <Upload />
              {isUploading
                ? "Uploading..."
                : uploadedDocument
                  ? t("actions.replace")
                  : t("actions.upload")}
            </label>
          </Button>
        </div>

        {isAdmin && uploadedDocument ? (
          <>
            {uploadedDocument.status !== "approved" ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="bg-green-500 text-white hover:bg-green-600"
                    onClick={() =>
                      onUpdateStatus({
                        documentId: uploadedDocument._id,
                        status: "approved",
                      })
                    }
                  >
                    <CheckCircle2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t("actions.approve")}</p>
                </TooltipContent>
              </Tooltip>
            ) : null}

            {uploadedDocument.status !== "rejected" ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() =>
                      onUpdateStatus({
                        documentId: uploadedDocument._id,
                        status: "rejected",
                        rejectionReason:
                          "Document quality is not sufficient. Please upload a clearer version.",
                      })
                    }
                  >
                    <XCircle className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t("actions.reject")}</p>
                </TooltipContent>
              </Tooltip>
            ) : null}
          </>
        ) : null}

        {canDeleteFile ? (
          <AlertDialog>
            <Tooltip>
              <TooltipTrigger asChild>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
              </TooltipTrigger>
              <TooltipContent>
                <p>{t("actions.delete")}</p>
              </TooltipContent>
            </Tooltip>
            <AlertDialogContent size="sm">
              <AlertDialogHeader>
                <AlertDialogMedia className="bg-destructive/10 text-destructive dark:bg-destructive/20 dark:text-destructive">
                  <Trash2 />
                </AlertDialogMedia>
                <AlertDialogTitle>
                  {t("actions.deleteDialog.title")}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t("actions.deleteDialog.description")}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel variant="outline">
                  {t("actions.deleteDialog.cancel")}
                </AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  onClick={handleRemoveFile}
                >
                  {t("actions.deleteDialog.confirm")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
      </div>
    </DocumentTypeCard>
  );
}
