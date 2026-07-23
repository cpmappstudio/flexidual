import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import type { ReactNode } from "react";
import type {
  IntlMessagesSchema,
  IntlNamespace,
} from "@/i18n/messages.generated";

type IntlMessagesProviderProps<Namespace extends IntlNamespace> = {
  children: ReactNode;
  namespaces: readonly Namespace[];
};

export default async function IntlMessagesProvider<
  Namespace extends IntlNamespace,
>({
  children,
  namespaces,
}: IntlMessagesProviderProps<Namespace>) {
  const messages = await getMessages();
  const scopedMessages = Object.fromEntries(
    namespaces.map((namespace) => {
      const namespaceMessages = messages[namespace];

      if (namespaceMessages === undefined) {
        throw new Error(
          `Missing message namespace "${namespace}" in request messages.`,
        );
      }

      return [namespace, namespaceMessages] as const;
    }),
  ) as Pick<IntlMessagesSchema, Namespace>;

  return (
    <NextIntlClientProvider messages={scopedMessages}>
      {children}
    </NextIntlClientProvider>
  );
}
