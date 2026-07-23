"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getErrorCode } from "@/lib/convex-errors";
import { getImageUploadErrorMessage } from "@/lib/files/image";
import {
  discardStorageUpload,
  uploadStorageFileDraft,
} from "@/lib/files/storage-upload";
import {
  createAcademicProfileDraft,
  normalizeAcademicProfileDraft,
  type AcademicProfileDraft,
  type NormalizedAcademicProfileDraft,
} from "@/lib/people/academic-person-draft";
import { MAX_GUARDIAN_STUDENT_PROFILES } from "@/lib/people/academic-limits";
import type { TenantOrganizationPersonRole } from "@/components/people/tenant-people.types";

type TenantAcademicPersonRole = Extract<
  TenantOrganizationPersonRole,
  "student" | "teacher"
>;

type ProfileImageFilesById = Record<string, File | null | undefined>;

type UploadedProfileImage = {
  profileId: string;
  storageId: Id<"_storage">;
};

function getCreateAcademicPersonErrorMessage(
  t: ReturnType<typeof useTranslations<"TenantPeople">>,
  commonT: ReturnType<typeof useTranslations<"Common">>,
  error: unknown,
) {
  const code =
    getErrorCode(error) ?? (error instanceof Error ? error.message : null);

  if (code === "PROFILE_NAME_REQUIRED") {
    return t("academicCreateDialog.errors.nameRequired");
  }

  if (code === "ACCOUNT_EMAIL_REQUIRED") {
    return t("academicCreateDialog.errors.emailRequired");
  }

  if (code === "PASSWORD_TOO_SHORT") {
    return t("academicCreateDialog.errors.passwordTooShort");
  }

  if (code === "PROFILE_PIN_INVALID_FORMAT") {
    return t("academicCreateDialog.errors.pinInvalidFormat");
  }

  if (code === "ORGANIZATION_PERSON_ACCOUNT_ALREADY_EXISTS") {
    return t("academicCreateDialog.errors.accountAlreadyExists");
  }

  if (code === "CAMPUS_NOT_FOUND") {
    return t("academicCreateDialog.errors.campusNotFound");
  }

  if (code === "GUARDIAN_STUDENT_COUNT_INVALID") {
    return t("academicCreateDialog.errors.studentCountInvalid");
  }

  if (code === "ACCOUNT_CREATE_FAILED") {
    return t("academicCreateDialog.errors.accountCreateFailed");
  }

  const imageMessage = getImageUploadErrorMessage({
    errorCode: code,
    invalidTypeMessage: commonT("imageUpload.errors.invalidType"),
    tooLargeMessage: commonT("imageUpload.errors.tooLarge"),
    uploadFailedMessage: commonT("imageUpload.errors.uploadFailed"),
    fallbackMessage: "",
  });

  if (imageMessage) {
    return imageMessage;
  }

  return t("genericError");
}

function withProfileImageStorageId(
  profile: NormalizedAcademicProfileDraft,
  imageStorageId: Id<"_storage"> | undefined,
) {
  return imageStorageId
    ? {
        ...profile,
        imageStorageId,
      }
    : profile;
}

function withoutProfileImageFile(
  files: ProfileImageFilesById,
  profileId: string,
) {
  const nextFiles = { ...files };
  delete nextFiles[profileId];
  return nextFiles;
}

