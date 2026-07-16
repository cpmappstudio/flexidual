export type DocumentTypeVisibility = "required" | "optional" | "hidden";

export type EditDocumentTypeInput = {
  name: string;
  description?: string;
  required: boolean;
};

export type ErrorHandler = (error: unknown) => void;

export function handleDocumentTypeError(
  error: unknown,
  onError?: ErrorHandler,
) {
  if (onError) {
    onError(error);
    return;
  }

  console.error(error);
}
