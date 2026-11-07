import Image from "next/image";
import Link from "next/link";

/** The official mark. A small pre-sized file, so it skips image optimisation. */
export function LogoMark({ className = "size-9" }: { className?: string }) {
  return <Image src="/brand/logo-mark.webp" alt="" width={96} height={96} unoptimized className={className} />;
}

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight" aria-label="Second Wall Street home">
      <LogoMark />
      <span className="text-[15px]">
        Second <span className="text-fg-muted">Wall Street</span>
      </span>
    </Link>
  );
}
