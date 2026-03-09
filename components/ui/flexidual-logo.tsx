import Image from "next/image";

interface FlexidualLogoProps {
  className?: string;
  stacked?: boolean;
}

const sizeMap = {
  icon: { width: 40, height: 40 },
  wide: { width: 160, height: 40 },
};

export function FlexidualLogo({
  className = "",
  stacked = false,
}: FlexidualLogoProps) {
  if (stacked) {
    return (
      <Image
        src="/flexidual-icon.png"
        alt="Flexidual"
        width={sizeMap.icon.width}
        height={sizeMap.icon.height}
        className={`object-contain ${className}`}
      />
    );
  }

  return (
    <Image
      src="/flexidual-icon-wide.png"
      alt="Flexidual"
      width={sizeMap.wide.width}
      height={sizeMap.wide.height}
      className={`object-contain ${className}`}
    />
  );
}