// ################################################################################
// # Check: 12/14/2025                                                            #
// ################################################################################
// Component made by @catalyst

import Image from "next/image";

export function SlimLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 py-10 sm:px-6 md:px-12 lg:px-16">
      <Image
        fill
        className="absolute inset-0 h-full w-full object-cover"
        src={"/background-auth-v1.jpg"}
        alt="Aurora Background"
        priority
      />
      <div className="absolute inset-0 bg-gradient-to-b from-blue-700 to-blue-900 opacity-60" />
      <main className="relative z-10 rounded-xl">
        {children}
      </main>
    </div>
  );
}
