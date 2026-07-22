"use client";

import * as React from "react";
import { useMutation } from "convex/react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getBrowserTimeZone,
  TimeZoneInput,
} from "@/components/ui/time-zone-input";
import { useSettingsContext } from "@/hooks/use-settings-context";
import { isValidTimeZone } from "@/lib/time-zone";

export function InstitutionSettings() {
  const t = useTranslations("settings.institutionSettings");
  const { context, isLoading } = useSettingsContext();
  const updateInstitution = useMutation(api.schools.updateInstitutionSettings);
  const [name, setName] = React.useState("");
  const [timeZone, setTimeZone] = React.useState("");
  const [isSaving, setIsSaving] = React.useState(false);

  React.useEffect(() => {
    if (!context?.institution) return;
    setName(context.institution.name);
    setTimeZone(context.institution.timeZone ?? getBrowserTimeZone());
  }, [context?.institution]);

  if (isLoading) {
    return <Skeleton className="h-72 w-full rounded-xl" />;
  }

  if (!context?.canManageInstitution) {
    return (
      <section className="grid gap-3">
        <h2 className="border-b pb-3 text-xl font-semibold">
          {t("unavailableTitle")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t("unavailableDescription")}
        </p>
      </section>
    );
  }

  const institution = context.institution;
  const hasChanges =
    name.trim().length >= 2 &&
    isValidTimeZone(timeZone) &&
    (name.trim() !== institution.name || timeZone !== institution.timeZone);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!hasChanges) return;

    setIsSaving(true);
    try {
      await updateInstitution({ id: institution._id, name, timeZone });
      toast.success(t("saved"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("saveError"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="grid gap-3">
      <h2 className="border-b pb-3 text-xl font-semibold">{t("title")}</h2>
      <form className="grid w-full gap-5" onSubmit={handleSubmit}>
        <div className="grid gap-2">
          <Label htmlFor="institution-name">{t("name")}</Label>
          <Input
            id="institution-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            minLength={2}
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="institution-time-zone">{t("timeZone")}</Label>
          <TimeZoneInput
            id="institution-time-zone"
            value={timeZone}
            onChange={(event) => setTimeZone(event.target.value)}
            placeholder="America/New_York"
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="institution-slug">{t("identifier")}</Label>
          <Input id="institution-slug" value={institution.slug} disabled />
          <p className="text-xs text-muted-foreground">{t("identifierHint")}</p>
        </div>
        <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
          <div>
            <p className="text-sm font-medium">{t("status")}</p>
            <p className="text-xs text-muted-foreground">{t("statusHint")}</p>
          </div>
          <Badge variant={institution.isActive ? "default" : "secondary"}>
            {institution.isActive ? t("active") : t("inactive")}
          </Badge>
        </div>
        <Button
          type="submit"
          className="ml-auto w-fit"
          disabled={!hasChanges || isSaving}
        >
          {isSaving && <Loader2 className="animate-spin" />}
          {t("save")}
        </Button>
      </form>
    </section>
  );
}
