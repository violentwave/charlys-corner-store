import { Section } from "@/components/sections/section";
import { UploadForm } from "@/components/forms/upload-form";

/** Home #upload: the existing-orders artwork uploader, same copy as the old /upload page. */
export function UploadSection() {
  return (
    <Section
      id="upload"
      eyebrow="Existing orders"
      title="Upload artwork for your order"
      description="Already placed an order? Send us your artwork and your order number and we'll attach it to your job."
    >
      <div className="max-w-xl">
        <UploadForm />
      </div>
    </Section>
  );
}
