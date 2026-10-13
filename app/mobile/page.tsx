import type { Metadata, Viewport } from "next";
import MobileApp from "@/components/MobileApp/MobileApp";

export const metadata: Metadata = {
  title: "deep dive · into the water",
};

export const viewport: Viewport = {
  themeColor: "#8ad3dc",
  viewportFit: "cover",
};

export default function MobilePage() {
  return <MobileApp />;
}
