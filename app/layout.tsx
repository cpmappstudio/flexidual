import type { Metadata } from "next";
import { Geist_Mono, Nunito } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  display: "swap",
});


const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});



export const metadata: Metadata = {
  title: "FlexiDual",
  description: "TODO: Add description",
  icons: {
    icon: {
      url: "/book-icon.webp",
      type: "image/webp",
    },
  },
};

// Root Layout DEBE contener <html> y <body>
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${nunito.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <body className="antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
