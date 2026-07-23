type FlexidualCampusHomeProps = {
  title: string;
  description: string;
  statusLabel: string;
  statusValue: string;
  campusLabel: string;
  campusValue: string;
  capabilityLabel: string;
  capabilityValue: string;
  nextStepsTitle: string;
  nextStepSessions: string;
  nextStepAttendance: string;
  nextStepParticipants: string;
};

export function FlexidualCampusHome(props: FlexidualCampusHomeProps) {
  return (
    <section className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">{props.title}</h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            {props.description}
          </p>
        </div>
      </div>

      <div className="rounded-3xl border border-border/70 bg-card p-6 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-2xl border border-dashed border-border/70 bg-background px-4 py-5">
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              {props.statusLabel}
            </p>
            <p className="mt-2 text-sm font-medium">{props.statusValue}</p>
          </div>
          <div className="rounded-2xl border border-dashed border-border/70 bg-background px-4 py-5">
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              {props.campusLabel}
            </p>
            <p className="mt-2 text-sm font-medium">{props.campusValue}</p>
          </div>
          <div className="rounded-2xl border border-dashed border-border/70 bg-background px-4 py-5">
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              {props.capabilityLabel}
            </p>
            <p className="mt-2 text-sm font-medium">{props.capabilityValue}</p>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-border/70 bg-card p-6 shadow-sm">
        <div className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">
            {props.nextStepsTitle}
          </h2>
          <ul className="grid gap-3 text-sm leading-6 text-muted-foreground sm:grid-cols-2 xl:grid-cols-3">
            <li className="rounded-2xl border border-dashed border-border/70 bg-background p-4">
              {props.nextStepSessions}
            </li>
            <li className="rounded-2xl border border-dashed border-border/70 bg-background p-4">
              {props.nextStepAttendance}
            </li>
            <li className="rounded-2xl border border-dashed border-border/70 bg-background p-4">
              {props.nextStepParticipants}
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
