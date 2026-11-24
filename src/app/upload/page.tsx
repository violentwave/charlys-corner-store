import type { Metadata } from "next";

import { ComingSoon } from "@/components/neon/coming-soon";

export const metadata: Metadata = { title: "Upload Artwork" };

export default function UploadPage() {
  return (
    <ComingSoon
      title="Upload Artwork"
      phase="Phase 3"
      description="Already placed an order? Upload your artwork with your order number and we'll attach it."
    />
  );
}
