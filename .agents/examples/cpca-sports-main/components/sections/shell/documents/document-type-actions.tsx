"use client";

import type { Dispatch, SetStateAction } from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIsAdmin } from "@/hooks/use-is-admin";

interface DocumentTypeActionsProps {
  isAddingDocument: boolean;
  setIsAddingDocument: Dispatch<SetStateAction<boolean>>;
}

export function DocumentTypeActions({
  isAddingDocument,
  setIsAddingDocument,
}: DocumentTypeActionsProps) {
  const t = useTranslations("Applications.documents");
  const { isAdmin } = useIsAdmin();

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="flex items-center justify-start">
      <Button
        size="sm"
        variant={isAddingDocument ? "outline" : "default"}
        onClick={() => setIsAddingDocument((current) => !current)}
      >
        {isAddingDocument ? (
          <span className="hidden md:inline">{t("actions.cancel")}</span>
        ) : (
          <>
            <Plus />
            <span className="hidden md:inline">{t("actions.addDocument")}</span>
          </>
        )}
      </Button>
    </div>
  );
}
