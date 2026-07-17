"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { isSingleTenantMode } from "@/lib/tenancy/config";

const SINGLE_TENANT_MODE = isSingleTenantMode();
type InvitableRole = "member" | "admin" | "org:member" | "org:admin";
const DEFAULT_ROLE: InvitableRole = SINGLE_TENANT_MODE
  ? "member"
  : "org:member";

interface MemberInviteFormProps {
  tenant: string;
}

export function MemberInviteForm({ tenant }: MemberInviteFormProps) {
  const t = useTranslations("Settings.general.members.invite");
  const locale = useLocale();
  const [emailAddress, setEmailAddress] = useState("");
  const [role, setRole] = useState<InvitableRole>(DEFAULT_ROLE);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedEmail = emailAddress.trim();
    if (!normalizedEmail) {
      toast.error(t("emailRequired"));
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/organizations/${tenant}/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailAddress: normalizedEmail,
          role,
          locale,
        }),
      });

      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;

      if (!response.ok) {
        throw new Error(payload?.error || t("error"));
      }

      setEmailAddress("");
      setRole(DEFAULT_ROLE);
      toast.success(t("success"));
    } catch (error) {
      const message = error instanceof Error ? error.message : t("error");
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <p className="text-sm font-medium">{t("title")}</p>
      <p className="text-xs text-muted-foreground">{t("description")}</p>

      <form
        onSubmit={handleSubmit}
        className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center"
      >
        <Input
          type="email"
          value={emailAddress}
          onChange={(event) => setEmailAddress(event.target.value)}
          placeholder={t("emailPlaceholder")}
          disabled={isSubmitting}
          className="sm:flex-1"
        />
        <Select
          value={role}
          onValueChange={(value) => setRole(value as InvitableRole)}
          disabled={isSubmitting}
        >
          <SelectTrigger className="sm:w-[170px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SINGLE_TENANT_MODE ? (
              <>
                <SelectItem value="member">{t("roleMember")}</SelectItem>
                <SelectItem value="admin">{t("roleAdmin")}</SelectItem>
              </>
            ) : (
              <>
                <SelectItem value="org:member">{t("roleMember")}</SelectItem>
                <SelectItem value="org:admin">{t("roleAdmin")}</SelectItem>
              </>
            )}
          </SelectContent>
        </Select>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t("submitting") : t("submit")}
        </Button>
      </form>
    </div>
  );
}
