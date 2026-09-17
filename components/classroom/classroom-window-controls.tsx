"use client";

import { AppWindow, ExternalLink, PictureInPicture2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  useClassroomPresentation,
  type ClassroomPresentation,
} from "./classroom-presentation";

export function ClassroomWindowControls({
  compact = false,
}: {
  compact?: boolean;
}) {
  const presentation = useClassroomPresentation();
  if (!presentation?.enabled) return null;
  return <WindowControls presentation={presentation} compact={compact} />;
}

function WindowControls({
  presentation,
  compact,
}: {
  presentation: ClassroomPresentation;
  compact: boolean;
}) {
  const t = useTranslations("classroom");
  const usePopup = presentation.error || presentation.floatingKind === "window";
  const actionLabel = presentation.nativeVideoActive
    ? "returnToClassroom"
    : usePopup
      ? "openClassroomWindow"
      : "floatingWindow";

  return (
    <div className="flex min-w-0 flex-wrap items-center justify-end gap-1">
      {compact && (
        <Button
          variant="ghost"
          size="sm"
          onClick={presentation.returnToClassroom}
          title={t("returnToClassroom")}
          aria-label={t("returnToClassroom")}
        >
          <ExternalLink className="size-4" />
          <span className="hidden @min-[600px]:inline">
            {t("returnToClassroom")}
          </span>
        </Button>
      )}
      {!presentation.external &&
        (!compact || (usePopup && !presentation.nativeVideoActive)) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={
              presentation.nativeVideoActive
                ? presentation.returnToClassroom
                : usePopup
                  ? presentation.openWindow
                  : presentation.openFloating
            }
            disabled={presentation.opening}
            title={t(actionLabel)}
            aria-label={t(actionLabel)}
          >
            {presentation.nativeVideoActive ? (
              <ExternalLink className="size-4" />
            ) : usePopup ? (
              <AppWindow className="size-4" />
            ) : (
              <PictureInPicture2 className="size-4" />
            )}
            <span className="hidden @min-[600px]:inline">{t(actionLabel)}</span>
          </Button>
        )}
    </div>
  );
}
