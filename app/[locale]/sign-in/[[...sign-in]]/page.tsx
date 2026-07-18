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
        <div className="absolute inset-0 bg-linear-[175deg] from-secondary/45 from-0% via-secondary/35 via-40% to-transparent to-60%" />
        {/* Gradiente oscuro desde abajo — crea el "panel" donde vive el card */}
        <div className="absolute inset-0 bg-linear-to-t from-inverse/95 from-48% via-inverse/55 via-68% to-transparent" />
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
                  backgroundColor: "var(--card)", 
                  boxShadow:
                    "0 12px 28px -14px color-mix(in oklab, var(--inverse) 48%, transparent), 0 22px 36px -24px color-mix(in oklab, var(--inverse) 42%, transparent), 0 0 0 1px var(--border)",
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
                    backgroundImage: "url(/logo-flexidual.svg)",
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
                  color: "var(--card-foreground)",
                  fontWeight: "750",
                  letterSpacing: "-0.025em",
                  "@media (max-width: 1023px)": {
                    color: "var(--inverse-foreground)",
                  },
                },
                headerSubtitle: {
                  color: "var(--muted-foreground)",
                  "@media (max-width: 1023px)": {
                    color: "color-mix(in oklab, var(--inverse-foreground) 70%, transparent)",
                  },
                },
                formFieldLabel: {
                  color: "var(--card-foreground)", 
                  "@media (max-width: 1023px)": {
                    color: "color-mix(in oklab, var(--inverse-foreground) 82%, transparent)",
                  },
                },
                formFieldInput: {
                  color: "var(--foreground)",
                  backgroundColor: "var(--background)",
                  borderColor: "var(--border)",
                  "@media (max-width: 1023px)": {
                    backgroundColor: "color-mix(in oklab, var(--inverse-foreground) 8%, transparent)",
                    borderColor: "color-mix(in oklab, var(--inverse-foreground) 15%, transparent)",
                    color: "var(--inverse-foreground)",
                  },
                },
                formButtonPrimary: {
                  backgroundColor: "var(--primary)",
                  color: "var(--primary-foreground)",
                  boxShadow:
                    "0 6px 14px color-mix(in oklab, var(--primary) 25%, transparent), 0 1px 2px color-mix(in oklab, var(--primary) 16%, transparent)",
                  transition: "all 0.15s ease",
                  "&:hover": {
                    backgroundColor: "color-mix(in oklab, var(--primary) 90%, var(--foreground))",
                    boxShadow:
                      "0 10px 20px color-mix(in oklab, var(--primary) 28%, transparent), 0 2px 5px color-mix(in oklab, var(--primary) 20%, transparent)",
                    transform: "translateY(-1px)",
                  },
                  "&:focus": {
                    boxShadow:
                      "0 0 0 3px color-mix(in oklab, var(--primary) 30%, transparent) !important",
                  },
                  "&:active": {
                    boxShadow: "0 1px 3px color-mix(in oklab, var(--primary) 30%, transparent) !important",
                    transform: "translateY(0)",
                  },
                  "& .cl-buttonArrowIcon": {
                    display: "none",
                  },
                },
                footer: {
                  display: "none",
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
        <div className="absolute inset-0 bg-linear-[175deg] from-secondary/45 from-0% via-secondary/35 via-40% to-transparent to-60%" />
        {/* Gradiente oscuro desde abajo — crea el "panel" donde vive el card */}
        <div className="absolute inset-0 bg-linear-to-t from-inverse/75 from-48% via-inverse/55 via-68% to-transparent" />
      </div>
    </div>
  );
}
