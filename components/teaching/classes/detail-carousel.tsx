"use client";

import type { ReactNode } from "react";
import {
  type CarouselApi,
  Carousel,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function DetailCarousel({
  title,
  olderLabel,
  newerLabel,
  showNavigation,
  setApi,
  children,
}: {
  title: string;
  olderLabel: string;
  newerLabel: string;
  showNavigation: boolean;
  setApi: (api: CarouselApi) => void;
  children: ReactNode;
}) {
  return (
    <Card className="min-w-0 gap-0 overflow-hidden rounded-[2rem] border-0 py-5 shadow-md ring-1 ring-border/80">
      <Carousel
        opts={{ align: "start", containScroll: "trimSnaps" }}
        setApi={setApi}
        className="flex min-w-0 w-full touch-pan-y flex-col gap-2"
        aria-label={title}
      >
        <CardHeader className="items-center px-5 sm:px-6">
          <CardTitle className="text-xl font-bold">{title}</CardTitle>
          {showNavigation && (
            <CardAction className="flex items-center gap-2 self-center sm:gap-3">
              <div className="flex items-center gap-1.5">
                <span className="hidden text-[10px] leading-none text-muted-foreground sm:block">
                  {olderLabel}
                </span>
                <CarouselPrevious
                  type="button"
                  className="static size-10 translate-y-0"
                  aria-label={olderLabel}
                  title={olderLabel}
                />
              </div>
              <div className="flex items-center gap-1.5">
                <CarouselNext
                  type="button"
                  className="static size-10 translate-y-0"
                  aria-label={newerLabel}
                  title={newerLabel}
                />
                <span className="hidden text-[10px] leading-none text-muted-foreground sm:block">
                  {newerLabel}
                </span>
              </div>
            </CardAction>
          )}
        </CardHeader>
        <CardContent className="min-w-0 px-5 sm:px-6">{children}</CardContent>
      </Carousel>
    </Card>
  );
}
