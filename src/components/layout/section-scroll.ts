/**
 * Scroll to a Home section and move focus to its heading. Called after the site menu
 * closes, so it waits for the body-scroll lock to release (the unlock runs in a cleanup
 * effect) before scrolling. `scrollIntoView()` follows the CSS `scroll-behavior`, so it is
 * smooth normally and instant with reduced motion.
 */
export function scrollToSection(id: string) {
  let tries = 0;
  const go = () => {
    if (document.body.style.overflow === "hidden" && tries++ < 10) {
      requestAnimationFrame(go);
      return;
    }
    document.getElementById(id)?.scrollIntoView();
    focusSection(id);
  };
  requestAnimationFrame(go);
}

/** Scrolls to a Home section and focuses its heading (used when the menu is already closed). */
export function jumpToSection(id: string) {
  document.getElementById(id)?.scrollIntoView();
  focusSection(id);
}

function focusSection(id: string) {
  document.querySelector<HTMLElement>(`#${id} [data-section-heading]`)?.focus({ preventScroll: true });
}
