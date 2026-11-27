import type { Metadata } from "next";
import { Suspense } from "react";

import { PayDoneClient } from "./pay-done-client";
import { PageTransition } from "@/components/layout/page-transition";

export const metadata: Metadata = { title: "Pay", robots: { index: false, follow: false } };

async function PayDoneLoader({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  return <PayDoneClient id={id} token={sp.t ?? null} />;
}

export default function PayDonePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  return (
    <PageTransition>
      <Suspense fallback={<p className="text-text-2 p-10">Loading…</p>}>
        <PayDoneLoader params={params} searchParams={searchParams} />
      </Suspense>
    </PageTransition>
  );
}
