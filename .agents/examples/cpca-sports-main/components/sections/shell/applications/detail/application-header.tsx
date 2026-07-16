"use client";
import { useTranslations } from "next-intl";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Application, ApplicationStatus } from "@/lib/applications/types";
import { getFormField } from "@/lib/applications/types";
import { getCountryName } from "@/lib/countries/countries";
import { ApplicationPhoto } from "./pre-admission/application-photo";
import { Id } from "@/convex/_generated/dataModel";
import {
  APPLICATION_PHOTO_ACCEPT,
  ApplicationPhotoError,
  prepareApplicationPhoto,
} from "@/lib/images/application-photo";
import {
  BookOpen,
  GraduationCap,
  Calendar,
  ArrowLeft,
  ArrowRightLeft,
  Mail,
  Phone,
  Globe,
  Home,
  FileText,
  User,
  IdCard,
  Trash2,
  MoreVertical,
  MapPin,
  Archive,
  ArchiveRestore,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useState, useRef } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { ApplicationBalanceCard } from "./payments/application-balance-card";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { ROUTES } from "@/lib/navigation/routes";
import {
  ApplicationTransferDialog,
  type TransferUser,
} from "./application-transfer-dialog";

interface ApplicationHeaderProps {
  application: Application;
  organizationSlug: string;
  totalDue: number;
  totalPaid: number;
  totalPending: number;
  organizationLogoUrl?: string;
  associatedUser: TransferUser | null;
}

