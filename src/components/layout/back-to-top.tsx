"use client";

/** Footer "Back to top": scrolls to #main and moves focus to it (keyboard + AT friendly). */
export function BackToTop() {
  const onClick = () => {
    const main = document.getElementById("main");
    if (!main) return;
    // `scrollIntoView` follows the CSS `scroll-behavior`: smooth normally, instant when the
    // visitor prefers reduced motion.
    main.scrollIntoView();
    main.focus({ preventScroll: true });
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className="text-text-3 hover:text-neon-cyan focus-visible:ring-neon-cyan inline-flex min-h-[44px] items-center rounded-md px-2 text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none"
    >
      Back to top ↑
    </button>
  );
}
