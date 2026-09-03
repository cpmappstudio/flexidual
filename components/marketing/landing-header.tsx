import { Menu } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { FlexidualLogo } from "@/components/ui/flexidual-logo";

type LandingHeaderProps = {
  navigation: {
    home: string;
    features: string;
    benefits: string;
    institutions: string;
  };
  signInLabel: string;
  menuLabel: string;
};

export function LandingHeader({
  navigation,
  signInLabel,
  menuLabel,
}: LandingHeaderProps) {
  const links = [
    { href: "#home", label: navigation.home },
    { href: "#features", label: navigation.features },
    { href: "#benefits", label: navigation.benefits },
    { href: "#institutions", label: navigation.institutions },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-border/80 bg-white/95 backdrop-blur">
      <nav
        aria-label={menuLabel}
        className="mx-auto flex h-20 max-w-7xl items-center justify-between gap-8 px-4 sm:px-6 lg:px-8"
      >
        <a href="#home" aria-label="FlexiDual">
          <FlexidualLogo priority className="h-11" />
        </a>

        <div className="hidden items-center gap-7 lg:flex">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-semibold text-muted-foreground transition-colors hover:text-primary"
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="hidden lg:block">
          <Button asChild variant="secondary" className="rounded-full px-6">
            <Link href="/sign-in">{signInLabel}</Link>
          </Button>
        </div>

        <details className="group relative lg:hidden">
          <summary className="flex size-10 cursor-pointer list-none items-center justify-center rounded-md border border-border bg-white text-foreground transition-colors hover:bg-muted [&::-webkit-details-marker]:hidden">
            <span className="sr-only">{menuLabel}</span>
            <Menu className="size-5" aria-hidden="true" />
          </summary>
          <div className="absolute right-0 mt-3 w-64 rounded-xl border border-border bg-white p-3 shadow-lg">
            <div className="flex flex-col gap-1">
              {links.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="rounded-lg px-3 py-2.5 text-sm font-semibold text-foreground hover:bg-muted"
                >
                  {link.label}
                </a>
              ))}
              <Button asChild variant="secondary" className="mt-2 w-full">
                <Link href="/sign-in">{signInLabel}</Link>
              </Button>
            </div>
          </div>
        </details>
      </nav>
    </header>
  );
}
