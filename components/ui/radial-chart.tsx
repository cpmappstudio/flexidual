"use client";

import {
  Label,
  PolarGrid,
  PolarRadiusAxis,
  RadialBar,
  RadialBarChart,
} from "recharts";
import {
  ChartContainer,
  type ChartConfig,
} from "@/components/ui/chart";

export interface RadialChartProps {
  value: number;
  label: string;
  fill?: string;
  className?: string;
  config: ChartConfig;
  showPercentage?: boolean;
  ariaLabel?: string;
}

export function RadialChart({
  value,
  label,
  fill = "var(--chart-1)",
  className = "size-full",
  config,
  showPercentage = false,
  ariaLabel,
}: RadialChartProps) {
  const normalizedValue = Math.min(100, Math.max(0, value));
  const chartData = [{ progress: 100, fill }];

  return (
    <ChartContainer
      config={config}
      className={className}
      role="img"
      aria-label={
        ariaLabel ?? `${label}: ${normalizedValue}${showPercentage ? "%" : ""}`
      }
    >
      <RadialBarChart
        data={chartData}
        startAngle={90}
        endAngle={90 - normalizedValue * 3.6}
        innerRadius="70%"
        outerRadius="86%"
        barSize={14}
      >
        <PolarGrid
          gridType="circle"
          radialLines={false}
          stroke="none"
          className="first:fill-muted last:fill-card"
          polarRadius={["86%", "70%"]}
        />
        <RadialBar dataKey="progress" cornerRadius={10} fill={fill} />
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
      </RadialBarChart>
    </ChartContainer>
  );
}
