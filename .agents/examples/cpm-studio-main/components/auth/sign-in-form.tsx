"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useTranslations } from "next-intl";
import { FormEvent, useState } from "react";
import { getAuthErrorMessage } from "@/components/auth/auth-error";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useRouter } from "@/i18n/navigation";
import { PasswordResetForm } from "@/components/auth/password-reset-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { getOptionalImageSrc } from "@/lib/files/image";

type SignInFormProps = {
  redirectHref: string;
  branding?: {
    name: string;
    imageUrl: string | null;
    imageAlt: string;
    imageFallback: string;
  };
};

export default function SignInForm({
  redirectHref,
  branding,
}: SignInFormProps) {
  const { signIn } = useAuthActions();
  const { replace } = useRouter();
  const t = useTranslations("SignIn");

  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (showPasswordReset) {
    return (
      <PasswordResetForm
        redirectHref={redirectHref}
        onCancel={() => setShowPasswordReset(false)}
      />
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    formData.set("flow", "signIn");

    try {
      await signIn("password", formData);
      replace(redirectHref);
    } catch {
      setError(getAuthErrorMessage(t, "signIn"));
      setIsSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader className="text-center">
        {branding ? (
          <div className="flex flex-col items-center gap-4">
            <Avatar className="size-16 rounded-2xl bg-muted/40 after:hidden">
              <AvatarImage
                src={getOptionalImageSrc(branding.imageUrl)}
                alt={branding.imageAlt}
                className="rounded-2xl"
              />
              <AvatarFallback className="rounded-2xl text-base font-semibold">
                {branding.imageFallback}
              </AvatarFallback>
            </Avatar>
            <div className="space-y-1.5">
              <CardTitle className="text-xl text-balance">{branding.name}</CardTitle>
              <CardDescription className="mx-auto max-w-xs text-pretty">
                {t("subtitle")}
              </CardDescription>
            </div>
          </div>
        ) : (
          <>
            <CardTitle className="text-xl">{t("title")}</CardTitle>
            <CardDescription>{t("subtitle")}</CardDescription>
          </>
        )}
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="email">{t("email")}</FieldLabel>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
              />
            </Field>
            <Field>
              <div className="flex items-center">
                <FieldLabel htmlFor="password">{t("password")}</FieldLabel>
                <Button
                  type="button"
                  variant="link"
                  className="ml-auto h-auto px-0 text-xs"
                  onClick={() => setShowPasswordReset(true)}
                >
                  {t("forgotPassword")}
                </Button>
              </div>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                minLength={8}
                required
              />
            </Field>
            <Field>
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? t("loading") : t("submitSignIn")}
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
