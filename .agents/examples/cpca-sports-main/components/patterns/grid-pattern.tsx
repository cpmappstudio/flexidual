const gridStyles = {
  backgroundSize: "30px 30px",
  backgroundPosition: "15px 15px",
  WebkitMaskImage:
    "radial-gradient(ellipse 80% 80% at 0% 0%, #000 50%, transparent 90%)",
  maskImage:
    "radial-gradient(ellipse 80% 80% at 0% 0%, #000 50%, transparent 90%)",
};

export function GridPattern() {
  return (
    <>
      {/* Default state - border color */}
      <div
        className="absolute inset-0 z-0 transition-opacity duration-300 group-hover:opacity-0"
        style={{
          ...gridStyles,
          backgroundImage: `
            linear-gradient(to right, var(--border) 1px, transparent 1px),
            linear-gradient(to bottom, var(--border) 1px, transparent 1px)
          `,
        }}
      />
      {/* Hover state - primary color */}
      <div
        className="absolute inset-0 z-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          ...gridStyles,
          backgroundImage: `
            linear-gradient(to right, color-mix(in srgb, var(--primary) 50%, transparent) 1px, transparent 1px),
            linear-gradient(to bottom, color-mix(in srgb, var(--primary) 50%, transparent) 1px, transparent 1px)
          `,
        }}
      />
    </>
  );
}
