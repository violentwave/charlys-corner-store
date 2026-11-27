"use client";
/** The member's cart icon + count badge in the header (docs/04 §5b). */
import Link from "next/link";

/** Screen-reader label that carries the count in words (the badge is decorative). */
export function cartLabel(count: number) {
  if (count <= 0) return "Cart, empty";
  return `Cart, ${count} ${count === 1 ? "design" : "designs"}`;
}

export function CartLink({ count }: { count: number }) {
  return (
    <Link
      href="/cart"
      data-testid="cart-link"
      aria-label={cartLabel(count)}
      transitionTypes={["nav-forward"]}
      className="text-text-1 hover:bg-bg-2 focus-visible:ring-neon-cyan relative inline-flex h-11 w-11 items-center justify-center rounded-md transition-colors duration-150 focus-visible:ring-2 focus-visible:outline-none"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-5 w-5"
      >
        <path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.6L21 7H6" />
        <circle cx="10" cy="20" r="1.2" />
        <circle cx="18" cy="20" r="1.2" />
      </svg>
      {count > 0 ? (
        <span
          aria-hidden="true"
          data-testid="cart-count"
          className="bg-neon-cyan text-bg-0 absolute top-0.5 right-0.5 min-w-5 rounded-full px-1 text-center font-mono text-[11px] leading-5 font-bold"
        >
          {count}
        </span>
      ) : null}
    </Link>
  );
}
