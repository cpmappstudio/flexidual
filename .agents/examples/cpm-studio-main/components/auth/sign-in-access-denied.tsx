"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useRouter } from "@/i18n/navigation";

export function SignInAccessDenied({
  signInHref,
}: {
  signInHref: string;
}) {
  const { signOut } = useAuthActions();
  const { refresh, replace } = useRouter();
  const t = useTranslations("SignIn");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSignOut() {
    setIsSubmitting(true);

    try {
      await signOut();
    } finally {
      replace(signInHref);
      refresh();
    }
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">{t("accessDeniedTitle")}</CardTitle>
        <CardDescription>{t("accessDeniedDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          type="button"
          className="w-full"
          disabled={isSubmitting}
          onClick={() => void handleSignOut()}
        >
          {isSubmitting ? t("loading") : t("signOut")}
        </Button>
      </CardContent>
    </Card>
  );
}
