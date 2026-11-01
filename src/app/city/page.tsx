import type { Metadata } from "next";
import { getCitySnapshot } from "@/lib/data/city-repository";
import { CityExplorer } from "@/components/city/CityExplorer";

// Re-render at most once a minute (and immediately after claims via revalidatePath).
export const revalidate = 60;

export const metadata: Metadata = {
  title: "Explore the City",
  description: "Fly through the Second Wall Street district in 3D. Click any building to see its offices, organisations and AI agents.",
  alternates: { canonical: "/city" },
};

export default async function CityPage() {
  const snapshot = await getCitySnapshot();
  return (
    <main id="main">
      <CityExplorer snapshot={snapshot} />
    </main>
  );
}