export function useTenantCreateAcademicPersonDialog({
  slug,
  role,
}: {
  slug: string;
  role: TenantAcademicPersonRole;
}) {
  const t = useTranslations("TenantPeople");
  const commonT = useTranslations("Common");
  const provisionAcademicAccountProfiles = useAction(
    api.platform.academicPeopleActions.provisionAcademicAccountProfiles,
  );
  const generateImageUploadUrl = useMutation(
    api.platform.academicPeople.generateImageUploadUrl,
  );
  const discardImageUpload = useMutation(
    api.platform.academicPeople.discardImageUpload,
  );
  const [open, setOpen] = useState(false);
  const campuses = useQuery(
    api.platform.campuses.listForOrganization,
    open ? { slug } : "skip",
  );
  const [isGuardianManaged, setIsGuardianManaged] = useState(false);
  const [accountEmail, setAccountEmail] = useState("");
  const [password, setPassword] = useState("");
  const [guardianPin, setGuardianPin] = useState("");
  const [primaryProfile, setPrimaryProfile] = useState(() =>
    createAcademicProfileDraft("primary"),
  );
  const [guardianFirstName, setGuardianFirstName] = useState("");
  const [guardianLastName, setGuardianLastName] = useState("");
  const [studentProfiles, setStudentProfiles] = useState(() => [
    createAcademicProfileDraft("student-1"),
  ]);
  const [profileImageFilesById, setProfileImageFilesById] =
    useState<ProfileImageFilesById>({});
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const campusOptions = campuses ?? [];
  const isLoadingCampuses = open && campuses === undefined;
  const canAddStudentProfile =
    studentProfiles.length < MAX_GUARDIAN_STUDENT_PROFILES;

  function resetForm() {
    setIsGuardianManaged(false);
    setAccountEmail("");
    setPassword("");
    setGuardianPin("");
    setPrimaryProfile(createAcademicProfileDraft("primary"));
    setGuardianFirstName("");
    setGuardianLastName("");
    setStudentProfiles([createAcademicProfileDraft("student-1")]);
    setProfileImageFilesById({});
    setError(null);
    setIsSubmitting(false);
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);

    if (!nextOpen) {
      resetForm();
    }
  }

  function updateStudentProfile(
    profileId: string,
    nextProfile: AcademicProfileDraft,
  ) {
    setStudentProfiles((currentProfiles) =>
      currentProfiles.map((profile) =>
        profile.id === profileId ? nextProfile : profile,
      ),
    );
  }

  function addStudentProfile() {
    setStudentProfiles((currentProfiles) => {
      if (currentProfiles.length >= MAX_GUARDIAN_STUDENT_PROFILES) {
        return currentProfiles;
      }

      return [
        ...currentProfiles,
        createAcademicProfileDraft(
          `student-${currentProfiles.length + 1}-${Date.now()}`,
        ),
      ];
    });
  }

  function removeStudentProfile(profileId: string) {
    setStudentProfiles((currentProfiles) =>
      currentProfiles.length > 1
        ? currentProfiles.filter((profile) => profile.id !== profileId)
        : currentProfiles,
    );
    setProfileImageFilesById((currentFiles) => {
      return withoutProfileImageFile(currentFiles, profileId);
    });
  }

  function setProfileImageFile(profileId: string, file: File | null) {
    setProfileImageFilesById((currentFiles) => {
      if (!file) {
        return withoutProfileImageFile(currentFiles, profileId);
      }

      return {
        ...currentFiles,
        [profileId]: file,
      };
    });
  }

  async function uploadProfileImages(profileIds: string[]) {
    const uploadedImages: UploadedProfileImage[] = [];

    try {
      for (const profileId of profileIds) {
        const file = profileImageFilesById[profileId] ?? null;
        const storageId = await uploadStorageFileDraft({
          file,
          generateUploadUrl: () => generateImageUploadUrl({ slug }),
        });

        if (storageId) {
          uploadedImages.push({ profileId, storageId });
        }
      }
    } catch (uploadError) {
      await Promise.all(
        uploadedImages.map((uploadedImage) =>
          discardStorageUpload({
            storageId: uploadedImage.storageId,
            discardUpload: ({ storageId }) =>
              discardImageUpload({ slug, storageId }),
          }),
        ),
      );

      throw uploadError;
    }

    return uploadedImages;
  }

  function getProfileImageStorageId(
    uploadedImages: UploadedProfileImage[],
    profileId: string,
  ) {
    return uploadedImages.find(
      (uploadedImage) => uploadedImage.profileId === profileId,
    )?.storageId;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    const normalizedPrimaryProfile =
      normalizeAcademicProfileDraft(primaryProfile);
    const normalizedStudentProfiles = studentProfiles.map(
      normalizeAcademicProfileDraft,
    );

    setError(null);
    setIsSubmitting(true);

    try {
      const imageProfileIds =
        role === "student" && isGuardianManaged
          ? studentProfiles.map((profile) => profile.id)
          : [primaryProfile.id];
      const uploadedImages = await uploadProfileImages(imageProfileIds);
      const normalizedPrimaryProfileWithImage = withProfileImageStorageId(
        normalizedPrimaryProfile,
        getProfileImageStorageId(uploadedImages, primaryProfile.id),
      );
      const normalizedStudentProfilesWithImages = normalizedStudentProfiles.map(
        (studentProfile, index) =>
          withProfileImageStorageId(
            studentProfile,
            getProfileImageStorageId(
              uploadedImages,
              studentProfiles[index]?.id ?? "",
            ),
          ),
      );
      const accountKind =
        role === "teacher"
          ? {
              kind: "teacher" as const,
              profile: normalizedPrimaryProfileWithImage,
            }
          : isGuardianManaged
            ? {
                kind: "guardianStudents" as const,
                guardianProfile: {
                  firstName: guardianFirstName,
                  lastName: guardianLastName,
                },
                guardianPin,
                students: normalizedStudentProfilesWithImages,
              }
            : {
                kind: "selfManagedStudent" as const,
                profile: normalizedPrimaryProfileWithImage,
              };

      await provisionAcademicAccountProfiles({
        slug,
        email: accountEmail,
        password,
        accountKind,
      });

      toast.success(t("academicCreateDialog.success"));
      resetForm();
      setOpen(false);
    } catch (createError) {
      setError(getCreateAcademicPersonErrorMessage(t, commonT, createError));
      setIsSubmitting(false);
    }
  }

  return {
    open,
    isGuardianManaged,
    accountEmail,
    password,
    guardianPin,
    primaryProfile,
    guardianFirstName,
    guardianLastName,
    studentProfiles,
    error,
    isSubmitting,
    canAddStudentProfile,
    campusOptions,
    isLoadingCampuses,
    setIsGuardianManaged,
    setAccountEmail,
    setPassword,
    setGuardianPin,
    setPrimaryProfile,
    setProfileImageFile,
    setGuardianFirstName,
    setGuardianLastName,
    updateStudentProfile,
    addStudentProfile,
    removeStudentProfile,
    handleOpenChange,
    handleSubmit,
  };
}
