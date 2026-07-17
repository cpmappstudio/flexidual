// ################################################################################
// # Check: 12/13/2025                                                            #
// ################################################################################

import {
  Inter,
  Geist_Mono,
  Montserrat,
  Merriweather,
  Source_Code_Pro,
  Plus_Jakarta_Sans,
  Source_Serif_4,
  JetBrains_Mono,
  DM_Sans,
  Space_Mono,
  Oxanium,
  Open_Sans,
} from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

const montserrat = Montserrat({
  subsets: ["latin"],
  variable: "--font-montserrat",
});

const merriweather = Merriweather({
  subsets: ["latin"],
  weight: ["300", "400", "700", "900"],
  variable: "--font-merriweather",
});

const sourceCodePro = Source_Code_Pro({
  subsets: ["latin"],
  variable: "--font-source-code-pro",
});

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-plus-jakarta-sans",
});

const sourceSerif4 = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-source-serif-4",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
});

const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-space-mono",
});

const oxanium = Oxanium({
  subsets: ["latin"],
  variable: "--font-oxanium",
});

const openSans = Open_Sans({
  subsets: ["latin"],
  variable: "--font-open-sans",
});

/**
 * All CSS variable classes combined into a single string
 * Use this in the body className for optimal loading
 */
export const fontVariables = [
  inter.variable,
  geistMono.variable,
  montserrat.variable,
  merriweather.variable,
  sourceCodePro.variable,
  plusJakartaSans.variable,
  sourceSerif4.variable,
  jetbrainsMono.variable,
  dmSans.variable,
  spaceMono.variable,
  oxanium.variable,
  openSans.variable,
].join(" ");

/**
 * CSS variable names for theme configurations
 */
export const FONT_VARIABLES = {
  inter: "--font-inter",
  geistMono: "--font-geist-mono",
  montserrat: "--font-montserrat",
  merriweather: "--font-merriweather",
  sourceCodePro: "--font-source-code-pro",
  plusJakartaSans: "--font-plus-jakarta-sans",
  sourceSerif4: "--font-source-serif-4",
  jetbrainsMono: "--font-jetbrains-mono",
  dmSans: "--font-dm-sans",
  spaceMono: "--font-space-mono",
  oxanium: "--font-oxanium",
  openSans: "--font-open-sans",
} as const;
