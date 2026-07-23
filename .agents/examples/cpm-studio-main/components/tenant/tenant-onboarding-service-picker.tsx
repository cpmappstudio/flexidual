import type { CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { HugeiconsIcon } from "@hugeicons/react";
import { CheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TenantSelectionLayout } from "@/components/tenant/tenant-selection-layout";
import type { TenantOnboardingServiceKey } from "@/lib/tenancy/services";
import { getTenantServiceDefinitions } from "@/lib/tenancy/services";
import { cn } from "@/lib/utils";

function withAlpha(color: string, alpha: number) {
  return color.replace(/\)$/, ` / ${alpha})`);
}

export function TenantOnboardingServicePicker({
  organizationName,
  organizationImageUrl,
  selectedServices,
  onToggleService,
  canContinue,
  continueLabel,
  onContinue,
}: {
  organizationName: string;
  organizationImageUrl: string | null;
  selectedServices: TenantOnboardingServiceKey[];
  onToggleService: (serviceKey: TenantOnboardingServiceKey) => void;
  canContinue: boolean;
  continueLabel: string;
  onContinue: () => void;
}) {
  const t = useTranslations("TenantOnboarding");
  const serviceDefinitions = getTenantServiceDefinitions();

  return (
    <TenantSelectionLayout
      organizationName={organizationName}
      organizationImageUrl={organizationImageUrl}
      title={t("title")}
      titleClassName="text-2xl md:text-3xl"
      footer={
        <section className="flex flex-col items-center justify-center gap-2">
          <Button type="button" disabled={!canContinue} onClick={onContinue}>
            {continueLabel}
            <span aria-hidden="true">→</span>
          </Button>
          {!canContinue ? (
            <p className="text-xs text-muted-foreground">
              {t("continueDisabledHint")}
            </p>
          ) : null}
        </section>
      }
    >
      {serviceDefinitions.map((option) => {
        const isSelected = selectedServices.includes(option.key);
        const selectedCardStyle: CSSProperties | undefined = isSelected
          ? {
              borderColor: withAlpha(option.iconColor, 0.55),
              backgroundColor: withAlpha(option.iconColor, 0.08),
              boxShadow: `0 20px 50px -24px ${withAlpha(
                option.iconColor,
                0.4,
              )}`,
            }
          : undefined;
        const selectedIndicatorStyle: CSSProperties | undefined = isSelected
          ? {
              borderColor: option.iconColor,
              backgroundColor: option.iconColor,
            }
          : undefined;
        const selectedIconWrapStyle: CSSProperties | undefined = isSelected
          ? {
              backgroundColor: withAlpha(option.iconColor, 0.1),
            }
          : undefined;

        return (
          <button
            key={option.key}
            type="button"
            aria-pressed={isSelected}
            aria-label={t(`services.${option.key}.title` as never)}
            onClick={() => onToggleService(option.key)}
            className="cursor-pointer rounded-3xl text-left outline-none transition-transform hover:-translate-y-0.5 focus-visible:ring-4 focus-visible:ring-ring/20"
          >
            <Card
              className={cn(
                "relative h-full rounded-3xl border border-border/70 bg-card py-0 text-center shadow-sm transition-[border-color,box-shadow,background-color]",
                "hover:border-border hover:shadow-md",
              )}
              style={selectedCardStyle}
            >
              <div
                className={cn(
                  "pointer-events-none absolute right-4 top-4 z-10 flex size-7 items-center justify-center rounded-full border transition-[border-color,background-color,color]",
                  isSelected
                    ? "text-white"
                    : "border-border/80 bg-background text-transparent",
                )}
                style={selectedIndicatorStyle}
                aria-hidden="true"
              >
                <CheckIcon className="size-3.5" />
              </div>

              <CardHeader className="justify-items-center gap-3 px-5 py-6 text-center">
                <div
                  className={cn(
                    "flex size-14 items-center justify-center rounded-2xl transition-[background-color,box-shadow]",
                    isSelected ? "bg-background shadow-sm" : "bg-muted/40",
                  )}
                  style={selectedIconWrapStyle}
                >
                  <HugeiconsIcon
                    icon={option.icon}
                    strokeWidth={1.8}
                    className="size-8"
                    color={option.iconColor}
                    aria-hidden="true"
                  />
                </div>
                <div className="space-y-2">
                  <CardTitle className="text-base text-primary">
                    {t(`services.${option.key}.title` as never)}
                  </CardTitle>
                  <CardDescription className="mx-auto max-w-48 text-center text-sm leading-6 text-muted-foreground">
                    {t(`services.${option.key}.description` as never)}
                  </CardDescription>
                </div>
              </CardHeader>
            </Card>
          </button>
        );
      })}
    </TenantSelectionLayout>
  );
}
