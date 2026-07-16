"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Banknote, FileDown, FileText } from "lucide-react";
import { centsToDollars, dollarsToCents } from "@/lib/utils/currency";

interface WireTransferSettingsProps {
  organizationSlug: string;
}

export function WireTransferSettings({
  organizationSlug,
}: WireTransferSettingsProps) {
  const t = useTranslations("Settings.general.wireTransfer");
  const paymentSettings = useQuery(api.paymentSettings.getByOrganizationSlug, {
    organizationSlug,
  });
  const updatePaymentSettings = useMutation(
    api.paymentSettings.upsertByOrganizationSlug,
  );
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  const [isWireTransferEnabled, setIsWireTransferEnabled] = useState(false);
  const [wireTransferThresholdDollars, setWireTransferThresholdDollars] =
    useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingPdf, setIsUploadingPdf] = useState(false);

  useEffect(() => {
    if (!paymentSettings) {
      return;
    }

    setIsWireTransferEnabled(paymentSettings.wireTransferEnabled);
    setWireTransferThresholdDollars(
      paymentSettings.wireTransferThresholdCents
        ? centsToDollars(paymentSettings.wireTransferThresholdCents)
        : 0,
    );
  }, [paymentSettings]);

  const wireTransferThresholdCents = useMemo(() => {
    if (!Number.isFinite(wireTransferThresholdDollars)) {
      return NaN;
    }
    return dollarsToCents(wireTransferThresholdDollars);
  }, [wireTransferThresholdDollars]);

  const hasCustomPdf = paymentSettings?.hasCustomWireTransferPdf ?? false;
  const currentPdfName =
    paymentSettings?.wireTransferPdfFileName ?? t("noPdfUploaded");
  const currentPdfHref = paymentSettings?.wireTransferPdfUrl ?? null;
  const isWireTransferThresholdValid =
    !isWireTransferEnabled ||
    (Number.isInteger(wireTransferThresholdCents) &&
      wireTransferThresholdCents > 0);
  const isWireTransferConfigurationValid =
    !isWireTransferEnabled || (isWireTransferThresholdValid && hasCustomPdf);

  const saveSettings = async (
    extra:
      | {
          wireTransferPdfStorageId: Id<"_storage">;
          wireTransferPdfFileName: string;
          wireTransferPdfContentType: string;
        }
      | {
          resetWireTransferPdf: true;
        }
      | undefined = undefined,
  ): Promise<boolean> => {
    const hasUploadedPdfAfterSave =
      extra && "wireTransferPdfStorageId" in extra
        ? true
        : extra && "resetWireTransferPdf" in extra
          ? false
          : hasCustomPdf;

    if (isWireTransferEnabled && !isWireTransferThresholdValid) {
      toast.error(t("errors.invalidThreshold"));
      return false;
    }

    if (isWireTransferEnabled && !hasUploadedPdfAfterSave) {
      toast.error(t("errors.pdfRequired"));
      return false;
    }

    await updatePaymentSettings({
      organizationSlug,
      wireTransferEnabled: isWireTransferEnabled,
      wireTransferThresholdCents: isWireTransferEnabled
        ? wireTransferThresholdCents
        : undefined,
      ...(extra ?? {}),
    });
    return true;
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const wasSaved = await saveSettings();
      if (!wasSaved) {
        return;
      }
      toast.success(t("saveSuccess"));
    } catch (error) {
      console.error("Failed to save wire transfer settings:", error);
      toast.error(t("saveError"));
    } finally {
      setIsSaving(false);
    }
  };

  const handlePdfUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const isPdfFile =
      file.type === "application/pdf" ||
      file.name.toLowerCase().endsWith(".pdf");
    if (!isPdfFile) {
      toast.error(t("errors.invalidPdf"));
      event.target.value = "";
      return;
    }

    if (isWireTransferEnabled && !isWireTransferThresholdValid) {
      toast.error(t("errors.invalidThreshold"));
      event.target.value = "";
      return;
    }

    setIsUploadingPdf(true);
    try {
      const uploadUrl = await generateUploadUrl();
      const result = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/pdf" },
        body: file,
      });

      if (!result.ok) {
        throw new Error("Upload failed");
      }

      const { storageId } = (await result.json()) as {
        storageId: Id<"_storage">;
      };
      const wasSaved = await saveSettings({
        wireTransferPdfStorageId: storageId,
        wireTransferPdfFileName: file.name,
        wireTransferPdfContentType: file.type || "application/pdf",
      });
      if (!wasSaved) {
        return;
      }
      toast.success(t("pdfUploadSuccess"));
    } catch (error) {
      console.error("Failed to upload wire transfer PDF:", error);
      toast.error(t("errors.uploadFailed"));
    } finally {
      setIsUploadingPdf(false);
      event.target.value = "";
    }
  };

  const handleRemovePdf = async () => {
    setIsSaving(true);
    try {
      const wasSaved = await saveSettings({ resetWireTransferPdf: true });
      if (!wasSaved) {
        return;
      }
      toast.success(t("pdfRemovedSuccess"));
    } catch (error) {
      console.error("Failed to remove wire transfer PDF:", error);
      toast.error(t("errors.saveFailed"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <Item variant="outline">
        <ItemMedia variant="icon">
          <Banknote />
        </ItemMedia>
        <ItemContent>
          <label className="mt-2 flex items-center gap-2 text-sm">
            <Checkbox
              checked={isWireTransferEnabled}
              onCheckedChange={(checked) =>
                setIsWireTransferEnabled(checked === true)
              }
              disabled={paymentSettings === undefined}
            />
            <span>{t("enable")}</span>
          </label>
          {isWireTransferEnabled && (
            <div className="mt-3 grid gap-2 sm:max-w-xs">
              <Label htmlFor="wire-transfer-threshold">
                {t("thresholdLabel")}
              </Label>
              <Input
                id="wire-transfer-threshold"
                type="number"
                min="0"
                step="0.01"
                value={wireTransferThresholdDollars || ""}
                placeholder={t("thresholdPlaceholder")}
                onChange={(event) =>
                  setWireTransferThresholdDollars(
                    Number.parseFloat(event.target.value) || 0,
                  )
                }
                disabled={paymentSettings === undefined}
              />
              <p className="text-xs text-muted-foreground">
                {t("thresholdHelp")}
              </p>
            </div>
          )}
        </ItemContent>
      </Item>

      <Item variant="outline" size="sm">
        <ItemMedia variant="icon">
          <FileText />
        </ItemMedia>
        <ItemContent>
          <ItemTitle className="truncate">{currentPdfName}</ItemTitle>
          <ItemDescription>
            {hasCustomPdf ? t("usingCustomPdf") : t("noPdfDescription")}
          </ItemDescription>
        </ItemContent>
        <ItemActions className="ml-auto flex-wrap justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => pdfInputRef.current?.click()}
            disabled={isUploadingPdf || paymentSettings === undefined}
          >
            {isUploadingPdf ? t("uploadingPdf") : t("uploadPdf")}
          </Button>
          {currentPdfHref && (
            <Button type="button" variant="outline" size="sm" asChild>
              <a
                href={currentPdfHref}
                download={currentPdfName}
                target="_blank"
                rel="noopener noreferrer"
              >
                <FileDown />
                {t("downloadCurrent")}
              </a>
            </Button>
          )}
          {hasCustomPdf && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void handleRemovePdf()}
              disabled={isSaving}
            >
              {t("removePdf")}
            </Button>
          )}
        </ItemActions>
      </Item>

      <input
        ref={pdfInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(event) => void handlePdfUpload(event)}
      />

      <div className="flex justify-end">
        <Button
          type="button"
          onClick={() => void handleSave()}
          disabled={
            isSaving ||
            paymentSettings === undefined ||
            !isWireTransferConfigurationValid
          }
        >
          {isSaving ? t("saving") : t("save")}
        </Button>
      </div>
    </div>
  );
}
