import { Link } from "@/i18n/navigation";
import { FlexidualLogo } from "@/components/ui/flexidual-logo";

type LandingFooterProps = {
  navigation: {
    title: string;
    home: string;
    features: string;
    benefits: string;
    institutions: string;
  };
  access: {
    title: string;
    signIn: string;
  };
  tagline: string;
  rights: string;
};

export function LandingFooter({
  navigation,
  access,
  tagline,
  rights,
}: LandingFooterProps) {
  return (
    <footer className="border-t border-border bg-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr] lg:px-8">
        <div>
          <FlexidualLogo className="h-12" />
          <p className="mt-4 max-w-sm text-sm leading-6 text-muted-foreground">
            {tagline}
          </p>
        </div>

        <div>
          <h2 className="text-sm font-bold text-foreground">
            {navigation.title}
          </h2>
          <div className="mt-4 flex flex-col gap-3 text-sm text-muted-foreground">
            <a href="#home" className="hover:text-primary">
              {navigation.home}
            </a>
            <a href="#features" className="hover:text-primary">
              {navigation.features}
            </a>
            <a href="#benefits" className="hover:text-primary">
              {navigation.benefits}
            </a>
            <a href="#institutions" className="hover:text-primary">
              {navigation.institutions}
            </a>
          </div>
        </div>

        <div>
          <h2 className="text-sm font-bold text-foreground">{access.title}</h2>
          <div className="mt-4 text-sm text-muted-foreground">
            <Link href="/sign-in" className="hover:text-primary">
              {access.signIn}
            </Link>
          </div>
        </div>
      </div>
      <div className="border-t border-border px-4 py-5 text-center text-xs text-muted-foreground">
        {rights}
      </div>
    </footer>
  );
}
