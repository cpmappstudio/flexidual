"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useAction } from "convex/react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { useDateTimeFormatter } from "@/hooks/use-date-time-formatter";
import type { ProfileSession } from "@/components/profile/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemSeparator,
  ItemTitle,
} from "@/components/ui/item";

export function ProfileActiveSessionsList({
  sessions,
  onSignOutCurrentSession,
}: {
  sessions: ProfileSession[];
  onSignOutCurrentSession: () => Promise<void>;
}) {
  const locale = useLocale();
  const t = useTranslations("ProfileSettings");
  const signOutOtherSessions = useAction(api.usersActions.signOutOtherSessions);
  const signOutSession = useAction(api.usersActions.signOutSession);
  const [isPending, setIsPending] = useState(false);
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
  const formatter = useDateTimeFormatter(locale);

  const otherSessionsCount = sessions.filter(
    (session) => !session.isCurrent,
  ).length;

  async function handleSignOutOtherSessions() {
    setIsPending(true);

    try {
      await signOutOtherSessions({});
      toast.success(t("otherSessionsSignedOut"));
    } catch {
      toast.error(t("genericError"));
    } finally {
      setIsPending(false);
    }
  }

  async function handleSignOutSession(session: ProfileSession) {
    setPendingSessionId(session._id);

    try {
      if (session.isCurrent) {
        await onSignOutCurrentSession();
        return;
      }

      await signOutSession({ sessionId: session._id });
      toast.success(t("sessionSignedOut"));
    } catch {
      toast.error(t("genericError"));
    } finally {
      setPendingSessionId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h3 className="text-base font-semibold text-foreground">
            {t("sessionsTitle")}
          </h3>
          <p className="text-sm text-muted-foreground">
            {t("sessionsDescription")}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={otherSessionsCount === 0 || isPending}
          onClick={() => void handleSignOutOtherSessions()}
        >
          {isPending ? t("signingOutOtherSessions") : t("signOutOtherSessions")}
        </Button>
      </div>

      <ItemGroup className="gap-0">
        {sessions.map((session, index) => (
          <div key={session._id}>
            {index > 0 ? <ItemSeparator /> : null}
            <Item variant="outline" size="sm" className="rounded-2xl">
              <ItemContent>
                <ItemTitle>
                  {session.isCurrent ? t("currentSession") : t("otherSession")}
                  {session.isCurrent ? (
                    <Badge variant="secondary">{t("currentBadge")}</Badge>
                  ) : null}
                </ItemTitle>
                <ItemDescription>
                  {t("startedAt", {
                    date: formatter.format(session._creationTime),
                  })}
                </ItemDescription>
                <ItemDescription>
                  {t("expiresAt", {
                    date: formatter.format(session.expirationTime),
                  })}
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:text-destructive"
                  disabled={isPending || pendingSessionId === session._id}
                  onClick={() => void handleSignOutSession(session)}
                >
                  <LogOut />
                  <span className="sr-only">{t("closeSession")}</span>
                </Button>
              </ItemActions>
            </Item>
          </div>
        ))}
      </ItemGroup>
    </div>
  );
}
