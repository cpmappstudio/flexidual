"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Authenticated,
  Preloaded,
  usePreloadedQuery,
  useQuery,
  useMutation,
  useAction,
} from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { ApplicationHeader } from "./application-header";
import { ApplicationDetailFormTab } from "./application-detail-form-tab";
import { ApplicationDocuments } from "./documents/application-documents";
import { ApplicationPayments } from "./payments/application-payments";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Suspense } from "react";
import { UserIcon } from "@heroicons/react/20/solid";
import { CreditCard, File, History } from "lucide-react";
import { useTranslations } from "next-intl";
import { ApplicationTransactionHistory } from "./payments/application-transaction-history";
import type {
  ApplicationApplicant,
  FormData as ApplicationFormData,
} from "@/lib/applications/types";
import type { TransferUser } from "./application-transfer-dialog";
import { ROUTES } from "@/lib/navigation/routes";
import { useRouter } from "@/i18n/navigation";

interface ApplicationDetailWrapperProps {
  preloadedApplication: Preloaded<typeof api.applications.getById>;
  organizationSlug: string;
  applicationId: string;
  organizationLogoUrl?: string;
  associatedUser: TransferUser | null;
}

function ApplicationDetailContent({
  preloadedApplication,
  organizationSlug,
  applicationId,
  organizationLogoUrl,
  associatedUser,
}: ApplicationDetailWrapperProps) {
  const application = usePreloadedQuery(preloadedApplication);
  const t = useTranslations("Applications");
  const { isAdmin } = useIsAdmin();
  const router = useRouter();

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editedFormData, setEditedFormData] =
    useState<ApplicationFormData | null>(null);
  const [editedApplicant, setEditedApplicant] =
    useState<ApplicationApplicant | null>(null);
  const [sectionValidity, setSectionValidity] = useState<
    Record<string, boolean>
  >({
    athlete: true,
    address: true,
    school: true,
    parents: true,
    general: true,
  });
  const [isDynamicFormValid, setIsDynamicFormValid] = useState(true);
  const hasDynamicApplicationForm = Boolean(
    application?.programId && application?.formDefinitionSnapshot,
  );

  const isFormValid = hasDynamicApplicationForm
    ? isDynamicFormValid
    : Object.values(sectionValidity).every(Boolean);

  const convexApplicationId = applicationId as Id<"applications">;
  const shouldLoadApplicationRelations = application !== null;

  // Fetch fees and transactions from Convex
  const fees = useQuery(
    api.fees.getByApplication,
    shouldLoadApplicationRelations
      ? {
          applicationId: convexApplicationId,
        }
      : "skip",
  );
  const summary = useQuery(
    api.fees.getSummary,
    shouldLoadApplicationRelations
      ? {
          applicationId: convexApplicationId,
        }
      : "skip",
  );
  const transactionsWithFees = useQuery(
    api.transactions.getWithFeeDetails,
    shouldLoadApplicationRelations
      ? {
          applicationId: convexApplicationId,
        }
      : "skip",
  );

  // Fetch documents from Convex
  const documents = useQuery(
    api.documents.getByApplication,
    shouldLoadApplicationRelations
      ? {
          applicationId: convexApplicationId,
        }
      : "skip",
  );
  const documentConfigs = useQuery(
    api.documents.getConfigByApplication,
    shouldLoadApplicationRelations
      ? {
          applicationId: convexApplicationId,
        }
      : "skip",
  );

  // Mutations
  const createFee = useMutation(api.fees.create);
  const createRecurringPlan = useMutation(api.fees.createRecurringPlan);
  const removeFee = useMutation(api.fees.remove);
  const recordManualPayment = useMutation(api.fees.recordManualPayment);
  const updateFee = useMutation(api.fees.update);
  const updateRecurringSeries = useMutation(api.fees.updateRecurringSeries);
  const updateFormData = useMutation(api.applications.updateFormData);

  // Document mutations
  const uploadDocument = useMutation(api.documents.upload);
  const updateDocumentStatus = useMutation(api.documents.updateStatus);
  const updateDocumentVisibility = useMutation(api.documents.updateVisibility);
  const generateUploadUrl = useMutation(api.documents.generateUploadUrl);
  const removeDocument = useMutation(api.documents.remove);
  const createCustomDocumentType = useMutation(
    api.documents.createCustomDocumentType,
  );
  const updateCustomDocumentType = useMutation(
    api.documents.updateCustomDocumentType,
  );
  const deleteCustomDocumentType = useMutation(
    api.documents.deleteCustomDocumentType,
  );

  // Actions
  const createPaymentLink = useAction(api.square.createPaymentLink);

  // Callback to update edited form data from child cards
  const handleSectionDataChange = useCallback(
    (
      sectionKey: string,
      sectionData: Record<string, string | number | boolean | null>,
    ) => {
      setEditedFormData((prev) => {
        const base = prev ?? application?.formData ?? {};
        return {
          ...base,
          [sectionKey]: {
            ...base[sectionKey],
            ...sectionData,
          },
        };
      });
    },
    [application?.formData],
  );

  // Handler to save edited form data
  const handleSave = async () => {
    if (!application || !editedFormData) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    try {
      const payload: {
        applicationId: Id<"applications">;
        formData: ApplicationFormData;
        applicant?: ApplicationApplicant;
        replaceAll?: boolean;
      } = {
        applicationId: convexApplicationId,
        formData: editedFormData,
      };

      if (hasDynamicApplicationForm) {
        payload.replaceAll = true;
        const applicant = editedApplicant ?? application.applicant;
        if (applicant) {
          payload.applicant = applicant;
        }
      }

      await updateFormData(payload);
      setIsEditing(false);
      setEditedFormData(null);
      setEditedApplicant(null);
    } catch (error) {
      console.error("[Applications] Failed to save form data:", error);
    } finally {
      setIsSaving(false);
    }
  };

  // Handler to cancel editing
  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditedFormData(null);
    setEditedApplicant(null);
    setIsDynamicFormValid(true);
    setSectionValidity({
      athlete: true,
      address: true,
      school: true,
      parents: true,
      general: true,
    });
  };

  // Handler to start editing
  const handleStartEdit = () => {
    setEditedFormData(application?.formData ?? null);
    setEditedApplicant(application?.applicant ?? null);
    setIsEditing(true);
    setIsDynamicFormValid(true);
    setSectionValidity({
      athlete: true,
      address: true,
      school: true,
      parents: true,
      general: true,
    });
  };

  // Handler to update section validity
  const handleSectionValidityChange = useCallback(
    (sectionKey: string, isValid: boolean) => {
      setSectionValidity((prev) => ({
        ...prev,
        [sectionKey]: isValid,
      }));
    },
    [],
  );

  // Loading state
  const isLoading = fees === undefined || summary === undefined;

  const totalDue = summary?.totalDue ?? 0;
  const totalPaid = summary?.totalPaid ?? 0;
  const totalPending = summary?.totalPending ?? 0;

  useEffect(() => {
    if (application !== null) {
      return;
    }
    router.replace(ROUTES.org.applications.list(organizationSlug));
  }, [application, organizationSlug, router]);

  if (application === null) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 ">
      <div className="lg:col-span-2">
        <div className="lg:sticky lg:top-6">
          <ApplicationHeader
            application={application}
            organizationSlug={organizationSlug}
            totalDue={totalDue}
            totalPaid={totalPaid}
            totalPending={totalPending}
            organizationLogoUrl={organizationLogoUrl}
            associatedUser={associatedUser}
          />
        </div>
      </div>

      <div className="lg:col-span-3">
        <Tabs defaultValue="application" className="w-full">
          <ScrollArea className="w-full whitespace-nowrap">
            <TabsList>
              <TabsTrigger
                value="application"
                className="gap-1 px-2 text-xs md:px-3 md:text-sm"
              >
                <UserIcon className="hidden h-4 w-4 md:block" />
                <span>{t("tabs.application")}</span>
              </TabsTrigger>
              <TabsTrigger
                value="docs"
                className="gap-1 px-2 text-xs md:px-3 md:text-sm"
              >
                <File className="hidden h-4 w-4 md:block" />
                <span>{t("tabs.documents")}</span>
              </TabsTrigger>
              <TabsTrigger
                value="payments"
                className="gap-1 px-2 text-xs md:px-3 md:text-sm"
              >
                <CreditCard className="hidden h-4 w-4 md:block" />
                <span>{t("tabs.payments")}</span>
              </TabsTrigger>
              <TabsTrigger
                value="transactions"
                className="gap-1 px-2 text-xs md:px-3 md:text-sm"
              >
                <History className="hidden h-4 w-4 md:block" />
                <span>{t("tabs.transactions")}</span>
              </TabsTrigger>
            </TabsList>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
          <TabsContent value="application" className="mt-0">
            <ApplicationDetailFormTab
              application={application}
              isAdmin={isAdmin}
              isEditing={isEditing}
              isSaving={isSaving}
              isFormValid={isFormValid}
              hasDynamicApplicationForm={hasDynamicApplicationForm}
              formData={editedFormData ?? application.formData}
              applicant={editedApplicant ?? application.applicant}
              onStartEdit={handleStartEdit}
              onCancelEdit={handleCancelEdit}
              onSave={handleSave}
              onApplicantChange={setEditedApplicant}
              onFormDataChange={setEditedFormData}
              onDynamicValidationChange={setIsDynamicFormValid}
              onLegacySectionDataChange={handleSectionDataChange}
              onLegacySectionValidityChange={handleSectionValidityChange}
            />
          </TabsContent>
          <TabsContent value="docs" className="mt-0">
            <Suspense fallback={<Skeleton className="h-96 w-full" />}>
              {documents === undefined || documentConfigs === undefined ? (
                <Skeleton className="h-96 w-full" />
              ) : (
                <ApplicationDocuments
                  applicationId={convexApplicationId}
                  documents={documents}
                  documentConfigs={documentConfigs}
                  onUpload={uploadDocument}
                  onUpdateStatus={updateDocumentStatus}
                  onUpdateVisibility={updateDocumentVisibility}
                  onGenerateUploadUrl={generateUploadUrl}
                  onRemove={removeDocument}
                  onCreateCustomDocumentType={createCustomDocumentType}
                  onUpdateCustomDocumentType={updateCustomDocumentType}
                  onDeleteCustomDocumentType={deleteCustomDocumentType}
                />
              )}
            </Suspense>
          </TabsContent>
          <TabsContent value="payments" className="mt-0">
            <Suspense fallback={<Skeleton className="h-96 w-full" />}>
              {isLoading ? (
                <Skeleton className="h-96 w-full" />
              ) : (
                <ApplicationPayments
                  applicationId={convexApplicationId}
                  organizationSlug={organizationSlug}
                  fees={fees ?? []}
                  onAddFee={createFee}
                  onAddRecurringPlan={createRecurringPlan}
                  onRemoveFee={removeFee}
                  onRecordPayment={recordManualPayment}
                  onUpdateFee={updateFee}
                  onUpdateRecurringFee={updateRecurringSeries}
                  onCreatePaymentLink={createPaymentLink}
                />
              )}
            </Suspense>
          </TabsContent>
          <TabsContent value="transactions" className="mt-0">
            <ApplicationTransactionHistory
              transactionsWithFees={transactionsWithFees ?? []}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

export function ApplicationDetailWrapper(props: ApplicationDetailWrapperProps) {
  return (
    <Authenticated>
      <ApplicationDetailContent {...props} />
    </Authenticated>
  );
}
