"use client";

import { useEffect, useMemo, useState } from "react";
import type { ProgramFormDefinition } from "@/components/sections/shell/programs/create/form-builder/types";
import { serializeProgramFormDefinition } from "@/components/sections/shell/programs/create/form-builder/utils";
import type { EditableDocumentConfig } from "@/components/sections/shell/documents/document-default-types";
import { serializeEditableDocumentConfigs } from "@/components/sections/shell/documents/document-default-types";
import type { EditablePaymentDefault } from "@/components/sections/shell/payments/defaults/payment-default-state";
import {
  getSavablePaymentDefaults,
  serializeEditablePaymentDefaults,
} from "@/components/sections/shell/payments/defaults/payment-default-state";

interface UseFormDefaultsEditorStateArgs {
  resetKey: string;
  initialName: string;
  initialDescription?: string;
  initialFormDefinition: ProgramFormDefinition;
  liveDocumentConfigs: EditableDocumentConfig[] | undefined;
  livePaymentConfigs: EditablePaymentDefault[] | undefined;
}

export function useFormDefaultsEditorState({
  resetKey,
  initialName,
  initialDescription,
  initialFormDefinition,
  liveDocumentConfigs,
  livePaymentConfigs,
}: UseFormDefaultsEditorStateArgs) {
  const normalizedInitialDescription = initialDescription ?? "";
  const initialSerializedFormDefinition = useMemo(
    () => serializeProgramFormDefinition(initialFormDefinition),
    [initialFormDefinition],
  );

  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(normalizedInitialDescription);
  const [formDefinition, setFormDefinition] = useState<ProgramFormDefinition>(
    initialFormDefinition,
  );
  const [savedName, setSavedName] = useState(initialName);
  const [savedDescription, setSavedDescription] = useState(
    normalizedInitialDescription,
  );
  const [savedFormDefinition, setSavedFormDefinition] = useState(
    initialSerializedFormDefinition,
  );
  const [documentConfigs, setDocumentConfigs] = useState<
    EditableDocumentConfig[] | null
  >(null);
  const [savedDocumentConfigs, setSavedDocumentConfigs] = useState<
    string | null
  >(null);
  const [paymentConfigs, setPaymentConfigs] = useState<
    EditablePaymentDefault[] | null
  >(null);
  const [savedPaymentConfigs, setSavedPaymentConfigs] = useState<string | null>(
    null,
  );

  useEffect(() => {
    setName(initialName);
    setDescription(normalizedInitialDescription);
    setFormDefinition(initialFormDefinition);
    setSavedName(initialName);
    setSavedDescription(normalizedInitialDescription);
    setSavedFormDefinition(initialSerializedFormDefinition);
    setDocumentConfigs(null);
    setSavedDocumentConfigs(null);
    setPaymentConfigs(null);
    setSavedPaymentConfigs(null);
  }, [
    resetKey,
    initialDescription,
    initialFormDefinition,
    initialName,
    initialSerializedFormDefinition,
    normalizedInitialDescription,
  ]);

  const serializedFormDefinition = useMemo(
    () => serializeProgramFormDefinition(formDefinition),
    [formDefinition],
  );
  const serializedDocumentConfigs = useMemo(
    () =>
      documentConfigs === null
        ? null
        : serializeEditableDocumentConfigs(documentConfigs),
    [documentConfigs],
  );
  const serializedPaymentConfigs = useMemo(
    () =>
      paymentConfigs === null
        ? null
        : serializeEditablePaymentDefaults(paymentConfigs),
    [paymentConfigs],
  );
  const savablePaymentConfigs = useMemo(
    () =>
      paymentConfigs === null
        ? null
        : getSavablePaymentDefaults(paymentConfigs),
    [paymentConfigs],
  );

  useEffect(() => {
    if (liveDocumentConfigs === undefined) {
      return;
    }

    const serialized = serializeEditableDocumentConfigs(liveDocumentConfigs);
    setSavedDocumentConfigs((current) => current ?? serialized);
    setDocumentConfigs((current) => current ?? liveDocumentConfigs);
  }, [liveDocumentConfigs]);

  useEffect(() => {
    if (livePaymentConfigs === undefined) {
      return;
    }

    const serialized = serializeEditablePaymentDefaults(livePaymentConfigs);
    setSavedPaymentConfigs((current) => current ?? serialized);
    setPaymentConfigs((current) => current ?? livePaymentConfigs);
  }, [livePaymentConfigs]);

  const hasDocumentChanges =
    savedDocumentConfigs !== null &&
    serializedDocumentConfigs !== null &&
    savedDocumentConfigs !== serializedDocumentConfigs;
  const hasPaymentChanges =
    savedPaymentConfigs !== null &&
    serializedPaymentConfigs !== null &&
    savedPaymentConfigs !== serializedPaymentConfigs;
  const hasUnsavedCore =
    name.trim() !== savedName ||
    description.trim() !== savedDescription ||
    serializedFormDefinition !== savedFormDefinition;
  const hasUnsavedChanges =
    hasUnsavedCore || hasDocumentChanges || hasPaymentChanges;

  const markCurrentStateAsSaved = (overrides?: {
    name?: string;
    description?: string;
  }) => {
    setSavedName((overrides?.name ?? name).trim());
    setSavedDescription((overrides?.description ?? description).trim());
    setSavedFormDefinition(serializedFormDefinition);

    if (serializedDocumentConfigs !== null) {
      setSavedDocumentConfigs(serializedDocumentConfigs);
    }
    if (serializedPaymentConfigs !== null) {
      setSavedPaymentConfigs(serializedPaymentConfigs);
    }
  };

  return {
    name,
    setName,
    description,
    setDescription,
    formDefinition,
    setFormDefinition,
    documentConfigs,
    setDocumentConfigs,
    paymentConfigs,
    setPaymentConfigs,
    serializedFormDefinition,
    savablePaymentConfigs,
    hasDocumentChanges,
    hasPaymentChanges,
    hasUnsavedCore,
    hasUnsavedChanges,
    markCurrentStateAsSaved,
  };
}
