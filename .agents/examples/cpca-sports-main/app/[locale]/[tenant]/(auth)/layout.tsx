import { SlimLayout } from "@/components/layouts/slim-layout";

export default async function TenantAuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SlimLayout>{children}</SlimLayout>;
}
