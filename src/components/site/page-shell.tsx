import type { ReactNode } from "react";
import { SiteHeader } from "./site-header";
import { SiteFooter } from "./site-footer";

export function PageShell({ eyebrow, title, intro, children }: { eyebrow?: string; title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto min-h-[60vh] max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
        {eyebrow && <p className="text-sm font-medium text-cyan">{eyebrow}</p>}
        <h1 className="mt-2 max-w-3xl text-3xl font-semibold tracking-tight text-balance sm:text-5xl">{title}</h1>
        {intro && <div className="mt-4 max-w-2xl text-fg-muted">{intro}</div>}
        <div className="mt-12">{children}</div>
      </main>
      <SiteFooter />
    </>
  );
}
