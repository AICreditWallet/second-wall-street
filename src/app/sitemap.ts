import type { MetadataRoute } from "next";
import { getCitySnapshot } from "@/lib/data/city-repository";
import { LEGAL_DOCS, SITE } from "@/lib/site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const s = await getCitySnapshot();
  const paths = [
    "/",
    "/city",
    "/directory",
    "/agents",
    "/developers",
    "/contact",
    ...Object.keys(LEGAL_DOCS).map((d) => `/legal/${d}`),
    ...s.organizations.map((o) => `/orgs/${o.slug}`),
    ...s.agents.map((a) => `/agents/${a.slug}`),
    ...s.buildings.map((b) => `/buildings/${b.id}`),
  ];
  return paths.map((p) => ({ url: `${SITE.url}${p}` }));
}
