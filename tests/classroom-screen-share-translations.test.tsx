import { readFileSync } from "node:fs";
import type { ReactNode } from "react";
import { cleanup, renderHook } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { ConnectionState, type Room } from "livekit-client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useClassroomScreenShare } from "@/hooks/use-classroom-screen-share";

const errorToast = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { error: errorToast } }));
vi.mock("@/lib/error-tracking", () => ({ reportRuntimeError: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const translations = [
  [
    "en",
    "Screen sharing could not complete. Check the browser permissions and try again.",
  ],
  [
    "es",
    "No se pudo completar la operación de compartir pantalla. Revisa los permisos del navegador e inténtalo de nuevo.",
  ],
  [
    "pt-BR",
    "Não foi possível concluir o compartilhamento de tela. Confira as permissões do navegador e tente novamente.",
  ],
] as const;

describe.each(translations)(
  "screen sharing translations: %s",
  (locale, expected) => {
    const source = readFileSync(`messages/${locale}.json`, "utf8");
    const messages = JSON.parse(source);

    it("defines the failure message only once in the source file", () => {
      // JSON.parse silently discards earlier values of duplicate keys.
      expect(source.match(/"screenShareFailed"\s*:/g)).toHaveLength(1);
      expect(messages.classroom.screenShareFailed).toBe(expected);
    });

    it.each([true, false])(
      "uses the real failure message for enabled=%s",
      async (enabled) => {
        const room = {
          state: ConnectionState.Connected,
          localParticipant: {
            setScreenShareEnabled: vi
              .fn()
              .mockRejectedValue(new Error("Operation failed")),
          },
        };
        const { result } = renderHook(
          () => useClassroomScreenShare(room as unknown as Room),
          {
            wrapper: ({ children }: { children: ReactNode }) => (
              <NextIntlClientProvider
                locale={locale}
                timeZone="UTC"
                messages={messages}
              >
                {children}
              </NextIntlClientProvider>
            ),
          },
        );

        expect(await result.current(enabled)).toBe(false);
        expect(errorToast).toHaveBeenCalledExactlyOnceWith(expected);
        expect(
          room.localParticipant.setScreenShareEnabled,
        ).toHaveBeenCalledTimes(1);
        expect(
          room.localParticipant.setScreenShareEnabled,
        ).toHaveBeenCalledWith(enabled, { audio: true });
      },
    );
  },
);
