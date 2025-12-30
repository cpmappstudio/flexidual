import React from "react";

interface FlexidualLogoProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  stacked?: boolean;
}

export function FlexidualLogo({
  className = "",
  size = "md",
  stacked = false,
}: FlexidualLogoProps) {
  const base =
    size === "sm" ? "text-lg" : size === "lg" ? "text-3xl" : "text-2xl";
  const layout = /* stacked ? "flex-col leading-tight" : */ "items-center";

  return (
    <div className={`flex ${layout} ${className} transition-all`}>
        { !stacked ? (
          <>
            <span
              className={`${base} font-logo font-black tracking-tight text-orange-500`}
              style={{ fontVariationSettings: '"SOFT" 100' }}
            >
              Flexi
            </span>
            <span
              className={`${base} font-logo font-black tracking-tight text-yellow-500`}
              style={{ fontVariationSettings: '"SOFT" 100' }}
            >
              Dual
            </span>
          </>
        ) : (
          <div className="flex items-end -space-x-0.5">
            <span
              className={`${base} font-logo font-black tracking-tight inline-block text-orange-500 rotate-12`}
              style={{ fontVariationSettings: '"SOFT" 100' }}
            >
              F
            </span>
            <span
              className={`${base} font-logo font-black tracking-tight text-yellow-500 inline-block rotate-12 translate-y-1.5`}
              style={{ fontVariationSettings: '"SOFT" 100' }}
            >
              D
            </span>
          </div>
        )}
    </div>
  );
}