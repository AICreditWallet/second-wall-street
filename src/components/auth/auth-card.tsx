import type { ReactNode } from "react";
import { SiteHeader } from "@/components/site/site-header";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export function AuthCard({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main id="main" className="relative grid min-h-[calc(100dvh-4rem)] place-items-center overflow-hidden px-4 py-12">
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_50%_0%,#0f2147_0%,#04070f_65%)]" />
        <div className="w-full max-w-sm">
          <h1 className="text-center text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-2 text-center text-sm text-fg-muted">{subtitle}</p>}
          {!isSupabaseConfigured && (
            <p role="note" className="mt-6 rounded-xl border border-gold/30 bg-gold/10 px-3.5 py-2.5 text-sm text-gold">
              Accounts aren&apos;t switched on in this environment yet. You can still explore the city and directory.
            </p>
          )}
          <div className="mt-8 rounded-3xl border border-line bg-ink-900/80 p-6 backdrop-blur">{children}</div>
          {footer && <div className="mt-6 text-center text-sm text-fg-muted">{footer}</div>}
        </div>
      </main>
    </>
  );
}

export function GitHubIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}
