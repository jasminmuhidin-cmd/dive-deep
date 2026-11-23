import type { Metadata, Viewport } from "next";
import { Averia_Serif_Libre } from "next/font/google";
import AboutPage from "@/components/about/AboutPage";

const serif = Averia_Serif_Libre({
  subsets: ["latin"],
  weight: ["300", "400", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "dive deep · about",
  description:
    "Dive Deep is an interactive installation that invites young adults to reflect on social issues, anonymously share their concerns and encounter the perspectives of others.",
};

export const viewport: Viewport = {
  themeColor: "#05070c",
  viewportFit: "cover",
};

export default function About() {
  return <AboutPage className={serif.className} />;
}
