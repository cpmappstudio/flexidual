import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="relative flex min-h-svh overflow-hidden bg-background">
      {/* ── MOBILE / TABLET: imagen superior + gradientes superpuestos ── */}
      <div className="absolute inset-0 lg:hidden">
        {/* Imagen ocupa toda la pantalla */}
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: "url(/backgroud-image.png)" }}
        />
        {/* Tinte naranja sobre la imagen (zona superior) */}
        <div className="absolute inset-0 bg-[linear-gradient(175deg,rgba(247,130,28,0.45)_0%,rgba(209,141,5,0.35)_40%,transparent_60%)]" />
        {/* Gradiente oscuro desde abajo — crea el "panel" donde vive el card */}
        <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(22,14,5,0.97)_48%,rgba(22,14,5,0.55)_68%,transparent_100%)]" />
      </div>

      {/* ── PANEL DEL FORMULARIO ── */}
      {/*
        Mobile:  items-end  → el card se ancla en la parte inferior de la pantalla
        Desktop: items-center justify-start → centrado verticalmente, alineado a la izquierda
      */}
      <div className="relative z-10 flex w-full items-end justify-center px-6 pb-10 pt-0 md:px-10 md:pb-12 lg:w-[46%] lg:items-center lg:justify-start lg:py-10 lg:pl-16 lg:pr-10">
        <div className="w-full max-w-[460px]">
          <SignIn
            appearance={{
              elements: {
                rootBox: {
                  width: "100%",
                  maxWidth: "460px",
                },
                card: {
                  // Mobile: fondo oscuro para integrarse con el gradiente de abajo
                  // Desktop: fondo blanco cálido de siempre
                  backgroundColor: "oklch(0.99 0.008 60)",
                  boxShadow:
                    "0 12px 28px -14px rgba(60, 25, 5, 0.48), 0 22px 36px -24px rgba(50, 20, 4, 0.42), 0 0 0 1px rgba(200, 130, 60, 0.18)",
                  borderRadius: "1rem",
                  "@media (max-width: 1023px)": {
                    backgroundColor: "transparent",
                    boxShadow: "none",
                    border: "none",
                  },
                  "&::before": {
                    content: '""',
                    display: "block",
                    width: "96px",
                    height: "96px",
                    backgroundImage: "url(/flexidual-icon.png)",
                    backgroundSize: "contain",
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "center",
                    margin: "0 auto 0.25rem",
                    borderRadius: "0.5rem",
                  },
                },
                header: {
                  display: "block !important",
                },
                headerTitle: {
                  marginTop: "0.625rem",
                  color: "oklch(0.18 0.04 45)",
                  fontWeight: "750",
                  letterSpacing: "-0.025em",
                  "@media (max-width: 1023px)": {
                    color: "oklch(0.96 0.015 70)",
                  },
                },
                headerSubtitle: {
                  color: "oklch(0.52 0.04 53)",
                  "@media (max-width: 1023px)": {
                    color: "oklch(0.72 0.04 60)",
                  },
                },
                formFieldLabel: {
                  "@media (max-width: 1023px)": {
                    color: "oklch(0.82 0.03 60)",
                  },
                },
                formFieldInput: {
                  "@media (max-width: 1023px)": {
                    backgroundColor: "rgba(255,255,255,0.08)",
                    borderColor: "rgba(255,255,255,0.15)",
                    color: "oklch(0.95 0.01 60)",
                  },
                },
                formButtonPrimary: {
                  backgroundColor: "oklch(72.47% 0.17389 53.878)",
                  boxShadow:
                    "0 6px 14px rgba(160, 80, 15, 0.25), 0 1px 2px rgba(160, 80, 15, 0.16)",
                  transition: "all 0.15s ease",
                  "&:hover": {
                    backgroundColor: "oklch(66% 0.18 53.878)",
                    boxShadow:
                      "0 10px 20px rgba(160, 80, 15, 0.28), 0 2px 5px rgba(160, 80, 15, 0.2)",
                    transform: "translateY(-1px)",
                  },
                  "&:focus": {
                    boxShadow:
                      "0 0 0 3px oklch(72.47% 0.17389 53.878 / 0.3) !important",
                  },
                  "&:active": {
                    boxShadow: "0 1px 3px rgba(160, 80, 15, 0.3) !important",
                    transform: "translateY(0)",
                  },
                  "& .cl-buttonArrowIcon": {
                    display: "none",
                  },
                },
                footer: {
                  display: "none",
                  backgroundColor: "oklch(0.96 0.015 55)",
                  borderTop: "1px solid oklch(0.9 0.025 58)",
                },
                footerAction: {
                  display: "none",
                },
              },
            }}
          />
        </div>
      </div>

      {/* ── DESKTOP ONLY: panel naranja diagonal (sin cambios) ── */}
      <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[60%] [clip-path:polygon(9%_0%,100%_0%,100%_100%,0%_100%)] lg:block">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: "url(/backgroud-image.png)" }}
        />
        {/* Tinte naranja sobre la imagen (zona superior) */}
        <div className="absolute inset-0 bg-[linear-gradient(175deg,rgba(247,130,28,0.45)_0%,rgba(209,141,5,0.35)_40%,transparent_60%)]" />
        {/* Gradiente oscuro desde abajo — crea el "panel" donde vive el card */}
        <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(22,14,5,0.75)_48%,rgba(22,14,5,0.55)_68%,transparent_100%)]" />
      </div>
    </div>
  );
}
