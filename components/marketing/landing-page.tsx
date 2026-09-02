import Image from "next/image";
import type { LucideIcon } from "lucide-react";
import {
  Backpack,
  BarChart3,
  BookOpen,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  GraduationCap,
  LayoutDashboard,
  MessageCircle,
  MousePointer2,
  PlayCircle,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { LandingFooter } from "@/components/marketing/landing-footer";
import { LandingHeader } from "@/components/marketing/landing-header";

type IconCardProps = {
  icon: LucideIcon;
  title: string;
  description: string;
};

function IconCard({ icon: Icon, title, description }: IconCardProps) {
  return (
    <article className="flex flex-col items-center text-center">
      <span className="grid size-14 place-items-center rounded-2xl border border-primary/25 bg-primary/5 text-primary">
        <Icon className="size-7" aria-hidden="true" />
      </span>
      <h3 className="mt-4 font-bold text-foreground">{title}</h3>
      <p className="mt-2 max-w-52 text-sm leading-6 text-muted-foreground">
        {description}
      </p>
    </article>
  );
}

export async function LandingPage() {
  const t = await getTranslations("marketing");

  const quickFeatures = [
    { icon: PlayCircle, title: t("hero.quick.liveClasses") },
    { icon: ClipboardCheck, title: t("hero.quick.curricula") },
    { icon: CalendarDays, title: t("hero.quick.tracking") },
  ];
  const features = [
    {
      icon: LayoutDashboard,
      title: t("features.items.centralized.title"),
      description: t("features.items.centralized.description"),
    },
    {
      icon: BookOpen,
      title: t("features.items.flexible.title"),
      description: t("features.items.flexible.description"),
    },
    {
      icon: MousePointer2,
      title: t("features.items.simple.title"),
      description: t("features.items.simple.description"),
    },
    {
      icon: BarChart3,
      title: t("features.items.realtime.title"),
      description: t("features.items.realtime.description"),
    },
    {
      icon: ShieldCheck,
      title: t("features.items.secure.title"),
      description: t("features.items.secure.description"),
    },
  ];
  const audiences = [
    {
      icon: Backpack,
      title: t("institutions.items.elementary.title"),
      description: t("institutions.items.elementary.description"),
    },
    {
      icon: GraduationCap,
      title: t("institutions.items.highSchool.title"),
      description: t("institutions.items.highSchool.description"),
    },
    {
      icon: Building2,
      title: t("institutions.items.institutions.title"),
      description: t("institutions.items.institutions.description"),
    },
  ];
  const benefits = [
    t("benefits.items.communication"),
    t("benefits.items.management"),
    t("benefits.items.engagement"),
    t("benefits.items.platform"),
  ];
  const navigation = {
    home: t("navigation.home"),
    features: t("navigation.features"),
    benefits: t("navigation.benefits"),
    institutions: t("navigation.institutions"),
  };

  return (
    <div className="min-h-svh scroll-smooth bg-white text-foreground">
      <LandingHeader
        navigation={navigation}
        signInLabel={t("actions.signIn")}
        menuLabel={t("navigation.menu")}
      />

      <main>
        <section id="home" className="relative scroll-mt-20 overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-64 bg-[radial-gradient(circle_at_top_left,color-mix(in_oklab,var(--primary)_12%,transparent),transparent_65%)]" />
          <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[0.88fr_1.12fr] lg:px-8 lg:py-24">
            <div className="max-w-xl">
              <p className="mb-5 inline-flex items-center gap-2 rounded-full bg-primary/8 px-4 py-2 text-sm font-bold text-primary">
                <Sparkles className="size-4" aria-hidden="true" />
                {t("hero.eyebrow")}
              </p>
              <h1 className="text-5xl leading-[0.96] font-black tracking-tight sm:text-6xl lg:text-7xl">
                <span className="text-primary">FLEXI</span>
                <span className="text-secondary">DUAL</span>
                <span className="mt-6 block text-3xl leading-tight font-extrabold text-foreground sm:text-4xl lg:text-[2.75rem]">
                  {t("hero.title")}
                </span>
              </h1>
              <p className="mt-6 max-w-lg text-base leading-7 text-muted-foreground sm:text-lg">
                {t("hero.description")}
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button
                  asChild
                  variant="secondary"
                  size="lg"
                  className="rounded-full px-7"
                >
                  <Link href="/sign-in">{t("actions.signIn")}</Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  size="lg"
                  className="rounded-full border-primary/40 px-7 text-primary hover:bg-primary/5 hover:text-primary"
                >
                  <a href="#features">{t("actions.learnMore")}</a>
                </Button>
              </div>

              <div className="mt-12 grid grid-cols-3 gap-3 border-t border-border pt-8">
                {quickFeatures.map(({ icon: Icon, title }) => (
                  <div
                    key={title}
                    className="flex flex-col items-center gap-3 text-center sm:items-start sm:text-left"
                  >
                    <Icon
                      className="size-7 text-primary"
                      strokeWidth={1.8}
                      aria-hidden="true"
                    />
                    <span className="text-xs leading-5 font-semibold text-muted-foreground sm:text-sm">
                      {title}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative mx-auto aspect-square w-full max-w-[42rem]">
              <div className="absolute inset-[5%] rotate-3 rounded-[31%_69%_54%_46%/45%_38%_62%_55%] bg-primary/12" />
              <div className="absolute inset-[10%_4%_4%_10%] -rotate-3 rounded-[58%_42%_37%_63%/48%_56%_44%_52%] bg-secondary/14" />
              <Image
                src="/illustration-signin.svg"
                alt={t("hero.imageAlt")}
                fill
                priority
                sizes="(max-width: 1023px) 100vw, 55vw"
                className="relative z-10 object-contain p-4"
              />
              <div className="absolute right-0 bottom-[10%] z-20 hidden w-44 rounded-2xl border border-border bg-white/95 p-4 shadow-lg sm:block">
                <MessageCircle
                  className="size-7 text-secondary"
                  aria-hidden="true"
                />
                <p className="mt-2 text-sm font-bold text-foreground">
                  {t("hero.callout.title")}
                </p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {t("hero.callout.description")}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section
          id="features"
          className="scroll-mt-20 px-4 py-20 sm:px-6 lg:px-8"
        >
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto max-w-3xl text-center">
              <p className="mx-auto w-fit rounded-full bg-primary px-7 py-2 text-sm font-extrabold tracking-wide text-primary-foreground uppercase sm:text-base">
                {t("features.label")}
              </p>
              <h2 className="mt-7 text-3xl font-extrabold tracking-tight sm:text-4xl">
                {t("features.title")}
              </h2>
              <p className="mt-4 text-base leading-7 text-muted-foreground sm:text-lg">
                {t("features.description")}
              </p>
            </div>
            <div className="mt-14 grid gap-10 sm:grid-cols-2 lg:grid-cols-5">
              {features.map((feature) => (
                <IconCard key={feature.title} {...feature} />
              ))}
            </div>
          </div>
        </section>

        <section
          id="institutions"
          className="scroll-mt-20 bg-primary px-4 py-20 sm:px-6 lg:px-8"
        >
          <div className="mx-auto max-w-7xl">
            <div className="text-center text-primary-foreground">
              <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
                {t("institutions.title")}
              </h2>
              <p className="mt-3 text-primary-foreground/80">
                {t("institutions.description")}
              </p>
            </div>
            <div className="mt-12 grid gap-6 md:grid-cols-3">
              {audiences.map(({ icon: Icon, title, description }) => (
                <article
                  key={title}
                  className="rounded-3xl bg-white p-7 text-center shadow-lg"
                >
                  <span className="mx-auto grid size-16 place-items-center rounded-full border-4 border-primary/15 bg-white text-primary">
                    <Icon className="size-8" aria-hidden="true" />
                  </span>
                  <h3 className="mt-5 text-xl font-extrabold text-primary">
                    {title}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    {description}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section
          id="benefits"
          className="scroll-mt-20 overflow-hidden px-4 py-20 sm:px-6 lg:px-8"
        >
          <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[1fr_0.9fr]">
            <div>
              <h2 className="max-w-2xl text-3xl leading-tight font-extrabold tracking-tight sm:text-4xl">
                {t("benefits.titleBefore")}{" "}
                <span className="text-secondary">FLEXIDUAL</span>{" "}
                {t("benefits.titleAfter")}
              </h2>
              <ul className="mt-8 space-y-4">
                {benefits.map((benefit) => (
                  <li
                    key={benefit}
                    className="flex items-start gap-3 text-base text-muted-foreground"
                  >
                    <CheckCircle2
                      className="mt-0.5 size-5 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                    <span>{benefit}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="relative mx-auto aspect-square w-full max-w-lg">
              <div className="absolute inset-[8%] rounded-[42%_58%_61%_39%/45%_42%_58%_55%] bg-secondary/12" />
              <Image
                src="/backgroud-image.png"
                alt={t("benefits.imageAlt")}
                fill
                sizes="(max-width: 1023px) 100vw, 45vw"
                className="relative z-10 object-contain"
              />
            </div>
          </div>
        </section>

        <section className="px-4 pb-20 sm:px-6 lg:px-8">
          <div className="relative mx-auto flex max-w-7xl flex-col items-start justify-between gap-8 overflow-hidden rounded-3xl bg-primary px-7 py-10 text-primary-foreground sm:px-10 lg:flex-row lg:items-center lg:px-14">
            <div className="absolute -top-20 -right-20 size-64 rounded-full bg-white/8" />
            <div className="relative max-w-2xl">
              <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
                {t("cta.title")}
              </h2>
              <p className="mt-3 max-w-xl text-primary-foreground/80">
                {t("cta.description")}
              </p>
            </div>
            <Button
              asChild
              variant="secondary"
              size="lg"
              className="relative rounded-full px-8"
            >
              <Link href="/sign-in">{t("actions.signIn")}</Link>
            </Button>
          </div>
        </section>
      </main>

      <LandingFooter
        navigation={{ title: t("footer.navigation"), ...navigation }}
        access={{ title: t("footer.access"), signIn: t("actions.signIn") }}
        tagline={t("footer.tagline")}
        rights={t("footer.rights")}
      />
    </div>
  );
}
