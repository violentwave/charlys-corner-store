"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type { Resolver } from "react-hook-form";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FileField } from "./file-field";
import { FormStatus } from "./form-status";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Turnstile } from "./turnstile";
import { quoteSchema, type QuoteInput } from "@/lib/schemas";
import type { ActionResult } from "@/lib/action-result";

export function QuoteForm() {
  const [files, setFiles] = useState<File[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [tokenKey, setTokenKey] = useState(0);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, setPending] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setError,
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

  const onSubmit = async (data: QuoteInput) => {
    const form = new FormData();
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined && value !== null) form.append(key, String(value));
    }
    form.append("turnstileToken", token ?? "");
    form.append("website", "");
    for (const file of files) form.append("files", file);

    setPending(true);
    setResult(null);
    try {
      const res = await fetch("/api/quotes", { method: "POST", body: form });
      const parsed = (await res.json()) as ActionResult;
      if (!parsed.ok && parsed.fieldErrors) {
        for (const [field, message] of Object.entries(parsed.fieldErrors)) {
          setError(field as keyof QuoteInput, { message });
        }
      }
      setResult(parsed);
      if (parsed.ok) {
        reset();
        setFiles([]);
        setToken(null);
        setTokenKey((k) => k + 1);
      }
    } catch {
      setResult({ ok: false, error: "Something went wrong. Please try again." });
    } finally {
      setPending(false);
    }
  };

  if (result?.ok) {
    return (
      <div className="border-border bg-bg-2/60 flex flex-col gap-4 rounded-2xl border p-6">
        <p className="font-heading text-neon-green text-lg uppercase">Thanks!</p>
        <p className="text-text-2">{result.message}</p>
        <button
          type="button"
          className="text-neon-cyan self-start text-sm underline-offset-4 hover:underline"
          onClick={() => setResult(null)}
        >
          Request another
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit as never)} className="flex flex-col gap-4" noValidate>
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

      <FileField name="files" label="Artwork (optional)" files={files} onChange={setFiles} multiple maxFiles={3} />

      <Turnstile onToken={setToken} resetKey={tokenKey} />

      <FormStatus status={result && !result.ok ? "error" : null} message={result && !result.ok ? result.error : null} />

      <div>
        <Button type="submit" loading={pending}>
          Request quote
        </Button>
      </div>
    </form>
  );
}
