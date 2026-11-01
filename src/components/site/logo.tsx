import Link from "next/link";

export function LogoMark({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="#0e1730" stroke="rgb(148 170 220 / 0.3)" />
      <rect x="7" y="13" width="5" height="12" rx="1.2" fill="#22306b" />
      <rect x="13.5" y="7" width="5" height="18" rx="1.2" fill="#38e1ff" />
      <rect x="20" y="10" width="5" height="15" rx="1.2" fill="#e2b86b" />
    </svg>
  );
}

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight" aria-label="Second Wall Street home">
      <LogoMark />
      <span className="text-[15px]">
        Second <span className="text-fg-muted">Wall Street</span>
      </span>
    </Link>
  );
}
