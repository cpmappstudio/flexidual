import type { Metadata } from "next";
import { Geist, Geist_Mono, Fraunces } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-logo",
  axes: ["SOFT"],
  weight: "variable", 
});

export const metadata: Metadata = {
  title: "CPCA Teachers",
  description: "TODO: Add description",
  icons: {
    icon: "/cpca.ico",
  },
};

// Root Layout DEBE contener <html> y <body>
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} antialiased`}>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
