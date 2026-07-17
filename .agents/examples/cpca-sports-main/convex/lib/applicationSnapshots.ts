import type { Id } from "../_generated/dataModel";
import type {
  ApplicationApplicant,
  ApplicationProgramSnapshot,
} from "../../lib/applications/types";

export type ApplicationFormData = Record<
  string,
  Record<string, string | number | boolean | null | Id<"_storage">>
>;

export function getFormDataString(
  formData: ApplicationFormData,
  sectionKey: string,
  fieldKey: string,
): string {
  const value = formData[sectionKey]?.[fieldKey];
  return value != null ? String(value) : "";
}

export function getLegacyPhotoStorageId(
  formData: ApplicationFormData,
): Id<"_storage"> | undefined {
  return getPhotoStorageId(formData.athlete?.photo);
}

function getPhotoStorageId(value: unknown): Id<"_storage"> | undefined {
  const raw = value;
  if (typeof raw !== "string") {
    return undefined;
  }
  if (raw.includes("/") || raw.includes(".")) {
    return undefined;
  }
  return raw as Id<"_storage">;
}

export function getApplicantFromFormData(formData: ApplicationFormData) {
  const photoStorageId = getLegacyPhotoStorageId(formData);
  const applicant = {
    firstName: getFormDataString(formData, "athlete", "firstName"),
    lastName: getFormDataString(formData, "athlete", "lastName"),
    email: getFormDataString(formData, "athlete", "email"),
    telephone: getFormDataString(formData, "athlete", "telephone"),
    ...(photoStorageId ? { photoStorageId } : {}),
  };

  if (
    !applicant.firstName &&
    !applicant.lastName &&
    !applicant.email &&
    !applicant.telephone &&
    !photoStorageId
  ) {
    return undefined;
  }

  return applicant;
}

export function getProgramSnapshotFromFormData(
  formData: ApplicationFormData,
): ApplicationProgramSnapshot | undefined {
  const name = getFormDataString(formData, "athlete", "program").trim();
  if (!name) {
    return undefined;
  }

  return { name };
}

export function getApplicationApplicant(application: {
  applicant?: ApplicationApplicant;
  formData: ApplicationFormData;
}) {
  return (
    application.applicant ?? getApplicantFromFormData(application.formData)
  );
}

export function getApplicationProgramSnapshot(application: {
  programSnapshot?: ApplicationProgramSnapshot;
  formData: ApplicationFormData;
}) {
  return (
    application.programSnapshot ??
    getProgramSnapshotFromFormData(application.formData)
  );
}

export function getApplicationPhotoStorageId(application: {
  applicant?: ApplicationApplicant;
  formData: ApplicationFormData;
}) {
  return getApplicationPhotoStorageIds(application)[0];
}

export function getApplicationPhotoStorageIds(application: {
  applicant?: ApplicationApplicant;
  formData: ApplicationFormData;
}) {
  return [
    getPhotoStorageId(application.applicant?.photoStorageId),
    getLegacyPhotoStorageId(application.formData),
  ].filter((storageId, index, storageIds): storageId is Id<"_storage"> => {
    return !!storageId && storageIds.indexOf(storageId) === index;
  });
}
