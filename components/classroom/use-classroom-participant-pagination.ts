"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

const MIN_PARTICIPANT_TILE_WIDTH = 96;

interface ClassroomParticipantLayoutInput {
  width: number;
  height: number;
  columnGap: number;
  rowGap: number;
  horizontalPadding: number;
  verticalPadding: number;
}

export function getClassroomParticipantLayout({
  width,
  height,
  columnGap,
  rowGap,
  horizontalPadding,
  verticalPadding,
}: ClassroomParticipantLayoutInput) {
  const contentWidth = Math.max(width - horizontalPadding, 0);
  const contentHeight = Math.max(height - verticalPadding, 0);
  if (!contentWidth || !contentHeight) {
    return { capacity: 0, columnCount: 0, rowCount: 0 };
  }

  const columnCount = Math.max(
    1,
    Math.floor(
      (contentWidth + columnGap) / (MIN_PARTICIPANT_TILE_WIDTH + columnGap),
    ),
  );
  const tileSize = (contentWidth - columnGap * (columnCount - 1)) / columnCount;
  const rowCount = Math.max(
    0,
    Math.floor((contentHeight + rowGap) / (tileSize + rowGap)),
  );

  return {
    capacity: columnCount * rowCount,
    columnCount,
    rowCount,
  };
}

export function getClassroomParticipantCapacity(
  input: ClassroomParticipantLayoutInput,
) {
  return getClassroomParticipantLayout(input).capacity;
}

export function getClassroomParticipantPage(
  participantIndex: number,
  capacity: number,
) {
  if (participantIndex < 0 || capacity <= 0) return 0;
  return Math.floor(participantIndex / capacity);
}

function readPixelValue(value: string) {
  return Number.parseFloat(value) || 0;
}

export function useClassroomParticipantPagination(itemCount: number) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState({
    capacity: 0,
    columnCount: 0,
    rowCount: 0,
  });
  const [page, setPage] = useState(0);

  const updateCapacity = useCallback(() => {
    const element = gridRef.current;
    if (!element) return;

    const style = window.getComputedStyle(element);
    setLayout(
      getClassroomParticipantLayout({
        width: element.clientWidth,
        height: element.clientHeight,
        columnGap: readPixelValue(style.columnGap),
        rowGap: readPixelValue(style.rowGap),
        horizontalPadding:
          readPixelValue(style.paddingLeft) +
          readPixelValue(style.paddingRight),
        verticalPadding:
          readPixelValue(style.paddingTop) +
          readPixelValue(style.paddingBottom),
      }),
    );
  }, []);

  useLayoutEffect(() => {
    updateCapacity();
    const observer = new ResizeObserver(updateCapacity);
    if (gridRef.current) observer.observe(gridRef.current);
    return () => observer.disconnect();
  }, [updateCapacity]);

  const { capacity, rowCount } = layout;
  const pageCount = capacity > 0 ? Math.ceil(itemCount / capacity) : 0;
  const lastPage = Math.max(pageCount - 1, 0);
  const activePage = Math.min(page, lastPage);

  useEffect(() => {
    setPage((current) => Math.min(current, lastPage));
  }, [lastPage]);

  return {
    gridRef,
    activePage,
    pageCount,
    capacity,
    rowCount,
    startIndex: activePage * capacity,
    endIndex: (activePage + 1) * capacity,
    canShowPrevious: activePage > 0,
    canShowNext: activePage < lastPage,
    showPrevious: () => setPage((current) => Math.max(current - 1, 0)),
    showNext: () => setPage((current) => Math.min(current + 1, lastPage)),
    showParticipant: (participantIndex: number) =>
      setPage(
        Math.min(
          getClassroomParticipantPage(participantIndex, capacity),
          lastPage,
        ),
      ),
  };
}
