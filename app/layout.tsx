import type { Metadata } from "next";
import {
  Fraunces,
  Source_Sans_3,
  IBM_Plex_Mono,
  Playfair_Display,
  Playfair,
} from "next/font/google";
import "./globals.css";

const display = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  axes: ["SOFT", "WONK", "opsz"],
});

const body = Source_Sans_3({
  variable: "--font-body",
  subsets: ["latin"],
});

const mono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

/**
 * Projection typography. Playfair Display has no 300 on Google Fonts (it
 * starts at 400), so "Light 300" uses Playfair — the same designer's newer
 * family, which does ship a true 300 (and an optical-size axis).
 */
const playfairDisplay = Playfair_Display({
  variable: "--font-playfair-display",
  subsets: ["latin"],
  weight: ["400"],
  display: "swap",
});

const playfairLight = Playfair({
  variable: "--font-playfair-light",
  subsets: ["latin"],
  weight: ["300", "400"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "deep dive",
  description:
    "Don't just skim the surface. Find what anchors you — an interactive installation about care, friction, and collective action.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} ${mono.variable} ${playfairDisplay.variable} ${playfairLight.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
