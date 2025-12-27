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
          <>
            <span
              className={`${base} font-logo font-black tracking-tight text-orange-500`}
              style={{ fontVariationSettings: '"SOFT" 100' }}
            >
              F
            </span>
            <span
              className={`${base} font-logo font-black tracking-tight text-yellow-500 translate-y-1`}
              style={{ fontVariationSettings: '"SOFT" 100' }}
            >
              D
            </span>
          </>
        )}
    </div>
  );
}