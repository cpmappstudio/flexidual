import { Email } from "@convex-dev/auth/providers/Email";
import { Resend } from "resend";

function generateNumericCode(length: number) {
  const values = crypto.getRandomValues(new Uint32Array(length));
  return Array.from(values, (value) => String(value % 10)).join("");
}

export const ResendOTPPasswordReset = Email({
  id: "resend-otp-password-reset",
  apiKey: process.env.AUTH_RESEND_KEY,
  async generateVerificationToken() {
    return generateNumericCode(8);
  },
  async sendVerificationRequest({
    identifier: email,
    provider,
    token,
    expires,
  }) {
    const apiKey = provider.apiKey;
    if (!apiKey) {
      throw new Error("Password reset email is not configured.");
    }

    const resend = new Resend(apiKey);
    const hoursUntilExpiration = Math.max(
      1,
      Math.ceil((+expires - Date.now()) / (60 * 60 * 1000)),
    );

    const { error } = await resend.emails.send({
      from: process.env.AUTH_EMAIL ?? "CPM Studio <onboarding@resend.dev>",
      to: [email],
      subject: "Reset your password in CPM Studio",
      text: [
        "Use the verification code below to reset your password in CPM Studio.",
        "",
        `Code: ${token}`,
        `This code expires in ${hoursUntilExpiration} hour${hoursUntilExpiration === 1 ? "" : "s"}.`,
      ].join("\n"),
    });

    if (error) {
      throw new Error("Could not send the password reset email.");
    }
  },
});
