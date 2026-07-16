"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircleIcon } from "@heroicons/react/20/solid";

interface SuccessMessageProps {
  applicationCode: string;
  onNewApplication: () => void;
}

export function SuccessMessage({
  applicationCode,
  onNewApplication,
}: SuccessMessageProps) {
  const t = useTranslations("preadmission.success");

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-4">
      <Card className="w-full max-w-2xl">
        <CardContent className="pt-8 pb-8">
          <div className="flex flex-col items-center text-center space-y-6">
            <div className="rounded-full bg-green-500 p-4">
              <CheckCircleIcon className="h-12 w-12 text-white" />
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl sm:text-3xl font-bold">{t("title")}</h2>
              <p className="text-muted-foreground">{t("thanks")}</p>
            </div>

            <div className="space-y-4 max-w-lg">
              <p className="text-sm leading-relaxed">{t("message")}</p>
              <p className="text-sm font-medium">{applicationCode}</p>
              <p className="text-sm leading-relaxed">{t("purpose")}</p>
              <p className="text-sm leading-relaxed">{t("response")}</p>
              <div className="pt-2">
                <p className="text-sm font-semibold">{t("blessings")}</p>
                <p className="text-sm font-medium">{t("founders.mrs")}</p>
                <p className="text-sm font-medium">{t("founders.mr")}</p>
                <p className="text-sm text-muted-foreground">
                  {t("founders.title")}
                </p>
              </div>
            </div>

            <Button
              onClick={onNewApplication}
              size="lg"
              className="w-full sm:w-auto"
            >
              {t("newApplication")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
