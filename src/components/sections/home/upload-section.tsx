import { Section } from "@/components/sections/section";
import { OrderForm } from "@/components/forms/order-form";

/** Home #upload: new and existing orders, with or without an account. */
export function UploadSection() {
  return (
    <Section
      id="upload"
      eyebrow="Order without the designer"
      title="Send us your order"
      description="New order or adding art to one you've placed? Fill in what you know: we'll follow up with a price and any questions. Only your first name and email are required."
    >
      <OrderForm />
    </Section>
  );
}
