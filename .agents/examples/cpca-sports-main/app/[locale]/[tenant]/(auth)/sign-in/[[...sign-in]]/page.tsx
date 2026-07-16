import { SignIn } from "@clerk/nextjs";

interface PageProps {
  params: Promise<{ tenant: string }>;
}

export default async function TenantSignInPage({ params }: PageProps) {
  const { tenant } = await params;

  return (
    <SignIn
      signUpUrl={`/${tenant}/sign-up`}
      forceRedirectUrl={`/${tenant}/applications`}
      appearance={{
        elements: {
          rootBox: {
            width: "100%",
          },

          // card: organization?.imageUrl
          //   ? {
          //       backgroundColor: "oklch(1 0 0)",
          //       "&::before": {
          //         content: '""',
          //         display: "block",
          //         width: "150px",
          //         height: "150px",
          //         backgroundImage: `url(${organization.imageUrl})`,
          //         backgroundSize: "contain",
          //         backgroundRepeat: "no-repeat",
          //         backgroundPosition: "center",
          //         margin: "0 auto 1.5rem",
          //         borderRadius: "0.5rem",
          //       },
          //     }
          //   : {},
          // header: {
          //   display: "block !important",
          // },
          logoBox: {
            height: "auto",
          },
          headerTitle: {
            marginTop: "0.5rem",
          },
          headerSubtitle: {
            color: "oklch(0.5 0.01 270)",
          },
          formButtonPrimary: {
            backgroundColor: "oklch(0.4025 0.1539 258.7191)",
            boxShadow: "none !important",
            "&:hover": {
              backgroundColor: "oklch(0.4025 0.1539 258.7191 / 0.8)",
              boxShadow: "none !important",
            },
            "&:focus": {
              boxShadow: "none !important",
            },
            "&:active": {
              boxShadow: "none !important",
            },
            "& .cl-buttonArrowIcon": {
              display: "none",
            },
          },
          "cl-internal-5loyu9": {
            boxShadow: "none !important",
          },
          footer: {
            display: "block !important",
            "& .cl-internal-1dauvpw": {
              display: "none",
            },
            "& .cl-internal-1k7jtru": {
              backgroundImage: "none",
            },
          },
          footerAction: {
            backgroundColor: "oklch(0.2 0.1 258.72)",
            display: "flex",
            justifyContent: "center",
          },
          footerActionText: {
            color: "oklch(0.9392 0.0166 250.8453)",
          },
          footerActionLink: {
            color: "oklch(0.8341 0.0908 238.1044)",
            "&:hover": {
              color: "oklch(0.8341 0.0908 238.1044 / 0.8)",
            },
          },
        },
      }}
    />
  );
}
