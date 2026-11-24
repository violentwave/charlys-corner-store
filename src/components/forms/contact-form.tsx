"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ReferralFields } from "./referral-fields";
import { notifyFormsComingSoon } from "./form-notice";
import { contactSchema, type ContactInput } from "@/lib/schemas";
import type { Control, FieldErrors } from "react-hook-form";
import type { ReferralInput } from "@/lib/schemas";

export function ContactForm() {
  const {
    register,
    control,
    handleSubmit,
    setFocus,
    formState: { errors },
  } = useForm<ContactInput>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      message: "",
      referralSource: undefined,
      referralOther: "",
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
    const first = Object.keys(errs)[0] as keyof ContactInput | undefined;
    if (first) setFocus(first);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit, onError)} className="flex flex-col gap-4" noValidate>
      <Field label="Name" required error={errors.name?.message}>
        <Input {...register("name")} invalid={!!errors.name} />
      </Field>
      <Field label="Email" required error={errors.email?.message}>
        <Input type="email" autoComplete="email" {...register("email")} invalid={!!errors.email} />
      </Field>
      <Field label="Phone" hint="Optional." error={errors.phone?.message}>
        <Input type="tel" autoComplete="tel" {...register("phone")} invalid={!!errors.phone} />
      </Field>
      <Field label="Message" required error={errors.message?.message}>
        <Textarea rows={5} {...register("message")} invalid={!!errors.message} />
      </Field>
      <ReferralFields
        control={control as unknown as Control<ReferralInput>}
        errors={errors as FieldErrors<ReferralInput>}
      />
      <div>
        <Button type="submit" loading={submitting}>
          Send message
        </Button>
      </div>
    </form>
  );
}
