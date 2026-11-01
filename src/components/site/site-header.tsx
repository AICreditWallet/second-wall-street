"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { NAV } from "@/lib/site";
import { buttonClass } from "@/components/ui/button";
import { Logo } from "./logo";

type Me = { configured: boolean; user: { name: string; avatarUrl: string | null } | null };

function useMe() {
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/me", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Me | null) => alive && setMe(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return me;
}

function AccountLink({ me }: { me: NonNullable<Me["user"]> }) {
  return (
    <Link href="/dashboard" className="flex min-h-10 items-center gap-2 rounded-full border border-line py-1 pl-1 pr-4 text-sm hover:border-line-strong">
      {me.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={me.avatarUrl} alt="" className="size-8 rounded-full" referrerPolicy="no-referrer" />
      ) : (
        <span className="grid size-8 place-items-center rounded-full bg-ink-700 text-xs font-semibold">{me.name.slice(0, 1).toUpperCase()}</span>
      )}
      Dashboard
    </Link>
  );
}

export function SiteHeader({ overlay = false }: { overlay?: boolean }) {
  const [open, setOpen] = useState(false);
  const me = useMe();
  const user = me?.user ?? null;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className={`${overlay ? "absolute" : "sticky border-b border-line bg-ink-950/80 backdrop-blur-xl"} inset-x-0 top-0 z-40`}>
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-4 sm:px-6">
        <Logo />
        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="rounded-full px-3.5 py-2 text-sm text-fg-muted transition-colors hover:text-fg">
              {item.label}
            </Link>
          ))}
          <Link href="/developers#open-source" className="rounded-full px-3.5 py-2 text-sm text-fg-muted transition-colors hover:text-fg">
            GitHub
          </Link>
        </nav>
        <div className="hidden items-center gap-2 lg:flex">
          {user ? (
            <AccountLink me={user} />
          ) : (
            <>
              <Link href="/sign-in" className={buttonClass("ghost", "px-3")}>
                Sign In
              </Link>
              <Link href="/get-started" className={buttonClass("primary", "min-h-10")}>
                Get Started
              </Link>
            </>
          )}
        </div>
        <button
          type="button"
          className="grid size-11 place-items-center rounded-full text-fg lg:hidden"
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>
      {open && (
        <nav id="mobile-nav" aria-label="Mobile" className="glass mx-3 mb-3 rounded-2xl p-2 lg:hidden">
          {[...NAV, { href: "/developers#open-source", label: "GitHub" }, user ? { href: "/account", label: "Account" } : { href: "/sign-in", label: "Sign In" }].map((item) => (
            <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className="flex min-h-12 items-center rounded-xl px-4 text-base text-fg hover:bg-white/5">
              {item.label}
            </Link>
          ))}
          <Link href={user ? "/dashboard" : "/get-started"} onClick={() => setOpen(false)} className={buttonClass("primary", "mt-2 w-full")}>
            {user ? "Dashboard" : "Get Started"}
          </Link>
        </nav>
      )}
    </header>
  );
}
