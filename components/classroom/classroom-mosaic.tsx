"use client";

import { useTracks } from "@livekit/components-react";
import { Participant, Track } from "livekit-client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  getIsCompanionParticipant,
  getParticipantConvexUserId,
} from "./classroom-participant";
import { ClassroomParticipantTile } from "./classroom-participant-tile";

interface ClassroomMosaicProps {
  students: Participant[];
  presenter?: Participant;
  previewParticipants?: Participant[];
  raisedParticipantIds: ReadonlySet<string>;
  localParticipantRaised?: boolean;
  youLabel: string;
  label: string;
  highlightedParticipantId?: string;
  onPinParticipant?: (identity: string) => void;
  pinLabel?: (participant: Participant) => string;
}

const MIN_TILE_WIDTH = 120;
const MIN_TILE_HEIGHT = 90;
const TARGET_ASPECT_RATIO = 16 / 9;
const NO_CAMERA_IDS: ReadonlySet<string> = new Set();

export function getMosaicLayout(count: number, width: number, height: number) {
  if (count === 0 || width <= 0 || height <= 0) {
    return { columns: 1, rows: 1, rowHeight: undefined };
  }

  let bestColumns = 0;
  let bestScore = 0;
  for (let columns = 1; columns <= count; columns += 1) {
    const rows = Math.ceil(count / columns);
    const tileWidth = width / columns;
    const tileHeight = height / rows;
    if (tileWidth < MIN_TILE_WIDTH || tileHeight < MIN_TILE_HEIGHT) continue;

    const score = Math.min(tileWidth / TARGET_ASPECT_RATIO, tileHeight);
    if (score > bestScore) {
      bestScore = score;
      bestColumns = columns;
    }
  }

  if (bestColumns) {
    return {
      columns: bestColumns,
      rows: Math.ceil(count / bestColumns),
      rowHeight: undefined,
    };
  }

  const columns = Math.max(
    1,
    Math.min(count, Math.floor(width / MIN_TILE_WIDTH)),
  );
  return {
    columns,
    rows: Math.ceil(count / columns),
    rowHeight: Math.max(
      MIN_TILE_HEIGHT,
      Math.floor(width / columns / TARGET_ASPECT_RATIO),
    ),
  };
}

export function getMosaicParticipants(
  students: Participant[],
  previewParticipants: Participant[],
  {
    presenter,
    cameraEnabledIds = NO_CAMERA_IDS,
  }: {
    presenter?: Participant;
    cameraEnabledIds?: ReadonlySet<string>;
  } = {},
) {
  const visibleParticipants = presenter
    ? [
        presenter,
        ...students.filter(
          (participant) => participant.identity !== presenter.identity,
        ),
      ]
    : students;
  return [
    ...visibleParticipants.filter(
      (participant) =>
        getParticipantConvexUserId(participant) &&
        !getIsCompanionParticipant(participant),
    ),
    ...previewParticipants,
  ].sort((first, second) => {
    const cameraDifference =
      Number(cameraEnabledIds.has(second.identity)) -
      Number(cameraEnabledIds.has(first.identity));
    if (cameraDifference) return cameraDifference;
    return (
      (first.name || first.identity).localeCompare(
        second.name || second.identity,
      ) || first.identity.localeCompare(second.identity)
    );
  });
}

export function ClassroomMosaic({
  students,
  presenter,
  previewParticipants = [],
  raisedParticipantIds,
  localParticipantRaised = false,
  youLabel,
  label,
  highlightedParticipantId,
  onPinParticipant,
  pinLabel,
}: ClassroomMosaicProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const updateSize = () => {
      const { width, height } = container.getBoundingClientRect();
      setSize((previous) =>
        previous.width === width && previous.height === height
          ? previous
          : { width, height },
      );
    };
    updateSize();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(updateSize);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const cameraTracks = useTracks([Track.Source.Camera], {
    onlySubscribed: false,
  });
  const cameraEnabledIds = useMemo(
    () =>
      new Set(
        cameraTracks
          .filter(({ publication }) => !publication.isMuted)
          .map(({ participant }) => participant.identity),
      ),
    [cameraTracks],
  );
  const mosaicParticipants = getMosaicParticipants(
    students,
    previewParticipants,
    { presenter, cameraEnabledIds },
  );
  const layout = getMosaicLayout(
    mosaicParticipants.length,
    size.width,
    size.height,
  );

  useEffect(() => {
    if (!highlightedParticipantId) return;
    const tile = containerRef.current?.ownerDocument.getElementById(
      `classroom-mosaic-${highlightedParticipantId}`,
    );
    if (tile && containerRef.current?.contains(tile)) {
      tile.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
    }
  }, [highlightedParticipantId]);

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label={label}
      className="grid h-full min-h-0 w-full content-start gap-px overflow-y-auto overscroll-contain bg-primary/20"
      style={{
        gridTemplateColumns: `repeat(${layout.columns}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${layout.rows}, ${
          layout.rowHeight ? `${layout.rowHeight}px` : "minmax(0, 1fr)"
        })`,
      }}
    >
      {mosaicParticipants.map((participant) => (
        <ClassroomParticipantTile
          key={participant.identity}
          id={`classroom-mosaic-${participant.identity}`}
          participant={participant}
          actionsPosition="left"
          className={`min-h-0 min-w-0 border-0 shadow-none hover:shadow-none ${
            highlightedParticipantId === participant.identity
              ? "z-20 ring-4 ring-inset ring-primary"
              : ""
          }`}
          raisedHand={
            raisedParticipantIds.has(participant.identity) ||
            (participant.isLocal && localParticipantRaised)
          }
          youLabel={youLabel}
          onPinnedChange={
            onPinParticipant && participant.identity !== presenter?.identity
              ? () => onPinParticipant(participant.identity)
              : undefined
          }
          pinLabel={pinLabel?.(participant)}
        />
      ))}
    </div>
  );
}
