"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Line, LineChart, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function AbekaProgressTrend({
  history,
}: {
  history: { date: string; percentage: number }[];
}) {
  const t = useTranslations("settings.integrations");
  const format = useFormatter();
  const [activeIndex, setActiveIndex] = useState(0);
  const percentage = (value: number) =>
    format.number(value / 100, {
      style: "percent",
      maximumSignificantDigits: 4,
    });
  const date = (value: number) =>
    format.dateTime(value, {
      dateStyle: "medium",
      timeZone: "UTC",
    });
  const data = history.map((point) => ({
    ...point,
    day: Date.parse(`${point.date}T00:00:00Z`),
  }));
  const activePoint = data[activeIndex] ?? data[0];
  return (
    <figure
      className="absolute right-6 top-0 m-0 w-20 sm:right-8 sm:w-32"
      aria-label={t("progressTrend")}
      title={data.length ? undefined : t("progressHistoryPending")}
    >
      <figcaption className="text-center text-[10px] leading-3 text-muted-foreground">
        {t("progressTrend")}
      </figcaption>
      {data.length ? (
        <>
          <Tooltip>
            <TooltipTrigger asChild>
              <ChartContainer
                config={{
                  percentage: { label: t("progress"), color: "#86338a" },
                }}
                className="h-6 w-full aspect-auto sm:h-9"
                overlay={
                  <TooltipContent
                    side="top"
                    sideOffset={8}
                    collisionPadding={8}
                    className="bg-transparent p-0 text-foreground [&_svg]:hidden"
                  >
                    <ChartTooltipContent
                      active
                      hideLabel
                      hideIndicator
                      className="w-max min-w-0 max-w-[calc(100vw-2rem)]"
                      payload={[
                        {
                          name: "percentage",
                          dataKey: "percentage",
                          value: activePoint.percentage,
                        },
                      ]}
                      formatter={() => (
                        <div className="grid gap-1">
                          <span>{date(activePoint.day)}</span>
                          <span className="font-medium tabular-nums">
                            {percentage(activePoint.percentage)}
                          </span>
                        </div>
                      )}
                    />
                  </TooltipContent>
                }
              >
                <LineChart
                  accessibilityLayer
                  data={data}
                  margin={{ top: 5, right: 5, bottom: 5, left: 5 }}
                  onMouseMove={({
                    activeTooltipIndex,
                  }: {
                    activeTooltipIndex?: number;
                  }) => {
                    if (
                      activeTooltipIndex !== undefined &&
                      activeTooltipIndex >= 0
                    )
                      setActiveIndex(activeTooltipIndex);
                  }}
                >
                  <XAxis
                    hide
                    dataKey="day"
                    type="number"
                    scale="time"
                    domain={["dataMin", "dataMax"]}
                  />
                  {/* Autoscale the raw values, not 0–100: small advances must remain visible. */}
                  <YAxis hide domain={["dataMin", "dataMax"]} />
                  {/* Recharts keeps point/keyboard selection; the existing portal positions the tooltip. */}
                  <ChartTooltip cursor={false} content={() => null} />
                  <Line
                    dataKey="percentage"
                    type="linear"
                    stroke="var(--color-percentage)"
                    strokeWidth={2}
                    dot={
                      data.length === 1
                        ? { r: 3, fill: "var(--color-percentage)" }
                        : false
                    }
                    activeDot={{ r: 3 }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ChartContainer>
            </TooltipTrigger>
          </Tooltip>
          <ol className="sr-only">
            {data.map((point) => (
              <li key={point.date}>
                {date(point.day)}: {percentage(point.percentage)}
              </li>
            ))}
          </ol>
        </>
      ) : (
        <p className="mt-1 text-center text-[10px] leading-3 text-muted-foreground">
          <span aria-hidden>—</span>
          <span className="sr-only">{t("progressHistoryPending")}</span>
        </p>
      )}
    </figure>
  );
}
