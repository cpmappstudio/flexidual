import { type Infer, v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import type {
  ApplicationApplicant,
  ApplicationProgramSnapshot,
  ApplicationStatus,
} from "../../lib/applications/types";
import { applicationStatus } from "./validators";
import { feeSummaryValidator, getFeeSummary } from "./feeSummary";
import {
  getApplicationApplicant,
  getApplicationPhotoStorageId,
  getApplicationProgramSnapshot,
  getFormDataString,
  type ApplicationFormData,
} from "./applicationSnapshots";

export const applicationListApplicantValidator = v.object({
  firstName: v.string(),
  lastName: v.string(),
  email: v.string(),
  telephone: v.string(),
  photoStorageId: v.optional(v.id("_storage")),
  photoUrl: v.optional(v.string()),
});

export const applicationListProgramValidator = v.object({
  name: v.string(),
});

export const applicationListAccountValidator = v.object({
  firstName: v.string(),
  lastName: v.string(),
  email: v.string(),
  imageUrl: v.optional(v.string()),
});

export const applicationListItemValidator = v.object({
  _id: v.id("applications"),
  _creationTime: v.number(),
  organizationId: v.id("organizations"),
  programId: v.optional(v.id("programs")),
  programIconKey: v.optional(v.string()),
  applicationCode: v.string(),
  status: applicationStatus,
  isArchived: v.boolean(),
  enrollmentYear: v.optional(v.string()),
  sex: v.optional(
    v.union(v.literal("male"), v.literal("female"), v.literal("other")),
  ),
  applicant: applicationListApplicantValidator,
  program: applicationListProgramValidator,
  account: applicationListAccountValidator,
  paymentSummary: feeSummaryValidator,
});

type ApplicationSummarySource = {
  _id: Id<"applications">;
  _creationTime: number;
  userId: Id<"users">;
  organizationId: Id<"organizations">;
  programId?: Id<"programs">;
  applicationCode: string;
  status: ApplicationStatus;
  isArchived?: boolean;
  applicant?: ApplicationApplicant;
  programSnapshot?: ApplicationProgramSnapshot;
  formData: ApplicationFormData;
  paymentSummary?: Infer<typeof feeSummaryValidator>;
};

type ApplicationAccountSummary = {
  firstName: string;
  lastName: string;
  email: string;
  imageUrl?: string;
} | null;

type ApplicationListSex = "male" | "female" | "other";

function getApplicationSex(
  formData: ApplicationFormData,
): ApplicationListSex | undefined {
  const sex = getFormDataString(formData, "athlete", "sex")
    .trim()
    .toLowerCase();
  if (sex === "male" || sex === "female" || sex === "other") {
    return sex;
  }

  return undefined;
}

function getApplicationEnrollmentYear(
  formData: ApplicationFormData,
): string | undefined {
  const enrollmentYear = getFormDataString(
    formData,
    "athlete",
    "enrollmentYear",
  ).trim();

  return enrollmentYear || undefined;
}

function mapToApplicationListItem(
  application: ApplicationSummarySource,
  account: ApplicationAccountSummary,
  paymentSummary: Awaited<ReturnType<typeof getFeeSummary>>,
) {
  const applicant = getApplicationApplicant(application);
  const programSnapshot = getApplicationProgramSnapshot(application);
  const photoStorageId = getApplicationPhotoStorageId(application);
  const sex = getApplicationSex(application.formData);
  const enrollmentYear = getApplicationEnrollmentYear(application.formData);

  return {
    _id: application._id,
    _creationTime: application._creationTime,
    organizationId: application.organizationId,
    ...(application.programId ? { programId: application.programId } : {}),
    ...(programSnapshot?.iconKey
      ? { programIconKey: programSnapshot.iconKey }
      : {}),
    applicationCode: application.applicationCode,
    status: application.status,
    isArchived: application.isArchived === true,
    ...(enrollmentYear ? { enrollmentYear } : {}),
    ...(sex ? { sex } : {}),
    applicant: {
      firstName:
        applicant?.firstName ??
        getFormDataString(application.formData, "athlete", "firstName"),
      lastName:
        applicant?.lastName ??
        getFormDataString(application.formData, "athlete", "lastName"),
      email:
        applicant?.email ??
        getFormDataString(application.formData, "athlete", "email"),
      telephone:
        applicant?.telephone ??
        getFormDataString(application.formData, "athlete", "telephone"),
      ...(photoStorageId ? { photoStorageId } : {}),
    },
    program: {
      name:
        programSnapshot?.name ??
        getFormDataString(application.formData, "athlete", "program"),
    },
    account: {
      firstName: account?.firstName ?? "",
      lastName: account?.lastName ?? "",
      email: account?.email ?? "",
      ...(account?.imageUrl ? { imageUrl: account.imageUrl } : {}),
    },
    paymentSummary,
  };
}

async function withPhotoUrls(
  ctx: QueryCtx,
  items: Array<ReturnType<typeof mapToApplicationListItem>>,
) {
  const cache: Record<Id<"_storage">, string | null> = {};

  return await Promise.all(
    items.map(async (item) => {
      if (!item.applicant.photoStorageId) {
        return item;
      }
      const storageId = item.applicant.photoStorageId;
      if (cache[storageId] === undefined) {
        cache[storageId] = await ctx.storage.getUrl(storageId);
      }
      const photoUrl = cache[storageId];
      return {
        ...item,
        applicant: {
          ...item.applicant,
          ...(photoUrl ? { photoUrl } : {}),
        },
      };
    }),
  );
}

export async function buildApplicationListSummary(
  ctx: QueryCtx,
  applications: ApplicationSummarySource[],
) {
  const userIds = [
    ...new Set(applications.map((application) => application.userId)),
  ];
  const [users, paymentSummaries] = await Promise.all([
    Promise.all(userIds.map((id) => ctx.db.get("users", id))),
    Promise.all(
      applications.map(
        (application) =>
          application.paymentSummary ?? getFeeSummary(ctx, application._id),
      ),
    ),
  ]);
  const userMap = new Map(
    users.filter(Boolean).map((item) => [item!._id, item!]),
  );

  const summary = applications.map((application, index) =>
    mapToApplicationListItem(
      application,
      userMap.get(application.userId) ?? null,
      paymentSummaries[index],
    ),
  );

  return await withPhotoUrls(ctx, summary);
}
