import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { deleteStoredImageIfPresent, validateStoredImageFile } from "./images";
import { throwAppError } from "./errors";

type Context = QueryCtx | MutationCtx;
type UserDoc = Doc<"users">;
type PersonDoc = Doc<"people">;

type AvatarChange =
  | { kind: "keep" }
  | { kind: "set"; storageId: Id<"_storage"> }
  | { kind: "remove" };

function normalizeOptionalString(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : undefined;
}

export function normalizePersonProfileName(args: {
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  requiredErrorCode?: string;
}) {
  const firstName = normalizeOptionalString(args.firstName);
  const lastName = normalizeOptionalString(args.lastName);
  const explicitDisplayName = normalizeOptionalString(args.displayName);
  const displayName =
    explicitDisplayName ?? [firstName, lastName].filter(Boolean).join(" ");

  if (!displayName) {
    throwAppError(args.requiredErrorCode ?? "PROFILE_NAME_REQUIRED");
  }

  return {
    firstName,
    lastName,
    displayName,
  };
}

export async function createPerson(
  ctx: MutationCtx,
  args: {
    firstName?: string | null;
    lastName?: string | null;
    displayName?: string | null;
    imageStorageId?: Id<"_storage">;
    requiredErrorCode?: string;
  },
) {
  const profile = normalizePersonProfileName(args);
  if (args.imageStorageId) {
    try {
      await validateAvatarStorageFile(ctx, args.imageStorageId);
    } catch (error) {
      await deleteStoredAvatarIfPresent(ctx, args.imageStorageId);
      throw error;
    }
  }

  const now = Date.now();
  const personId = await ctx.db.insert("people", {
    firstName: profile.firstName,
    lastName: profile.lastName,
    displayName: profile.displayName,
    imageStorageId: args.imageStorageId,
    createdAt: now,
    updatedAt: now,
  });
  const person = await ctx.db.get("people", personId);
  if (!person) {
    throwAppError("PERSON_NOT_FOUND");
  }

  return person;
}

export function getPersonNameParts(
  person:
    | Pick<PersonDoc, "displayName" | "firstName" | "lastName">
    | null
    | undefined,
) {
  const explicitFirstName = normalizeOptionalString(person?.firstName);
  const explicitLastName = normalizeOptionalString(person?.lastName);

  if (explicitFirstName || explicitLastName) {
    return {
      firstName: explicitFirstName ?? "",
      lastName: explicitLastName ?? "",
    };
  }

  const displayName = normalizeOptionalString(person?.displayName);
  if (!displayName) {
    return {
      firstName: "",
      lastName: "",
    };
  }

  const [firstName = "", ...rest] = displayName.split(/\s+/);

  return {
    firstName,
    lastName: rest.join(" "),
  };
}

export function getPersonDisplayName(
  person:
    | Pick<PersonDoc, "displayName" | "firstName" | "lastName">
    | null
    | undefined,
) {
  const explicitDisplayName = normalizeOptionalString(person?.displayName);
  if (explicitDisplayName) {
    return explicitDisplayName;
  }

  const { firstName, lastName } = getPersonNameParts(person);
  const displayName = [firstName, lastName].filter(Boolean).join(" ");

  return displayName || undefined;
}

export async function getUserPersonOrNull(
  ctx: Context,
  user: Pick<UserDoc, "personId">,
) {
  if (!user.personId) {
    return null;
  }

  return await ctx.db.get("people", user.personId);
}

export async function requirePersonById(ctx: Context, personId: Id<"people">) {
  const person = await ctx.db.get("people", personId);
  if (!person) {
    throwAppError("PERSON_NOT_FOUND");
  }

  return person;
}

export async function getEffectivePersonAvatarUrl(
  ctx: Context,
  args: {
    person: Pick<PersonDoc, "imageStorageId"> | null;
    fallbackImage?: string | null;
  },
) {
  if (args.person?.imageStorageId) {
    const storedAvatarUrl = await ctx.storage.getUrl(
      args.person.imageStorageId,
    );
    if (storedAvatarUrl) {
      return storedAvatarUrl;
    }
  }

  return args.fallbackImage ?? null;
}

export async function validateAvatarStorageFile(
  ctx: MutationCtx,
  storageId: Id<"_storage">,
) {
  await validateStoredImageFile(ctx, storageId);
}

export async function deleteStoredAvatarIfPresent(
  ctx: MutationCtx,
  storageId: Id<"_storage"> | undefined,
) {
  await deleteStoredImageIfPresent(ctx, storageId);
}

async function createPersonForUser(
  ctx: MutationCtx,
  args: {
    user: UserDoc;
    profile: ReturnType<typeof normalizePersonProfileName>;
    imageStorageId: Id<"_storage"> | undefined;
  },
) {
  const person = await createPerson(ctx, {
    firstName: args.profile.firstName,
    lastName: args.profile.lastName,
    displayName: args.profile.displayName,
    imageStorageId: args.imageStorageId,
  });

  await ctx.db.patch("users", args.user._id, {
    personId: person._id,
  });

  return person;
}

export async function savePersonProfileForUser(
  ctx: MutationCtx,
  args: {
    user: UserDoc;
    firstName: string;
    lastName: string;
    avatarChange: AvatarChange;
  },
) {
  const currentPerson = await getUserPersonOrNull(ctx, args.user);

  if (currentPerson) {
    await savePersonProfile(ctx, {
      personId: currentPerson._id,
      firstName: args.firstName,
      lastName: args.lastName,
      avatarChange: args.avatarChange,
    });
  } else {
    const normalizedProfile = normalizePersonProfileName(args);
    const imageStorageId =
      args.avatarChange.kind === "set" ? args.avatarChange.storageId : undefined;

    await createPersonForUser(ctx, {
      user: args.user,
      profile: normalizedProfile,
      imageStorageId,
    });
  }

  const updatedUser = await ctx.db.get("users", args.user._id);
  if (!updatedUser) {
    throwAppError("AUTHENTICATED_USER_NOT_FOUND");
  }

  return updatedUser;
}

export async function savePersonProfile(
  ctx: MutationCtx,
  args: {
    personId: Id<"people">;
    firstName: string;
    lastName: string;
    avatarChange: AvatarChange;
  },
) {
  const normalizedProfile = normalizePersonProfileName(args);
  const currentPerson = await requirePersonById(ctx, args.personId);
  let nextImageStorageId = currentPerson.imageStorageId;

  if (args.avatarChange.kind === "set") {
    try {
      await validateAvatarStorageFile(ctx, args.avatarChange.storageId);
    } catch (error) {
      await deleteStoredAvatarIfPresent(ctx, args.avatarChange.storageId);
      throw error;
    }

    nextImageStorageId = args.avatarChange.storageId;
  } else if (args.avatarChange.kind === "remove") {
    nextImageStorageId = undefined;
  }

  await ctx.db.patch("people", currentPerson._id, {
    firstName: normalizedProfile.firstName,
    lastName: normalizedProfile.lastName,
    displayName: normalizedProfile.displayName,
    imageStorageId: nextImageStorageId,
    updatedAt: Date.now(),
  });

  if (
    args.avatarChange.kind === "set" &&
    currentPerson.imageStorageId &&
    currentPerson.imageStorageId !== args.avatarChange.storageId
  ) {
    await deleteStoredAvatarIfPresent(ctx, currentPerson.imageStorageId);
  } else if (
    args.avatarChange.kind === "remove" &&
    currentPerson.imageStorageId
  ) {
    await deleteStoredAvatarIfPresent(ctx, currentPerson.imageStorageId);
  }

  return await requirePersonById(ctx, currentPerson._id);
}
