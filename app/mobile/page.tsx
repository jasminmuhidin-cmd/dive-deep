import type { Metadata, Viewport } from "next";
import { Averia_Serif_Libre } from "next/font/google";
import MobileApp from "@/components/MobileApp/MobileApp";

// Every word on the dive is Averia Serif Libre, at one size
const serif = Averia_Serif_Libre({
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "deep dive · into the water",
};

export const viewport: Viewport = {
  themeColor: "#d2e3e6",
  viewportFit: "cover",
};

export default function MobilePage() {
  return <MobileApp className={serif.className} />;
}
