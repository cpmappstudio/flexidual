"use client";

import { useEffect } from "react";
import {
  clearActiveProfileCookieValue,
  getActiveProfileCookieValue,
  parseActiveProfileCookieValue,
} from "@/lib/tenancy/profile-selection";

export function useTenantActiveProfileLifecycle(enabled: boolean) {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    function clearGuardianProfileOnPageExit() {
      const activeProfile = parseActiveProfileCookieValue(
        getActiveProfileCookieValue(),
      );

      if (activeProfile?.kind === "guardian") {
        clearActiveProfileCookieValue();
      }
    }

    window.addEventListener("pagehide", clearGuardianProfileOnPageExit);

    return () => {
      window.removeEventListener("pagehide", clearGuardianProfileOnPageExit);
    };
  }, [enabled]);
}
