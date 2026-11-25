"use client";
/**
 * Client-side loader for the builder: Konva must never run on the server, so the
 * stage is imported with next/dynamic + ssr:false (allowed only in Client Components —
 * see node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md). The page keeps
 * its server component + metadata; this thin wrapper is the client boundary.
 */
import dynamic from "next/dynamic";

function BuilderSkeleton() {
  return (
    <div
      className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]"
      role="status"
      aria-label="Loading the mockup builder"
      data-testid="builder-skeleton"
    >
      <div className="bg-builder-backdrop min-h-72 animate-pulse rounded-xl" aria-hidden="true" />
      <div className="flex flex-col gap-4" aria-hidden="true">
        <div className="bg-bg-2 h-8 w-3/4 animate-pulse rounded-full" />
        <div className="bg-bg-2/85 min-h-96 animate-pulse rounded-2xl" />
      </div>
    </div>
  );
}

const Builder = dynamic(() => import("./builder").then((m) => m.Builder), {
  ssr: false,
  loading: () => <BuilderSkeleton />,
});

export function BuilderLoader() {
  return <Builder />;
}
