import { useState } from "react";
import { Add01Icon, Delete02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { TenantOrganizationAvatar } from "@/components/tenant/tenant-organization-avatar";
import { PlatformTeamRoleSelect } from "@/components/platform/platform-team-role-select";
import type { PlatformTeamRole } from "@/components/platform/platform-team.types";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

type InviteFormEntry = {
  id: string;
  email: string;
  role: PlatformTeamRole;
};

function createInviteFormEntry(): InviteFormEntry {
  return {
    id: crypto.randomUUID(),
    email: "",
    role: "viewer",
  };
}

export function TenantOnboardingInviteStep({
  institutionName,
  institutionImageUrl,
  title,
  description,
  backLabel,
  finishLabel,
  addInviteLabel,
  messageLabel,
  messagePlaceholder,
  emailLabel,
  emailPlaceholder,
  roleLabel,
  emptyStateLabel,
  onBack,
  onFinish,
}: {
  institutionName: string;
  institutionImageUrl: string | null;
  title: string;
  description: string;
  backLabel: string;
  finishLabel: string;
  addInviteLabel: string;
  messageLabel: string;
  messagePlaceholder: string;
  emailLabel: string;
  emailPlaceholder: string;
  roleLabel: string;
  emptyStateLabel: string;
  onBack: () => void;
  onFinish?: () => void;
}) {
  const [queuedInviteEntries, setQueuedInviteEntries] = useState<
    InviteFormEntry[]
  >([]);
  const [currentInviteEntry, setCurrentInviteEntry] = useState<InviteFormEntry>(
    () => createInviteFormEntry(),
  );
  const [message, setMessage] = useState("");

  function updateCurrentInviteEntry(
    patch: Partial<Pick<InviteFormEntry, "email" | "role">>,
  ) {
    setCurrentInviteEntry((currentEntry) => ({
      ...currentEntry,
      ...patch,
    }));
  }

  function addInviteEntry() {
    if (!currentInviteEntry.email.trim()) {
      return;
    }

    setQueuedInviteEntries((currentEntries) => [
      ...currentEntries,
      currentInviteEntry,
    ]);
    setCurrentInviteEntry(createInviteFormEntry());
  }

  function updateQueuedInviteEntry(
    inviteId: string,
    patch: Partial<Pick<InviteFormEntry, "email" | "role">>,
  ) {
    setQueuedInviteEntries((currentEntries) =>
      currentEntries.map((entry) =>
        entry.id === inviteId ? { ...entry, ...patch } : entry,
      ),
    );
  }

  function removeQueuedInviteEntry(inviteId: string) {
    setQueuedInviteEntries((currentEntries) =>
      currentEntries.filter((entry) => entry.id !== inviteId),
    );
  }

  const inviteGridClass =
    "grid gap-4 grid-cols-[minmax(0,1.7fr)_minmax(0,1.3fr)_52px]";
  const hasQueuedInviteEntries = queuedInviteEntries.length > 0;

  return (
    <div className="flex flex-col gap-6 sm:gap-4">
      <section className="mt-2">
        <div className="flex flex-col items-center justify-center">
          <TenantOrganizationAvatar
            name={institutionName}
            imageUrl={institutionImageUrl}
          />
          <h2 className="mt-3 max-w-3xl text-center text-2xl font-semibold tracking-tight text-primary text-balance">
            {title}
          </h2>
          <p className="mt-3 max-w-2xl text-center text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        </div>
      </section>

      <section>
        <div className="mt-2 grid gap-2">
          <div className={`${inviteGridClass} px-4`}>
            <p className="text-sm font-medium text-primary">{emailLabel}</p>
            <p className="text-sm font-medium text-primary">{roleLabel}</p>
            <div aria-hidden="true" />
          </div>

          <div className="px-4 py-3">
            <div className={`${inviteGridClass} items-end`}>
              <div>
                <Input
                  type="email"
                  value={currentInviteEntry.email}
                  placeholder={emailPlaceholder}
                  aria-label={emailLabel}
                  onChange={(event) =>
                    updateCurrentInviteEntry({ email: event.target.value })
                  }
                  className="border-border bg-background"
                />
              </div>

              <div>
                <PlatformTeamRoleSelect
                  value={currentInviteEntry.role}
                  onValueChange={(value) =>
                    updateCurrentInviteEntry({
                      role: value,
                    })
                  }
                  className="w-full border-border bg-background"
                  ariaLabel={roleLabel}
                />
              </div>

              <div className="flex justify-end">
                <Button
                  type="button"
                  size="icon"
                  onClick={addInviteEntry}
                  aria-label={addInviteLabel}
                >
                  <HugeiconsIcon icon={Add01Icon} strokeWidth={1.8} />
                </Button>
              </div>
            </div>
          </div>

          {hasQueuedInviteEntries ? (
            <div>
              <div className="px-4">
                <Separator/>
              </div>
              {queuedInviteEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-[calc(var(--radius)*1.8)] px-4 py-3"
                >
                  <div className={`${inviteGridClass} items-center`}>
                    <div>
                      <Input
                        type="email"
                        value={entry.email}
                        placeholder={emailPlaceholder}
                        aria-label={emailLabel}
                        onChange={(event) =>
                          updateQueuedInviteEntry(entry.id, {
                            email: event.target.value,
                          })
                        }
                        className="border-border bg-background"
                      />
                    </div>

                    <div>
                      <PlatformTeamRoleSelect
                        value={entry.role}
                        onValueChange={(value) =>
                          updateQueuedInviteEntry(entry.id, {
                            role: value,
                          })
                        }
                        className="w-full border-border bg-background"
                        ariaLabel={roleLabel}
                      />
                    </div>

                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        onClick={() => removeQueuedInviteEntry(entry.id)}
                        aria-label={`${emptyStateLabel} ${entry.email}`.trim()}
                      >
                        <HugeiconsIcon icon={Delete02Icon} strokeWidth={1.8} />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="px-4 mt-4">
          <FieldSet>
            <FieldGroup>
              <Field>
                <FieldLabel className="text-sm font-medium text-primary">
                  {messageLabel}
                </FieldLabel>
                <Textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder={messagePlaceholder}
                  className="border-border bg-background"
                />
              </Field>
            </FieldGroup>
          </FieldSet>
        </div>
      </section>

      <section className="flex items-center justify-center mt-4 gap-4">
        <Button type="button" variant="ghost" onClick={onBack}>
          {backLabel}
        </Button>
        <Button type="button" onClick={onFinish}>
          {finishLabel}
        </Button>
      </section>
    </div>
  );
}
