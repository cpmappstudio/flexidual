"use client";

import {
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  type Ref,
} from "react";
import { useLocale } from "next-intl";
import {
  PDFViewer,
  LockModeType,
  ZoomMode,
  type AnnotationPlugin,
  type AnnotationTool,
  type CommandsPlugin,
  type UIPlugin,
  type PdfInkAnnoObject,
  type DocumentManagerPlugin,
  type ExportPlugin,
  type HistoryPlugin,
  type PDFViewerConfig,
  type PluginRegistry,
} from "@embedpdf/react-pdf-viewer";

const inkBehavior: AnnotationTool<PdfInkAnnoObject>["behavior"] = {
  commitDelay: 0,
};

const disabledCategories = [
  "document-open",
  "document-close",
  "document-protect",
  "form",
  "redaction",
  "signature",
  "stamp",
  "capture",
];

function getDisabledCategories(readOnly: boolean) {
  return readOnly
    ? [...disabledCategories, "annotation", "insert", "history"]
    : disabledCategories;
}

function applyReadOnly(registry: PluginRegistry, readOnly: boolean) {
  const categories = getDisabledCategories(readOnly);
  const annotations = registry
    .getPlugin<AnnotationPlugin>("annotation")!
    .provides();
  if (readOnly) annotations.setActiveTool(null);
  annotations.setLocked({
    type: readOnly ? LockModeType.All : LockModeType.None,
  });
  registry
    .getPlugin<CommandsPlugin>("commands")!
    .provides()
    .setDisabledCategories(categories);
  registry
    .getPlugin<UIPlugin>("ui")!
    .provides()
    .setDisabledCategories(categories);
}

export type TaskPdfViewerHandle = { exportPdf: () => Promise<Blob> };

export default function TaskPdfViewer({
  src,
  name,
  readOnly = true,
  author,
  viewerRef,
  onReady,
  onChange,
  onError,
}: {
  src: string;
  name: string;
  readOnly?: boolean;
  author?: string;
  viewerRef?: Ref<TaskPdfViewerHandle>;
  onReady?: () => void;
  onChange?: () => void;
  onError?: () => void;
}) {
  const locale = useLocale();
  const registry = useRef<PluginRegistry | null>(null);
  const unsubscribe = useRef<(() => void)[]>([]);
  const mode = useRef(readOnly);
  mode.current = readOnly;
  // EmbedPDF only reads config at mount; change tools without reopening the PDF.
  useEffect(() => {
    if (registry.current) applyReadOnly(registry.current, readOnly);
  }, [readOnly]);
  const callbacks = useRef({ onReady, onChange, onError });
  callbacks.current = { onReady, onChange, onError };
  useEffect(() => () => unsubscribe.current.forEach((stop) => stop()), []);
  useImperativeHandle(
    viewerRef,
    () => ({
      async exportPdf() {
        const annotations = registry.current
          ?.getPlugin<AnnotationPlugin>("annotation")
          ?.provides();
        const exporter = registry.current
          ?.getPlugin<ExportPlugin>("export")
          ?.provides();
        if (!annotations || !exporter) throw new Error("PDF_NOT_READY");
        await annotations.commit().toPromise();
        return new Blob([await exporter.saveAsCopy().toPromise()], {
          type: "application/pdf",
        });
      },
    }),
    [],
  );
  const config = useMemo<PDFViewerConfig>(
    () => ({
      src,
      tabBar: "never",
      zoom: { defaultZoomLevel: ZoomMode.FitWidth },
      documentManager: { maxDocuments: 1 },
      export: { defaultFileName: name },
      i18n: { defaultLocale: locale },
      fonts: { ui: null, signature: null },
      annotations: {
        annotationAuthor: author,
        // Finalize strokes before Save can export the document.
        tools: [
          { id: "ink", behavior: inkBehavior },
          { id: "inkHighlighter", behavior: inkBehavior },
        ],
        ...(readOnly ? { locked: { type: LockModeType.All } } : {}),
      },
      permissions: {
        overrides: {
          modifyContents: false,
          assembleDocument: false,
          fillForms: false,
        },
      },
      disabledCategories: getDisabledCategories(readOnly),
      theme: {
        preference: "system",
        light: {
          accent: {
            primary: "#1884b5",
            primaryHover: "#14739e",
            primaryActive: "#106286",
            primaryLight: "#e8f3f8",
            primaryForeground: "#ffffff",
          },
        },
      },
    }),
    [src, name, locale, author, readOnly],
  );
  return (
    // Keep modal scroll locks from cancelling gestures inside EmbedPDF's shadow DOM.
    <div
      className="size-full"
      onWheel={(event) => event.stopPropagation()}
      onTouchMove={(event) => event.stopPropagation()}
    >
      <PDFViewer
        config={config}
        className="size-full"
        onReady={(value) => {
          unsubscribe.current.forEach((stop) => stop());
          registry.current = value;
          applyReadOnly(value, mode.current);
          const documents = value
            .getPlugin<DocumentManagerPlugin>("document-manager")!
            .provides();
          const annotations = value
            .getPlugin<AnnotationPlugin>("annotation")!
            .provides();
          const notifyReady = () => {
            const document = documents.getActiveDocument();
            if (!document) return;
            if (document.pageCount === 0) callbacks.current.onError?.();
            else if (Object.keys(annotations.getState().pages).length > 0)
              callbacks.current.onReady?.();
          };
          unsubscribe.current = [
            documents.onDocumentOpened(notifyReady),
            documents.onActiveDocumentChanged(notifyReady),
            annotations.onAnnotationEvent((event) => {
              if (event.type === "loaded") notifyReady();
            }),
            documents.onDocumentError(() => callbacks.current.onError?.()),
            value
              .getPlugin<HistoryPlugin>("history")!
              .provides()
              .onHistoryChange(() => callbacks.current.onChange?.()),
          ];
          notifyReady();
        }}
      />
    </div>
  );
}
