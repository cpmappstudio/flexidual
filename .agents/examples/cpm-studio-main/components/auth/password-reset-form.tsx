"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useTranslations } from "next-intl";
import { FormEvent, useState } from "react";
import { getAuthErrorMessage } from "@/components/auth/auth-error";
import { useRouter } from "@/i18n/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

type PasswordResetFormProps = {
  redirectHref: string;
  onCancel: () => void;
};

type PasswordResetStep = "request" | "verify";

export function PasswordResetForm({
  redirectHref,
  onCancel,
}: PasswordResetFormProps) {
  const { signIn } = useAuthActions();
  const { replace } = useRouter();
  const t = useTranslations("SignIn");

  const [step, setStep] = useState<PasswordResetStep>("request");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleResetRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    formData.set("flow", "reset");

    try {
      await signIn("password", formData);
      setEmail((formData.get("email") as string) ?? "");
      setStep("verify");
    } catch {
      setError(getAuthErrorMessage(t, "resetRequest"));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResetVerification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    formData.set("flow", "reset-verification");
    formData.set("email", email);

    try {
      await signIn("password", formData);
      replace(redirectHref);
    } catch {
      setError(getAuthErrorMessage(t, "resetVerification"));
      setIsSubmitting(false);
    }
  }

  return step === "request" ? (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">{t("resetTitle")}</CardTitle>
        <CardDescription>{t("resetSubtitle")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleResetRequest}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="reset-email">{t("email")}</FieldLabel>
              <Input
                id="reset-email"
                name="email"
                type="email"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </Field>
            <Field>
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? t("loading") : t("sendResetCode")}
              </Button>
            </Field>
            <Field>
              <Button
                type="button"
                variant="link"
                className="mx-auto h-auto px-0 text-sm"
                onClick={onCancel}
              >
                {t("backToSignIn")}
              </Button>
            </Field>
          </FieldGroup>
        </form>

        {error ? (
          <Alert variant="destructive" className="mt-4">
            <AlertDescription>
              {t("errorPrefix")}: {error}
            </AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  ) : (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">{t("resetCodeTitle")}</CardTitle>
        <CardDescription>{t("resetCodeSubtitle")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleResetVerification}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="verification-code">
                {t("verificationCode")}
              </FieldLabel>
              <Input
                id="verification-code"
                name="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                minLength={8}
                maxLength={8}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="new-password">{t("newPassword")}</FieldLabel>
              <Input
                id="new-password"
                name="newPassword"
                type="password"
                autoComplete="new-password"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                minLength={8}
                required
              />
              <FieldDescription>{t("passwordHint")}</FieldDescription>
            </Field>
            <Field>
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? t("loading") : t("submitResetPassword")}
              </Button>
            </Field>
            <Field>
              <Button
                type="button"
                variant="link"
                className="mx-auto h-auto px-0 text-sm"
                onClick={() => {
                  setError(null);
                  setStep("request");
                }}
              >
                {t("changeEmail")}
              </Button>
            </Field>
          </FieldGroup>
        </form>

        {error ? (
          <Alert variant="destructive" className="mt-4">
            <AlertDescription>
              {t("errorPrefix")}: {error}
            </AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}
