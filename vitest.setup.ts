import "@testing-library/jest-dom/vitest";

// jsdom has no ResizeObserver; Radix primitives (checkbox, toast, …) need one.
if (typeof globalThis.ResizeObserver === "undefined") {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}
