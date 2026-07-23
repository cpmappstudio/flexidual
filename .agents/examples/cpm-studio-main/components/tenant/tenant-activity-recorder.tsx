"use client";

import { useEffect, useEffectEvent, useRef } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

const CLIENT_ACTIVITY_THROTTLE_MS = 5 * 60 * 1000;

function getClientActivityDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getClientTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

function getActivityStorageKey(args: {
  organizationPersonId?: Id<"organizationPeople">;
  slug: string;
}) {
  const day = getClientActivityDate();
  const scope = args.organizationPersonId ?? "account";
  return `tenant-activity:${args.slug}:${scope}:${day}`;
}

function getLastRecordedAt(key: string) {
  try {
    const value = window.localStorage.getItem(key);
    const timestamp = value ? Number(value) : null;

    return timestamp && Number.isFinite(timestamp) ? timestamp : null;
  } catch {
    return null;
  }
}

function setLastRecordedAt(key: string, timestamp: number) {
  try {
    window.localStorage.setItem(key, String(timestamp));
  } catch {
    // Storage access can fail in private browsing modes. Activity recording is
    // best-effort, so the mutation remains the source of truth.
  }
}

export function TenantActivityRecorder({
  organizationPersonId,
  slug,
}: {
  organizationPersonId?: Id<"organizationPeople">;
  slug: string;
}) {
  const lastAttemptAtRef = useRef(0);
  const recordTenantActivity = useMutation(
    api.platform.activity.recordTenantActivity,
  );

  const recordActivity = useEffectEvent(() => {
    const key = getActivityStorageKey({ organizationPersonId, slug });
    const now = Date.now();
    const lastRecordedAt = Math.max(
      lastAttemptAtRef.current,
      getLastRecordedAt(key) ?? 0,
    );

    if (now - lastRecordedAt < CLIENT_ACTIVITY_THROTTLE_MS) {
      return;
    }

    lastAttemptAtRef.current = now;
    setLastRecordedAt(key, now);

    void recordTenantActivity({
      slug,
      organizationPersonId,
      timeZone: getClientTimeZone(),
    }).catch(() => {
      // Do not interrupt navigation if the user loses auth or connectivity.
    });
  });

  useEffect(() => {
    recordActivity();

    function handleFocus() {
      recordActivity();
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        recordActivity();
      }
    }

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        recordActivity();
      }
    }, CLIENT_ACTIVITY_THROTTLE_MS);

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [organizationPersonId, slug]);

  return null;
}
