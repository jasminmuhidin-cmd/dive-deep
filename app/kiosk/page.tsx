import { Averia_Serif_Libre } from "next/font/google";
import KioskFlow from "@/components/KioskFlow";

/** The kiosk's typeface (loaded only on this page). */
const averia = Averia_Serif_Libre({
  variable: "--font-averia-serif",
  subsets: ["latin"],
  weight: ["300", "400", "700"],
  display: "swap",
});

export default function KioskPage() {
  return (
    <div className={`${averia.variable} contents`}>
      <KioskFlow />
    </div>
  );
}
