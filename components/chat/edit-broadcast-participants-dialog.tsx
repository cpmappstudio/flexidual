"use client";

import { useEffect, useState } from "react";
import { useMutation, usePaginatedQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { preventComboboxDialogDismiss } from "@/components/ui/combobox-multiple";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  BroadcastProfessorPicker,
  type BroadcastProfessor,
} from "./broadcast-professor-picker";

type Props = {
  broadcastId: Id<"broadcasts">;
  schoolId: Id<"schools">;
  campusId?: Id<"campuses">;
  mode: "private" | "school";
  onClose: () => void;
};

export function EditBroadcastParticipantsDialog(props: Props) {
  const t = useTranslations("classroom.broadcasts");
  const common = useTranslations("common");
  const [initial, setInitial] = useState<BroadcastProfessor[] | null>(null);
  const { results, status, loadMore } = usePaginatedQuery(
    api.broadcasts.participants,
    initial === null ? { broadcastId: props.broadcastId } : "skip",
    { initialNumItems: 40 },
  );
  useEffect(() => {
    if (initial === null && status === "CanLoadMore") loadMore(40);
  }, [initial, status, loadMore]);
  const [saving, setSaving] = useState(false);
  if (initial === null && status === "Exhausted") setInitial(results);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) props.onClose();
      }}
    >
      <DialogContent
        onEscapeKeyDown={preventComboboxDialogDismiss}
        className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle>{t("editParticipants")}</DialogTitle>
        </DialogHeader>
        {initial === null ? (
          <p role="status">{common("loading")}</p>
        ) : (
          <ParticipantsForm
            {...props}
            initial={initial}
            saving={saving}
            setSaving={setSaving}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ParticipantsForm({
  initial,
  saving,
  setSaving,
  ...props
}: Props & {
  initial: BroadcastProfessor[];
  saving: boolean;
  setSaving: (value: boolean) => void;
}) {
  const t = useTranslations("classroom.broadcasts");
  const common = useTranslations("common");
  // Snapshot only the participants this editor saw. Save a delta, not a stale replacement.
  const [original] = useState(() => new Map(initial.map((p) => [p._id, p])));
  const [selected, setSelected] = useState(() => [...original.values()]);
  const update = useMutation(api.broadcasts.updateParticipants);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const ids = new Set(selected.map((p) => p._id));
      await update({
        broadcastId: props.broadcastId,
        add: selected.filter((p) => !original.has(p._id)).map((p) => p._id),
        remove: [...original.keys()].filter((id) => !ids.has(id)),
      });
      toast.success(t("participationUpdated"));
      props.onClose();
    } catch {
      toast.error(t("participantsError"));
    } finally {
      setSaving(false);
    }
  }
  return (
    <form className="grid gap-4" onSubmit={submit}>
      <p className="text-sm text-muted-foreground">{t("writersDescription")}</p>
      <BroadcastProfessorPicker
        {...props}
        value={selected}
        onChange={setSelected}
        disabled={saving}
      />
      <Button type="submit" disabled={saving}>
        {saving ? t("saving") : common("save")}
      </Button>
    </form>
  );
}
