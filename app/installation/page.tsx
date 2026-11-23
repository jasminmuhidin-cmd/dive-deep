import type { Metadata } from "next";
import InstallationViewer from "@/components/installation-3d/InstallationViewer";

export const metadata: Metadata = {
  title: "dive deep · installation model",
};

export default function InstallationPage() {
  return <InstallationViewer />;
}
