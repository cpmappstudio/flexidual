type AuthErrorTranslations = {
  (key: "invalidCredentials"): string;
  (key: "resetRequestError"): string;
  (key: "resetVerificationError"): string;
  (key: "genericError"): string;
};

type AuthErrorContext = "signIn" | "resetRequest" | "resetVerification";

export function getAuthErrorMessage(
  t: AuthErrorTranslations,
  context: AuthErrorContext,
) {
  switch (context) {
    case "signIn":
      return t("invalidCredentials");
    case "resetRequest":
      return t("resetRequestError");
    case "resetVerification":
      return t("resetVerificationError");
    default:
      return t("genericError");
  }
}
