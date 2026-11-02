import type { Metadata, Viewport } from "next";
import { Averia_Serif_Libre } from "next/font/google";
import MobileApp from "@/components/MobileApp/MobileApp";
import "./dive.css";

// Every word on the dive is Averia Serif Libre
const serif = Averia_Serif_Libre({
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "dive deep · into the water",
};

export const viewport: Viewport = {
  themeColor: "#d2e3e6",
  viewportFit: "cover",
};

/** The home page and website archive: a dive down through every thought left at the kiosk */
export default function DivePage() {
  return <MobileApp className={serif.className} />;
}