export function ApplicationHeader({
  application,
  organizationSlug,
  totalDue,
  totalPaid,
  totalPending,
  organizationLogoUrl,
  associatedUser,
}: ApplicationHeaderProps) {
  const t = useTranslations("Applications.detail");
  const tAthlete = useTranslations("preadmission.athlete");
  const { isAdmin } = useIsAdmin();
  const tStatus = useTranslations("Applications.statusOptions");

  const { formData } = application;
  const applicant = application.applicant;
  const programSnapshot = application.programSnapshot;

  const [status, setStatus] = useState<ApplicationStatus>(application.status);
  const [isUpdating, setIsUpdating] = useState(false);
  const [currentPhoto, setCurrentPhoto] = useState<Id<"_storage"> | null>(
    applicant?.photoStorageId ??
      ((formData.athlete?.photo as Id<"_storage">) || null),
  );
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isArchiveDialogOpen, setIsArchiveDialogOpen] = useState(false);
  const [isTransferDialogOpen, setIsTransferDialogOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const updateStatus = useMutation(api.applications.updateStatus);
  const updatePhoto = useMutation(api.applications.updatePhoto);
  const setArchived = useMutation(api.applications.setArchived);
  const deleteApplication = useMutation(api.applications.deleteApplication);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const liveAssociatedUser = useQuery(api.users.getById, {
    userId: application.userId,
  });
  const isArchived = application.isArchived === true;

  const firstName =
    applicant?.firstName || getFormField(formData, "athlete", "firstName");
  const lastName =
    applicant?.lastName || getFormField(formData, "athlete", "lastName");
  const email = applicant?.email || getFormField(formData, "athlete", "email");
  const telephone =
    applicant?.telephone || getFormField(formData, "athlete", "telephone");
  const birthDate = getFormField(formData, "athlete", "birthDate");
  const countryOfBirth = getFormField(formData, "athlete", "countryOfBirth");
  const countryOfCitizenship = getFormField(
    formData,
    "athlete",
    "countryOfCitizenship",
  );
  const format = getFormField(formData, "athlete", "format");
  const program =
    programSnapshot?.name || getFormField(formData, "athlete", "program");
  const gradeEntering = getFormField(formData, "athlete", "gradeEntering");
  const enrollmentYear = getFormField(formData, "athlete", "enrollmentYear");
  const graduationYear = getFormField(formData, "athlete", "graduationYear");
  const needsI20 = getFormField(formData, "athlete", "needsI20");
  const interestedInBoarding = getFormField(
    formData,
    "general",
    "interestedInBoarding",
  );

  const streetAddress = getFormField(formData, "address", "streetAddress");
  const city = getFormField(formData, "address", "city");
  const country = getFormField(formData, "address", "country");
  const currentAssociatedUser: TransferUser | null =
    liveAssociatedUser === undefined
      ? associatedUser
      : liveAssociatedUser
        ? {
            _id: liveAssociatedUser._id,
            firstName: liveAssociatedUser.firstName,
            lastName: liveAssociatedUser.lastName,
            email: liveAssociatedUser.email,
            imageUrl: liveAssociatedUser.imageUrl,
          }
        : null;
  const statusMap = {
    pending: { label: tStatus("pending"), variant: "outline" as const },
    reviewing: { label: tStatus("reviewing"), variant: "secondary" as const },
    "pre-admitted": {
      label: tStatus("pre-admitted"),
      variant: "default" as const,
    },
    admitted: { label: tStatus("admitted"), variant: "default" as const },
    denied: { label: tStatus("denied"), variant: "destructive" as const },
  };

  const statusInfo = statusMap[status];
  const applicationsListHref = `${ROUTES.org.applications.list(
    organizationSlug,
  )}?tab=${isArchived ? "archived" : "active"}`;

  const handleStatusChange = async (newStatus: ApplicationStatus) => {
    if (!isAdmin) return;

    setIsUpdating(true);
    try {
      await updateStatus({
        applicationId: application._id,
        status: newStatus,
      });

      setStatus(newStatus);
      toast.success(
        `Application status updated to: ${statusMap[newStatus].label}`,
      );
    } catch {
      toast.error("Failed to update application status. Please try again.");
    } finally {
      setIsUpdating(false);
    }
  };

  const getPhotoErrorMessage = (error: unknown) => {
    if (error instanceof ApplicationPhotoError) {
      if (error.code === "invalidType") {
        return "Please upload a JPG, PNG, or WebP image.";
      }
      if (error.code === "maxSize") {
        return "File size must be less than 5MB.";
      }
    }

    return "Failed to update photo. Please try again.";
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUpdating(true);

    try {
      const optimizedPhoto = await prepareApplicationPhoto(file);
      const uploadUrl = await generateUploadUrl();

      const result = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": optimizedPhoto.type },
        body: optimizedPhoto,
      });

      if (!result.ok) {
        throw new Error("Upload failed");
      }

      const { storageId } = await result.json();

      await updatePhoto({
        applicationId: application._id,
        photoStorageId: storageId,
      });

      setCurrentPhoto(storageId);
      toast.success("Photo updated successfully");
    } catch (error) {
      console.error("Failed to update photo:", error);
      toast.error(getPhotoErrorMessage(error));
    } finally {
      setIsUpdating(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDeleteApplication = async () => {
    if (!isAdmin) return;

    setIsUpdating(true);
    try {
      await deleteApplication({
        applicationId: application._id,
      });

      toast.success("Application deleted successfully");
      router.replace(ROUTES.org.applications.list(organizationSlug));
    } catch (error) {
      console.error("Failed to delete application:", error);
      toast.error("Failed to delete application. Please try again.");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSetArchived = async () => {
    if (!isAdmin) return;

    setIsUpdating(true);
    try {
      await setArchived({
        applicationId: application._id,
        isArchived: !isArchived,
      });

      toast.success(
        isArchived ? t("archive.restoreSuccess") : t("archive.archiveSuccess"),
      );
      setIsArchiveDialogOpen(false);
    } catch (error) {
      console.error("Failed to update application archive state:", error);
      toast.error(t("archive.error"));
    } finally {
      setIsUpdating(false);
    }
  };

  const handleOpenTransferDialog = () => {
    if (!isAdmin) {
      return;
    }
    setIsTransferDialogOpen(true);
  };

  const renderActionsMenu = (trigger: React.ReactNode) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        {currentAssociatedUser && (
          <>
            <DropdownMenuItem onSelect={handleOpenTransferDialog}>
              <ArrowRightLeft className="h-4 w-4" />
              <span>{t("transfer.action")}</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem asChild>
          <a href={`tel:${telephone}`} className="flex items-center gap-2">
            <Phone className="h-4 w-4" />
            <span>{t("call")}</span>
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={`mailto:${email}`} className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            <span>{t("email")}</span>
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => setIsArchiveDialogOpen(true)}>
          {isArchived ? (
            <ArchiveRestore className="h-4 w-4" />
          ) : (
            <Archive className="h-4 w-4" />
          )}
          <span>
            {isArchived ? t("archive.restore") : t("archive.archive")}
          </span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => setIsDeleteDialogOpen(true)}
        >
          <Trash2 className="h-4 w-4" />
          <span>{t("deleteApplication")}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const calculateAge = (birthDate: string) => {
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < birth.getDate())
    ) {
      age--;
    }
    return age;
  };
  return (
    <section className="flex flex-col gap-4">
      <Button
        asChild
        variant="outline"
        size="sm"
        className="w-fit bg-background"
      >
        <Link href={applicationsListHref}>
          <ArrowLeft className="h-4 w-4" />
          <span>{t("backToList")}</span>
        </Link>
      </Button>
      <Card className="relative overflow-hidden">
        {organizationLogoUrl && (
          <div
            className="absolute inset-0 bg-center bg-no-repeat bg-contain opacity-[0.05] pointer-events-none"
            style={{
              backgroundImage: `url(${organizationLogoUrl})`,
              backgroundSize: "60%",
            }}
          />
        )}
        <CardContent className="relative">
          <div className="space-y-4">
            <div className="flex items-start gap-4">
              <div className="w-20 h-20 shrink-0 relative">
                {currentPhoto ? (
                  <ApplicationPhoto
                    storageId={currentPhoto}
                    applicationId={application._id}
                    alt={`${firstName} ${lastName}`}
                  />
                ) : (
                  <div className="w-20 h-20 rounded-md bg-primary flex items-center justify-center">
                    <span className="text-primary-foreground text-2xl font-semibold">
                      {firstName.charAt(0).toUpperCase()}
                      {lastName.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={APPLICATION_PHOTO_ACCEPT}
                  onChange={handleFileChange}
                  className="hidden"
                  disabled={isUpdating}
                />
                <Button
                  size="icon"
                  variant="secondary"
                  className="absolute bottom-0 right-0 h-6 w-6 opacity-70 hover:opacity-100 hover:scale-100 transition-all duration-200"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUpdating}
                >
                  <Pencil className="h-2 w-2" />
                </Button>
              </div>
              <div className="flex flex-col gap-2 flex-1 min-w-0">
                <div className="flex flex-row justify-between items-start gap-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <h1 className="min-w-0 text-2xl md:text-3xl font-semibold tracking-tight">
                      {firstName} {lastName}
                    </h1>
                  </div>
                  {isArchived && (
                    <Badge variant="outline" className="shrink-0">
                      {t("archive.badge")}
                    </Badge>
                  )}
                </div>
                <div className="flex items-start gap-2 mt-1">
                  {isAdmin ? (
                    <>
                      <Select
                        value={status}
                        onValueChange={handleStatusChange}
                        disabled={isUpdating}
                      >
                        <SelectTrigger className="w-fit h-7 text-xs font-medium">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">
                            {tStatus("pending")}
                          </SelectItem>
                          <SelectItem value="reviewing">
                            {tStatus("reviewing")}
                          </SelectItem>
                          <SelectItem value="pre-admitted">
                            {tStatus("pre-admitted")}
                          </SelectItem>
                          <SelectItem value="admitted">
                            {tStatus("admitted")}
                          </SelectItem>
                          <SelectItem value="denied">
                            {tStatus("denied")}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </>
                  ) : (
                    <Badge variant={statusInfo.variant} className="w-fit">
                      {statusInfo.label}
                    </Badge>
                  )}
                  {isAdmin && (
                    <CardAction className="hidden md:block">
                      {renderActionsMenu(
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-9 w-9"
                          disabled={isUpdating}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>,
                      )}
                    </CardAction>
                  )}
                  {isAdmin && (
                    <div className="md:hidden">
                      {renderActionsMenu(
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-9 w-9"
                          disabled={isUpdating}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>,
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Divider */}
            <hr />

            {/* Segunda fila: Grid con campos clave */}
            <div className="grid grid-cols-1 gap-3 text-sm">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-primary shrink-0" />
                <span className="font-semibold text-foreground">
                  {t("age")}:
                </span>
                <span className="text-muted-foreground">
                  {birthDate ? `${calculateAge(birthDate)} years` : "-"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-primary shrink-0" />
                <span className="font-semibold text-foreground">
                  {t("birthCountry")}:
                </span>
                <span className="text-muted-foreground">
                  {getCountryName(countryOfBirth) || "-"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-primary shrink-0" />
                <span className="font-semibold text-foreground">
                  {t("citizenship")}:
                </span>
                <span className="text-muted-foreground">
                  {getCountryName(countryOfCitizenship) || "-"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary shrink-0" />
                <span className="font-semibold text-foreground">
                  {t("address")}:
                </span>
                <span className="text-muted-foreground">
                  {streetAddress && city && country
                    ? `${streetAddress}, ${city}, ${getCountryName(country)}`
                    : "-"}
                </span>
              </div>
              <hr />
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary shrink-0" />
                <span className="font-semibold text-foreground">
                  {t("format")}:
                </span>
                <span className="text-muted-foreground capitalize">
                  {format || "-"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-primary shrink-0" />
                <span className="font-semibold text-foreground">
                  {t("program")}:
                </span>
                <span className="text-muted-foreground capitalize">
                  {program || "-"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <GraduationCap className="h-4 w-4 text-primary shrink-0" />
                <span className="font-semibold text-foreground">
                  {t("gradeEntering")}:
                </span>
                <span className="text-muted-foreground">
                  {gradeEntering
                    ? gradeEntering === "postgraduate"
                      ? tAthlete("gradePostgraduate")
                      : tAthlete(
                          `grade${gradeEntering}` as keyof typeof tAthlete,
                        )
                    : "-"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary shrink-0" />
                <span className="font-semibold text-foreground">
                  {t("enrollmentYear")}:
                </span>
                <span className="text-muted-foreground">
                  {enrollmentYear || "-"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary shrink-0" />
                <span className="font-semibold text-foreground">
                  {t("graduationYear")}:
                </span>
                <span className="text-muted-foreground">
                  {graduationYear || "-"}
                </span>
              </div>
              <hr />
              <div className="flex items-center gap-2">
                <IdCard className="h-4 w-4 text-primary shrink-0" />
                <span className="font-semibold text-foreground">
                  {t("needsI20")}:
                </span>
                <span className="text-muted-foreground">
                  {needsI20 === "yes" ? t("yes") : t("no")}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Home className="h-4 w-4 text-primary shrink-0" />
                <span className="font-semibold text-foreground">
                  {t("boarding")}:
                </span>
                <span className="text-muted-foreground">
                  {interestedInBoarding === "yes" ? t("yes") : t("no")}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      <ApplicationBalanceCard
        totalDue={totalDue}
        totalPaid={totalPaid}
        totalPending={totalPending}
      />

      {isAdmin && currentAssociatedUser && (
        <ApplicationTransferDialog
          open={isTransferDialogOpen}
          onOpenChange={setIsTransferDialogOpen}
          applicationId={application._id}
          organizationId={application.organizationId}
          organizationSlug={organizationSlug}
          sourceUser={currentAssociatedUser}
        />
      )}

      <AlertDialog
        open={isArchiveDialogOpen}
        onOpenChange={setIsArchiveDialogOpen}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogMedia>
              {isArchived ? <ArchiveRestore /> : <Archive />}
            </AlertDialogMedia>
            <AlertDialogTitle>
              {isArchived
                ? t("archive.restoreTitle")
                : t("archive.archiveTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isArchived
                ? t("archive.restoreDescription")
                : t("archive.archiveDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="outline">
              {t("archive.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleSetArchived}>
              {isArchived
                ? t("archive.restoreConfirm")
                : t("archive.archiveConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Alert Dialog compartido para eliminar */}
      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-destructive/10 text-destructive dark:bg-destructive/20 dark:text-destructive">
              <Trash2 />
            </AlertDialogMedia>
            <AlertDialogTitle>Delete application?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this application and all its
              associated data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="outline">Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDeleteApplication}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
