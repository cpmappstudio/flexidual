"use client";
import { useRef, useState, type FormEvent } from "react";
import { useAuth } from "@clerk/nextjs";
import { useTranslations } from "next-intl";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { AbekaSignInForm } from "./abeka-login-probe";

export function AbekaConnectDialog({
  schoolId,
  open,
  onOpenChange,
  onAccepted,
}: {
  schoolId: Id<"schools">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAccepted?: () => void;
}) {
  const t = useTranslations("settings.integrations");
  function accepted() {
    onOpenChange(false);
    onAccepted?.();
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("connect")}</DialogTitle>
          <DialogDescription>{t("credentials.description")}</DialogDescription>
        </DialogHeader>
        <AbekaSignInForm schoolId={schoolId} onAccepted={accepted} />
        <details>
          <summary className="cursor-pointer text-sm text-muted-foreground">
            {t("credentials.manual")}
          </summary>
          <SessionForm schoolId={schoolId} onAccepted={accepted} />
        </details>
      </DialogContent>
    </Dialog>
  );
}

function SessionForm({
  schoolId,
  onAccepted,
}: {
  schoolId: Id<"schools">;
  onAccepted: () => void;
}) {
  const t = useTranslations("settings.integrations");
  const { getToken } = useAuth();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!input.current || busy) return;
    let cookie = input.current.value;
    input.current.value = "";
    setBusy(true);
    setError(null);
    try {
      const token = await getToken({ template: "convex" });
      const site =
        process.env.NEXT_PUBLIC_CONVEX_SITE_URL ??
        process.env.NEXT_PUBLIC_CONVEX_URL?.replace(
          ".convex.cloud",
          ".convex.site",
        );
      if (!token || !site) throw new Error();
      const response = await fetch(
        `${site}/abeka-session?schoolId=${encodeURIComponent(schoolId)}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "text/plain",
          },
          body: cookie,
        },
      );
      cookie = "";
      if (response.status === 503) {
        setError(t("notConfigured"));
        return;
      }
      if (!response.ok) throw new Error();
      onAccepted();
    } catch {
      setError(t("connectionError"));
    } finally {
      cookie = "";
      setBusy(false);
    }
  }
  return (
    <form
      onSubmit={submit}
      className="space-y-4 ph-no-capture ph-mask"
      data-ph-no-capture
    >
      <ol className="list-decimal pl-5 text-sm space-y-2">
        <li>{t("sessionStep1")}</li>
        <li>{t("sessionStep2")}</li>
      </ol>
      <div className="space-y-2">
        <Label htmlFor="abeka-cookie">{t("sessionLabel")}</Label>
        <Input
          ref={input}
          id="abeka-cookie"
          type="password"
          autoComplete="off"
          spellCheck={false}
          maxLength={16384}
          required
          disabled={busy}
          data-1p-ignore
          data-lpignore="true"
        />
        <p className="text-xs text-muted-foreground">{t("sessionWarning")}</p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy}>
        {busy && <Spinner aria-label={t("loading")} />}
        {t("saveSession")}
      </Button>
    </form>
  );
}
