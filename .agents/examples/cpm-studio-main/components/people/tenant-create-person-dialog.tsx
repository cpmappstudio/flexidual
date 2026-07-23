"use client";

import { FormEvent, useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSet,
  FieldLegend,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { TenantOrganizationPersonRole } from "@/components/people/tenant-people.types";
import { getErrorCode } from "@/lib/convex-errors";
import { organizationPersonRoles } from "@/lib/people/roles";

function getCreatePersonErrorMessage(
  t: ReturnType<typeof useTranslations<"TenantPeople">>,
  error: unknown,
) {
  const code = getErrorCode(error);
  if (!code) {
    return t("genericError");
  }

  if (code === "PROFILE_NAME_REQUIRED") {
    return t("createDialog.errors.nameRequired");
  }

  return t("genericError");
}

export function TenantCreatePersonDialog({
  slug,
  campusId,
}: {
  slug: string;
  campusId?: Id<"campuses">;
}) {
  const t = useTranslations("TenantPeople");
  const createPersonForOrganization = useMutation(
    api.platform.people.createPersonForOrganization,
  );
  const [open, setOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [roles, setRoles] = useState<TenantOrganizationPersonRole[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedRoles = useMemo(() => new Set(roles), [roles]);

  function resetForm() {
    setFirstName("");
    setLastName("");
    setDisplayName("");
    setRoles([]);
    setError(null);
    setIsSubmitting(false);
  }

  function toggleRole(role: TenantOrganizationPersonRole, checked: boolean) {
    setRoles((currentRoles) => {
      if (checked) {
        return currentRoles.includes(role)
          ? currentRoles
          : [...currentRoles, role];
      }

      return currentRoles.filter((currentRole) => currentRole !== role);
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      await createPersonForOrganization({
        slug,
        firstName,
        lastName,
        displayName: displayName.trim() || undefined,
        roles,
        campusId,
      });
      toast.success(t("createDialog.success"));
      resetForm();
      setOpen(false);
    } catch (createError) {
      setError(getCreatePersonErrorMessage(t, createError));
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          resetForm();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button type="button">{t("createPerson")}</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg rounded-3xl p-6">
        <DialogHeader>
          <DialogTitle>{t("createDialog.title")}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="people-first-name">
                {t("createDialog.firstNameLabel")}
              </FieldLabel>
              <Input
                id="people-first-name"
                name="firstName"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                placeholder={t("createDialog.firstNamePlaceholder")}
                autoComplete="off"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="people-last-name">
                {t("createDialog.lastNameLabel")}
              </FieldLabel>
              <Input
                id="people-last-name"
                name="lastName"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                placeholder={t("createDialog.lastNamePlaceholder")}
                autoComplete="off"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="people-display-name">
                {t("createDialog.displayNameLabel")}
              </FieldLabel>
              <Input
                id="people-display-name"
                name="displayName"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder={t("createDialog.displayNamePlaceholder")}
                autoComplete="off"
              />
              <FieldDescription>
                {t("createDialog.displayNameDescription")}
              </FieldDescription>
            </Field>

            <FieldSet>
              <FieldLegend>{t("createDialog.rolesLegend")}</FieldLegend>

              <div className="grid gap-2 sm:grid-cols-2">
                {organizationPersonRoles.map((role) => {
                  const checked = selectedRoles.has(role);

                  return (
                    <Field
                      key={role}
                      orientation="horizontal"
                      className="rounded-xl border border-border/70 px-3 py-2"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(nextChecked) =>
                          toggleRole(role, nextChecked === true)
                        }
                        aria-label={t(`roles.${role}`)}
                      />
                      <FieldLabel>{t(`roles.${role}`)}</FieldLabel>
                    </Field>
                  );
                })}
              </div>
            </FieldSet>

            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? t("createDialog.creating")
                : t("createDialog.submit")}
            </Button>

            <FieldError>{error}</FieldError>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}
