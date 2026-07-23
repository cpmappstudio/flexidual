import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { OrganizationInvitationPassword } from "./organizationInvitation/OrganizationInvitationPassword";
import { PlatformInvitationPassword } from "./platformInvitation/PlatformInvitationPassword";
import { ResendOTPPasswordReset } from "./passwordReset/ResendOTPPasswordReset";

function requireEmail(params: Record<string, unknown>) {
  const email = params.email;
  if (typeof email !== "string" || email.length === 0) {
    throw new Error("Missing email");
  }

  return email;
}

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      reset: ResendOTPPasswordReset,
      profile(params) {
        if (params.flow === "signUp") {
          throw new Error("Account creation is not available.");
        }

        return {
          email: requireEmail(params),
        };
      },
    }),
    PlatformInvitationPassword,
    OrganizationInvitationPassword,
  ],
});
