import { SignIn } from "@clerk/nextjs";
import Image from "next/image";

export default function SignInPage() {
  return (
    <main className="flex min-h-svh flex-col bg-white lg:grid lg:grid-cols-[minmax(24rem,0.85fr)_minmax(0,1.15fr)]">
      <section className="order-2 flex flex-1 items-center justify-center bg-white px-4 py-6 sm:px-8 sm:py-10 lg:order-1 lg:min-h-svh lg:px-12 xl:px-16">
        <div className="w-full max-w-[28rem]">
          <SignIn
            appearance={{
              layout: {
                logoImageUrl: "/signin-logo.svg",
                logoPlacement: "inside",
              },
              variables: {
                colorBackground: "#ffffff",
                colorForeground: "#3f4850",
                colorMutedForeground: "#66737d",
                colorPrimary: "#197db8",
                colorInput: "#ffffff",
                colorInputForeground: "#3f4850",
                colorBorder: "#dce5ea",
                colorRing: "#197db8",
                borderRadius: "0.6rem",
                fontFamily: "var(--font-nunito), sans-serif",
                fontFamilyButtons: "var(--font-nunito), sans-serif",
              },
              elements: {
                rootBox: {
                  width: "100%",
                },
                cardBox: {
                  width: "100%",
                  maxWidth: "28rem",
                  boxShadow: "none",
                },
                card: {
                  width: "100%",
                  border: "none",
                  backgroundColor: "#ffffff",
                  boxShadow: "none",
                },
                logoBox: {
                  height: "auto",
                  marginBottom: "0.5rem",
                },
                logoImage: {
                  width: "10.5rem",
                  height: "auto",
                  maxHeight: "6.5rem",
                },
                headerTitle: {
                  color: "#3f4850",
                  fontWeight: "750",
                  letterSpacing: "-0.025em",
                },
                headerSubtitle: {
                  color: "#66737d",
                },
                formFieldLabel: {
                  color: "#3f4850",
                  fontWeight: "600",
                },
                formFieldInput: {
                  color: "#3f4850",
                  backgroundColor: "#ffffff",
                  borderColor: "#dce5ea",
                },
                formButtonPrimary: {
                  backgroundColor: "#197db8",
                  color: "#ffffff",
                  fontFamily: "var(--font-nunito), sans-serif",
                  boxShadow:
                    "0 6px 14px color-mix(in oklab, #197db8 25%, transparent), 0 1px 2px color-mix(in oklab, #197db8 16%, transparent)",
                  transition: "all 0.15s ease",
                  "&:hover": {
                    backgroundColor: "#166fa4",
                    boxShadow:
                      "0 10px 20px color-mix(in oklab, #197db8 28%, transparent), 0 2px 5px color-mix(in oklab, #197db8 20%, transparent)",
                    transform: "translateY(-1px)",
                  },
                  "&:focus": {
                    boxShadow:
                      "0 0 0 3px color-mix(in oklab, #197db8 30%, transparent) !important",
                  },
                  "&:active": {
                    boxShadow:
                      "0 1px 3px color-mix(in oklab, #197db8 30%, transparent) !important",
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
      </section>

      <div
        className="relative order-1 h-44 overflow-hidden bg-primary/10 sm:h-60 lg:order-2 lg:h-auto lg:min-h-svh"
        aria-hidden="true"
      >
        <Image
          src="/illustration-signin.svg"
          alt=""
          fill
          priority
          sizes="(max-width: 1023px) 100vw, 58vw"
          className="object-contain p-3 sm:p-5 lg:p-10 xl:p-14"
        />
      </div>
    </main>
  );
}
