"use client";

import { memo, useEffect, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { useI18n, CaptureUpdateAction } from "@excalidraw/excalidraw";
import type {
  ExcalidrawImperativeAPI,
  UIAppState,
} from "@excalidraw/excalidraw/types";
import {
  Hand,
  MousePointer2,
  Pencil,
  Eraser,
  Square,
  Diamond,
  Circle,
  ArrowRight,
  Minus,
  Type,
  Image,
  EllipsisVertical,
  Frame,
  Code,
  WandSparkles,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const tools = {
  hand: Hand,
  selection: MousePointer2,
  freedraw: Pencil,
  eraser: Eraser,
  rectangle: Square,
  diamond: Diamond,
  ellipse: Circle,
  arrow: ArrowRight,
  line: Minus,
  text: Type,
  image: Image,
  frame: Frame,
  embeddable: Code,
  laser: WandSparkles,
};
type Tool = keyof typeof tools;
const labels = {
  hand: "toolBar.hand",
  selection: "toolBar.selection",
  freedraw: "toolBar.freedraw",
  eraser: "toolBar.eraser",
  rectangle: "toolBar.rectangle",
  diamond: "toolBar.diamond",
  ellipse: "toolBar.ellipse",
  arrow: "toolBar.arrow",
  line: "toolBar.line",
  text: "toolBar.text",
  image: "toolBar.image",
  frame: "toolBar.frame",
  embeddable: "toolBar.embeddable",
  laser: "toolBar.laser",
} as const;

function setPropertiesOpen(api: ExcalidrawImperativeAPI, open: boolean) {
  if ((api.getAppState().openMenu === "shape") === open) return;
  api.updateScene({
    appState: { openMenu: open ? "shape" : null },
    captureUpdate: CaptureUpdateAction.NEVER,
  });
}

/** Public tool API only; native history, property controls and dialogs stay in the SDK. */
export const WhiteboardMobileToolbar = memo(function WhiteboardMobileToolbar({
  api,
  activeTool,
  theme,
  openMenu,
  hasProperties,
  compact,
  boundary,
}: {
  api: ExcalidrawImperativeAPI;
  activeTool: UIAppState["activeTool"]["type"];
  theme: UIAppState["theme"];
  openMenu: UIAppState["openMenu"];
  hasProperties: boolean;
  compact: boolean;
  boundary: HTMLElement;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState<string | null>(null);
  const [shape, setShape] = useState<Tool>("rectangle");
  const [linear, setLinear] = useState<Tool>("arrow");
  const active = activeTool;
  if (!compact && open) setOpen(null);
  const ExtraIcon =
    active === "frame" || active === "embeddable" || active === "laser"
      ? tools[active]
      : EllipsisVertical;
  useEffect(() => {
    if (!compact && openMenu !== "shape") return;
    return api.onPointerDown(() => {
      setOpen(null);
      setPropertiesOpen(api, false);
    });
  }, [api, compact, openMenu]);
  useEffect(() => {
    if (!hasProperties) setPropertiesOpen(api, false);
  }, [api, hasProperties, openMenu]);
  if (
    (active === "rectangle" || active === "diamond" || active === "ellipse") &&
    shape !== active
  )
    setShape(active);
  if ((active === "arrow" || active === "line") && linear !== active)
    setLinear(active);
  if (
    (open === "shapes" &&
      !["rectangle", "diamond", "ellipse"].includes(active)) ||
    (open === "lines" && !["arrow", "line"].includes(active))
  )
    setOpen(null);
  function select(type: Tool) {
    api.setActiveTool(
      type === "image" ? { type, insertOnCanvasDirectly: true } : { type },
    );
    boundary
      .querySelector<HTMLElement>(".excalidraw-container")
      ?.focus({ preventScroll: true });
  }
  function tool(
    type: Tool,
    onClick = () => {
      setOpen(null);
      select(type);
    },
    showLabel = false,
  ) {
    const Icon = tools[type];
    return (
      <Button
        key={type}
        type="button"
        size="icon"
        variant="ghost"
        className={`whiteboard-tool ${showLabel ? "whiteboard-tool-menu-item" : ""}`}
        title={t(labels[type])}
        aria-label={t(labels[type])}
        aria-pressed={active === type}
        data-testid={`compact-tool-${type}`}
        onClick={onClick}
      >
        <Icon aria-hidden="true" />
        {showLabel && <span>{t(labels[type])}</span>}
      </Button>
    );
  }
  function group(id: string, selected: Tool, options: Tool[]) {
    return (
      <Popover.Root
        key={id}
        open={open === id}
        onOpenChange={(value) => setOpen(value ? id : null)}
      >
        <Popover.Trigger asChild>
          {tool(selected, () => {
            select(selected);
            setOpen(open === id ? null : id);
          })}
        </Popover.Trigger>
        <Popover.Content
          className="whiteboard-tool-popover"
          side="top"
          sideOffset={12}
          collisionBoundary={boundary}
          collisionPadding={8}
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          {options.map((type) =>
            tool(type, () => {
              select(type);
              if (id === "shapes") setShape(type);
              else setLinear(type);
            }),
          )}
        </Popover.Content>
      </Popover.Root>
    );
  }
  return (
    <div
      className={`excalidraw whiteboard-ui-overlay ${compact ? "whiteboard-ui-overlay--compact" : ""} ${theme === "dark" ? "theme--dark" : ""}`}
    >
      {hasProperties && (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="whiteboard-tool whiteboard-properties-trigger"
          aria-label={t("buttons.edit")}
          title={t("buttons.edit")}
          aria-pressed={openMenu === "shape"}
          onClick={() => setPropertiesOpen(api, openMenu !== "shape")}
        >
          <SlidersHorizontal aria-hidden="true" />
        </Button>
      )}
      {compact && (
        <div
          className="whiteboard-mobile-toolbar"
          role="toolbar"
          aria-label={t("headings.shapes")}
        >
          {tool("hand")}
          {tool("selection")}
          {tool("freedraw")}
          {tool("eraser")}
          {group("shapes", shape, ["rectangle", "diamond", "ellipse"])}
          {group("lines", linear, ["arrow", "line"])}
          <span className="whiteboard-wide-tool">{tool("text")}</span>
          <span className="whiteboard-wide-tool">{tool("image")}</span>
          <Popover.Root
            open={open === "more"}
            onOpenChange={(value) => setOpen(value ? "more" : null)}
          >
            <Popover.Trigger asChild>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="whiteboard-tool"
                aria-label={t("toolBar.extraTools")}
                aria-pressed={
                  active === "frame" ||
                  active === "embeddable" ||
                  active === "laser"
                }
                data-testid="compact-more"
              >
                <ExtraIcon aria-hidden="true" />
              </Button>
            </Popover.Trigger>
            <Popover.Content
              className="whiteboard-tool-popover whiteboard-more-tools"
              side="top"
              align="end"
              sideOffset={12}
              collisionBoundary={boundary}
              collisionPadding={8}
              onOpenAutoFocus={(event) => event.preventDefault()}
              onCloseAutoFocus={(event) => event.preventDefault()}
            >
              {(
                ["text", "image", "frame", "embeddable", "laser"] as Tool[]
              ).map((type) => (
                <div
                  key={type}
                  className={
                    type === "text" || type === "image"
                      ? "whiteboard-overflow-tool"
                      : undefined
                  }
                >
                  {tool(
                    type,
                    () => {
                      setOpen(null);
                      select(type);
                    },
                    true,
                  )}
                </div>
              ))}
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setOpen(null);
                  api.updateScene({
                    appState: { openDialog: { name: "ttd", tab: "mermaid" } },
                    captureUpdate: CaptureUpdateAction.NEVER,
                  });
                }}
              >
                <Code aria-hidden="true" />
                {t("toolBar.mermaidToExcalidraw")}
              </Button>
            </Popover.Content>
          </Popover.Root>
        </div>
      )}
    </div>
  );
});
