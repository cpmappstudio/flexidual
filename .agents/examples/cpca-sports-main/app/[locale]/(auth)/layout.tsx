// ################################################################################
// # Check: 12/14/2025                                                            #
// ################################################################################

import { SlimLayout } from "@/components/layouts/slim-layout";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SlimLayout>{children}</SlimLayout>;
}
