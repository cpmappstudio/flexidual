"use client";

import type { ReactNode, MouseEventHandler } from "react";

import {
  Label,
  PolarAngleAxis,
  PolarRadiusAxis,
  RadialBar,
  RadialBarChart,
} from "recharts";
import {
  ChartContainer,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface RadialChartProps {
  value: number;
  label: string;
  fill?: string;
  className?: string;
  config: ChartConfig;
  showPercentage?: boolean;
  ariaLabel?: string;
  center?: ReactNode;
  tooltip?: ReactNode;
  onClick?: MouseEventHandler<HTMLElement>;
}

export function RadialChart({
  value,
  label,
  fill = "var(--chart-1)",
  className = "size-full",
  config,
  showPercentage = false,
  ariaLabel,
  center,
  tooltip,
  onClick,
}: RadialChartProps) {
  const normalizedValue = Math.min(100, Math.max(0, value));
  const chartData = [{ progress: normalizedValue, fill }];
  const Container = onClick ? "button" : "div";

  const chart = (
    <Container
      type={onClick ? "button" : undefined}
      onClick={onClick}
      aria-label={onClick ? (ariaLabel ?? label) : undefined}
      aria-haspopup={onClick ? "dialog" : undefined}
      className={`relative block ${onClick ? "cursor-pointer rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" : ""} ${className}`}
      tabIndex={tooltip ? 0 : undefined}
    >
      <ChartContainer
        config={config}
        className="size-full"
        overlay={
          tooltip ? (
            <TooltipContent
              side="top"
              sideOffset={8}
              className="bg-transparent p-0 text-foreground text-wrap [&_svg]:hidden"
            >
              <ChartTooltipContent
                active
                hideLabel
                payload={[
                  {
                    name: "progress",
                    dataKey: "progress",
                    value: normalizedValue,
                  },
                ]}
                formatter={() => tooltip}
                className="w-max min-w-0 max-w-[calc(100vw-2rem)]"
              />
            </TooltipContent>
          ) : undefined
        }
        role="img"
        aria-label={
          ariaLabel ??
          `${label}: ${normalizedValue}${showPercentage ? "%" : ""}`
        }
      >
        <RadialBarChart
          margin={
            center !== undefined
              ? { top: 0, right: 0, bottom: 0, left: 0 }
              : undefined
          }
          data={chartData}
          startAngle={90}
          endAngle={-270}
          innerRadius="70%"
          outerRadius="86%"
          barSize={14}
        >
          <PolarAngleAxis
            type="number"
            domain={[0, 100]}
            tick={false}
            axisLine={false}
          />
          <RadialBar
            dataKey="progress"
            cornerRadius={10}
            fill={fill}
            background
          />
          {center === undefined && (
            <PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
              <Label
                content={({
                  viewBox,
                }: {
                  viewBox?: { cx?: number; cy?: number };
                }) => {
                  if (!viewBox || !("cx" in viewBox) || !("cy" in viewBox)) {
                    return null;
                  }

                  return (
                    <text
                      x={viewBox.cx}
                      y={viewBox.cy}
                      textAnchor="middle"
                      dominantBaseline="middle"
                    >
                      <tspan
                        x={viewBox.cx}
                        y={viewBox.cy}
                        className="fill-foreground text-2xl font-bold"
                      >
                        {normalizedValue}
                        {showPercentage ? "%" : ""}
                      </tspan>
                      <tspan
                        x={viewBox.cx}
                        y={(viewBox.cy ?? 0) + 20}
                        className="fill-muted-foreground text-xs font-semibold"
                      >
                        {label}
                      </tspan>
                    </text>
                  );
                }}
              />
            </PolarRadiusAxis>
          )}
        </RadialBarChart>
      </ChartContainer>
      {center !== undefined && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 grid place-items-center"
        >
          {center}
        </div>
      )}
    </Container>
  );
  return tooltip ? (
    <Tooltip>
      <TooltipTrigger asChild>{chart}</TooltipTrigger>
    </Tooltip>
  ) : (
    chart
  );
}
