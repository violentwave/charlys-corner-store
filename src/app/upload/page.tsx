import type { Metadata } from "next";

import { PageHeader } from "@/components/sections/page-header";
import { Section } from "@/components/sections/section";
import { UploadForm } from "@/components/forms/upload-form";

export const metadata: Metadata = {
  title: "Upload Artwork",
  description: "Already placed an order? Attach your artwork with your order number.",
};

export default function UploadPage() {
  return (
    <Section>
      <PageHeader
        eyebrow="Existing orders"
        title="Upload artwork for your order"
        description="Already placed an order? Send us your artwork and your order number and we'll attach it to your job."
      />
      <div className="mt-8 max-w-xl">
        <UploadForm />
      </div>
    </Section>
  );
}
