"use client";

import { useRef, useState, type FormEvent } from "react";
import { useAuth } from "@clerk/nextjs";
import { useTranslations } from "next-intl";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function AbekaLoginProbe({ schoolId }: { schoolId: Id<"schools"> }) {
  const t = useTranslations("settings.integrations.loginProbe");
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          {t("title")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <AbekaSignInForm schoolId={schoolId} />
      </DialogContent>
    </Dialog>
  );
}

export function AbekaSignInForm({
  schoolId,
  onAccepted,
}: {
  schoolId: Id<"schools">;
  onAccepted?: () => void;
}) {
  const t = useTranslations("settings.integrations.loginProbe");
  const connectionText = useTranslations("settings.integrations.credentials");
  const { getToken } = useAuth();
  const username = useRef<HTMLInputElement>(null);
  const password = useRef<HTMLInputElement>(null);
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending.current || !username.current || !password.current) return;
    const credentials = {
      username: username.current.value,
      password: password.current.value,
    };
    username.current.value = "";
    password.current.value = "";
    pending.current = true;
    setBusy(true);
    setResult(null);
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
        `${site}/${onAccepted ? "abeka-credentials" : "abeka-login-probe"}?schoolId=${encodeURIComponent(schoolId)}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(credentials),
          signal: AbortSignal.timeout(70_000),
        },
      );
      const data: unknown = await response.json();
      if (
        onAccepted &&
        response.ok &&
        data &&
        typeof data === "object" &&
        "accepted" in data &&
        data.accepted === true
      ) {
        onAccepted();
        return;
      }
      if (
        response.ok &&
        data &&
        typeof data === "object" &&
        "verified" in data &&
        data.verified === true &&
        "externalSchoolName" in data &&
        typeof data.externalSchoolName === "string"
      ) {
        setResult(t("success", { school: data.externalSchoolName }));
      } else {
        const code =
          data && typeof data === "object" && "error" in data
            ? data.error
            : null;
        const known = [
          "NOT_ENABLED",
          "SIGN_IN_REJECTED",
          "INTERACTION_REQUIRED",
          "LOGIN_FLOW_CHANGED",
          "PROVIDER_UNAVAILABLE",
        ] as const;
        const key = known.find((key) => key === code);
        const diagnostic =
          data &&
          typeof data === "object" &&
          "diagnostic" in data &&
          typeof data.diagnostic === "string" &&
          /^(SETTINGS_FIELDS|CALLBACK_(MISSING_FORM|METHOD|DESTINATION|TOKEN_MISSING|STATE_MISSING)|(CREDENTIAL|CALLBACK)_RESPONSE_[1-5][0-9]{2}_(JSON|HTML|OTHER))$/.test(
            data.diagnostic,
          )
            ? data.diagnostic
            : null;
        const connectionError = [
          "SCHOOL_MISMATCH",
          "CONNECTION_CHANGED",
          "NOT_CONFIGURED",
        ].find((value) => value === code);
        const message = key
          ? t(`errors.${key}`)
          : onAccepted
            ? connectionText(
                connectionError ? `errors.${connectionError}` : "error",
              )
            : t("error");
        setResult(diagnostic ? `${message} (${diagnostic})` : message);
      }
    } catch {
      setResult(onAccepted ? connectionText("error") : t("error"));
    } finally {
      credentials.password = "";
      credentials.username = "";
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <form
      onSubmit={submit}
      className="space-y-4 ph-no-capture ph-mask"
      data-ph-no-capture
    >
      <div className="space-y-2">
        <Label htmlFor="abeka-probe-username">{t("username")}</Label>
        <Input
          ref={username}
          id="abeka-probe-username"
          autoComplete="off"
          spellCheck={false}
          maxLength={320}
          required
          disabled={busy}
          data-1p-ignore
          data-lpignore="true"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="abeka-probe-password">{t("password")}</Label>
        <Input
          ref={password}
          id="abeka-probe-password"
          type="password"
          autoComplete="off"
          maxLength={1024}
          required
          disabled={busy}
          data-1p-ignore
          data-lpignore="true"
        />
      </div>
      <Button type="submit" disabled={busy}>
        {busy && <Spinner aria-label={t("busy")} />}
        {busy ? t("busy") : onAccepted ? connectionText("submit") : t("submit")}
      </Button>
      {result && (
        <p role="status" className="text-sm">
          {result}
        </p>
      )}
    </form>
  );
}
