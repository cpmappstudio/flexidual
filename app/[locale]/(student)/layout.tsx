import { setupLocale } from '@/lib/locale-setup';
import { Toaster } from "@/components/ui/sonner";

export default async function StudentLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  await setupLocale(params);

  return (
    <div className="h-screen w-screen overflow-hidden bg-gradient-to-br from-blue-100 via-purple-100 to-pink-100 dark:from-blue-950 dark:to-purple-950">
      {children}
      <Toaster />
    </div>
  );
}