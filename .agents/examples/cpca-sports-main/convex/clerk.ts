import { createClerkClient } from "@clerk/backend";

// Initialize the Clerk Admin SDK
// Make sure CLERK_SECRET_KEY is set in your Convex dashboard environment variables
const clerkSecretKey = process.env.CLERK_SECRET_KEY;
if (!clerkSecretKey) {
  throw new Error("CLERK_SECRET_KEY environment variable is not set!");
}

export const clerkClient = createClerkClient({ secretKey: clerkSecretKey });
