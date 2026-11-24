"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FileField } from "./file-field";
import { FormStatus } from "./form-status";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Turnstile } from "./turnstile";
import { uploadSchema, type UploadInput } from "@/lib/schemas";
import type { ActionResult } from "@/lib/action-result";

export function UploadForm() {
  const [files, setFiles] = useState<File[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [tokenKey, setTokenKey] = useState(0);
  const [progress, setProgress] = useState<number | null>(null);
  const [result, setResult] = useState<ActionResult | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<UploadInput>({
    resolver: zodResolver(uploadSchema),
    defaultValues: { firstName: "", lastName: "", email: "", orderNumber: "", notes: "" },
  });

  const onSubmit = (data: UploadInput) => {
    if (files.length === 0) {
      setResult({ ok: false, error: "Please choose a file." });
      return;
    }
    const form = new FormData();
    for (const [key, value] of Object.entries(data)) {
      form.append(key, value ?? "");
    }
    form.append("turnstileToken", token ?? "");
    form.append("file", files[0]);
    // honeypot
    form.append("website", "");

    setResult(null);
    setProgress(0);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/uploads");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) setProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      setProgress(null);
      let parsed: ActionResult;
      try {
        parsed = JSON.parse(xhr.responseText) as ActionResult;
      } catch {
        parsed = { ok: false, error: "Something went wrong. Please try again." };
      }
      if (!parsed.ok && parsed.fieldErrors) {
        for (const [field, message] of Object.entries(parsed.fieldErrors)) {
          setError(field as keyof UploadInput, { message });
        }
      }
      setResult(parsed);
      if (parsed.ok) {
        reset();
        setFiles([]);
        setToken(null);
        setTokenKey((k) => k + 1);
      }
    };
    xhr.onerror = () => {
      setProgress(null);
      setResult({ ok: false, error: "Upload failed. Please try again." });
    };
    xhr.send(form);
  };

  if (result?.ok) {
    return (
      <div className="border-border bg-bg-2/60 flex flex-col gap-4 rounded-2xl border p-6">
        <p className="font-heading text-neon-green text-lg uppercase">Got it!</p>
        <p className="text-text-2">{result.message}</p>
        <button
          type="button"
          className="text-neon-cyan self-start text-sm underline-offset-4 hover:underline"
          onClick={() => setResult(null)}
        >
          Upload another
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" required error={errors.firstName?.message}>
          <Input {...register("firstName")} invalid={!!errors.firstName} />
        </Field>
        <Field label="Last name" required error={errors.lastName?.message}>
          <Input {...register("lastName")} invalid={!!errors.lastName} />
        </Field>
      </div>
      <Field label="Email" required error={errors.email?.message}>
        <Input type="email" autoComplete="email" {...register("email")} invalid={!!errors.email} />
      </Field>
      <Field label="Order number" required error={errors.orderNumber?.message}>
        <Input {...register("orderNumber")} invalid={!!errors.orderNumber} />
      </Field>
      <FileField name="file" label="Artwork file" files={files} onChange={setFiles} />
      <Field label="Notes" hint="Optional." error={errors.notes?.message}>
        <Textarea rows={3} {...register("notes")} invalid={!!errors.notes} />
      </Field>

      <Turnstile onToken={setToken} resetKey={tokenKey} />

      {progress !== null ? (
        <div role="status" aria-live="polite" className="flex flex-col gap-1">
          <span className="text-text-2 text-xs">Uploading… {progress}%</span>
          <div
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            className="bg-bg-3 h-2 w-full overflow-hidden rounded-full"
          >
            <div className="bg-neon-cyan h-full transition-[width]" style={{ width: `${progress}%` }} />
          </div>
        </div>
      ) : null}

      <FormStatus status={result && !result.ok ? "error" : null} message={result && !result.ok ? result.error : null} />

      <div>
        <Button type="submit">Upload artwork</Button>
      </div>
    </form>
  );
}
