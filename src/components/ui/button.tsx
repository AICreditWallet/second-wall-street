import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-medium transition-[background,color,border-color,transform] duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 min-h-11 px-5 text-sm";

const variants: Record<Variant, string> = {
  primary: "bg-cyan text-ink-950 hover:bg-cyan-soft shadow-[0_0_32px_-6px_rgb(56_225_255/0.6)]",
  secondary: "glass text-fg hover:border-line-strong hover:bg-ink-700/70",
  ghost: "text-fg-muted hover:text-fg",
};

export function buttonClass(variant: Variant = "primary", extra = "") {
  return `${base} ${variants[variant]} ${extra}`;
}

export function ButtonLink({
  variant = "primary",
  className = "",
  children,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; children: ReactNode }) {
  // The city page pulls in the whole 3D engine, so only fetch it once someone actually clicks.
  const toCity = typeof props.href === "string" && props.href.startsWith("/city");
  return (
    <Link className={buttonClass(variant, className)} prefetch={toCity ? false : undefined} {...props}>
      {children}
    </Link>
  );
}
