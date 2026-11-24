"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type { Resolver } from "react-hook-form";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { notifyFormsComingSoon } from "./form-notice";
import { quoteSchema, type QuoteInput } from "@/lib/schemas";

export function QuoteForm() {
  const {
    register,
    handleSubmit,
    setFocus,
    formState: { errors },
  } = useForm<QuoteInput>({
    resolver: zodResolver(quoteSchema) as unknown as Resolver<QuoteInput>,
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      company: "",
      items: "",
      quantity: undefined,
      neededBy: "",
      notes: "",
    },
  });

  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async () => {
    setSubmitting(true);
    await new Promise((resolve) => setTimeout(resolve, 300));
    setSubmitting(false);
    notifyFormsComingSoon();
  };

  const onError = (errs: typeof errors) => {
    const first = Object.keys(errs)[0] as keyof QuoteInput | undefined;
    if (first) setFocus(first);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit, onError)} className="flex flex-col gap-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" required error={errors.name?.message}>
          <Input {...register("name")} invalid={!!errors.name} />
        </Field>
        <Field label="Email" required error={errors.email?.message}>
          <Input type="email" autoComplete="email" {...register("email")} invalid={!!errors.email} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Phone" hint="Optional." error={errors.phone?.message}>
          <Input type="tel" autoComplete="tel" {...register("phone")} invalid={!!errors.phone} />
        </Field>
        <Field label="Company" hint="Optional." error={errors.company?.message}>
          <Input {...register("company")} invalid={!!errors.company} />
        </Field>
      </div>
      <Field label="What do you need?" required error={errors.items?.message}>
        <Textarea rows={4} {...register("items")} invalid={!!errors.items} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Quantity" hint="Optional." error={errors.quantity?.message}>
          <Input type="number" min={1} {...register("quantity")} invalid={!!errors.quantity} />
        </Field>
        <Field label="Needed by" hint="Optional." error={errors.neededBy?.message}>
          <Input type="date" {...register("neededBy")} invalid={!!errors.neededBy} />
        </Field>
      </div>
      <Field label="Notes" hint="Optional." error={errors.notes?.message}>
        <Textarea rows={3} {...register("notes")} invalid={!!errors.notes} />
      </Field>
      <p className="text-text-3 text-xs">
        Have artwork? You&apos;ll be able to upload it here soon — for now, attach it in an email.
      </p>
      <div>
        <Button type="submit" loading={submitting}>
          Request quote
        </Button>
      </div>
    </form>
  );
}
