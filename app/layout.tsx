import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "dive deep",
  description:
    "Don't just skim the surface. Dive through what people carry, and add your own ripple — an interactive installation about care.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
