// ################################################################################
// # Check: 12/14/2025                                                            #
// ################################################################################
// Component made by @Clerk.

const authConfig = {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN,
      applicationID: "convex",
    },
  ],
};

export default authConfig;
