"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { FileField } from "./file-field";
import { FormStatus } from "./form-status";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SizeGrid } from "./size-grid";
import { Textarea } from "@/components/ui/textarea";
import { Turnstile } from "./turnstile";
import { orderFormSchema, type OrderFormInput, REFERRAL_SOURCES, referralLabels } from "@/lib/schemas";
import type { ActionResult } from "@/lib/action-result";
import { GARMENTS } from "@/lib/garments";
import { PRINT_METHODS } from "@/lib/print-methods";

const US_STATES = [
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
  "DC",
];

const PRINT_LOCATIONS = ["Front", "Back", "Left sleeve", "Right sleeve", "Left chest", "Hat front", "Other"];

export function OrderForm() {
  const [files, setFiles] = useState<File[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [tokenKey, setTokenKey] = useState(0);
  const [progress, setProgress] = useState<number | null>(null);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [sizes, setSizes] = useState<Record<string, number>>({});

  const {
    register,
    handleSubmit,
    reset,
    setError,
    watch,
    setValue,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(orderFormSchema),
    defaultValues: {
      orderType: "new",
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      company: "",
      orderNumber: "",
      fulfillment: undefined,
      street: "",
      unit: "",
      city: "",
      state: "",
      zip: "",
      items: [],
      otherItem: false,
      colors: "",
      printMethod: "",
      printLocations: [],
      sizes: {},
      neededBy: "",
      notes: "",
      referralSource: undefined,
      referralOther: "",
      marketingOptIn: false,
    },
  });

  const orderType = watch("orderType");
  const fulfillment = watch("fulfillment");
  const items = watch("items") ?? [];
  const printLocations = watch("printLocations") ?? [];

  const toggleItem = (name: string) => {
    const next = items.includes(name) ? items.filter((i) => i !== name) : [...items, name];
    setValue("items", next, { shouldValidate: true });
  };
  const toggleLocation = (name: string) => {
    const next = printLocations.includes(name) ? printLocations.filter((i) => i !== name) : [...printLocations, name];
    setValue("printLocations", next, { shouldValidate: true });
  };

  const onSubmit = (data: Record<string, unknown>) => {
    const d = data as OrderFormInput;
    const form = new FormData();
    for (const [key, value] of Object.entries(d)) {
      if (Array.isArray(value)) form.append(key, JSON.stringify(value));
      else if (value === undefined || value === null) form.append(key, "");
      else if (typeof value === "object") form.append(key, JSON.stringify(value));
      else form.append(key, String(value));
    }
    form.append("turnstileToken", token ?? "");
    for (const f of files) form.append("files", f, f.name);
    form.append("website", "");

    setResult(null);
    setProgress(0);
    const refreshTurnstile = () => {
      setToken(null);
      setTokenKey((k) => k + 1);
    };

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/uploads");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
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
        for (const [field, message] of Object.entries(parsed.fieldErrors))
          setError(field as keyof OrderFormInput, { message });
      }
      setResult(parsed);
      if (parsed.ok) {
        reset();
        setFiles([]);
      }
      refreshTurnstile();
    };
    xhr.onerror = () => {
      setProgress(null);
      setResult({ ok: false, error: "Submission failed. Please try again." });
      refreshTurnstile();
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
          Send another
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit, (errs) => {
        console.log(
          "RHF errors:",
          Object.keys(errs),
          Object.values(errs).map((e: { message?: string }) => e?.message),
        );
      })}
      className="flex flex-col gap-6"
      noValidate
    >
      <fieldset className="border-border rounded-xl border p-4">
        <legend className="font-heading text-text-1 px-2 text-xs tracking-widest uppercase">Order type</legend>
        <div className="flex flex-col gap-2 sm:flex-row sm:gap-4">
          {(["new", "existing"] as const).map((v) => (
            <label key={v} className="flex items-center gap-2 text-sm">
              <input type="radio" value={v} {...register("orderType")} />
              {v === "new" ? "New order" : "Existing order"}
            </label>
          ))}
        </div>
        {orderType === "existing" ? (
          <div className="mt-3">
            <Field
              label="Order number"
              hint="On your receipt or invoice, if you have it."
              error={errors.orderNumber?.message}
            >
              <Input {...register("orderNumber")} invalid={!!errors.orderNumber} />
            </Field>
          </div>
        ) : null}
      </fieldset>

      <fieldset className="border-border rounded-xl border p-4">
        <legend className="font-heading text-text-1 px-2 text-xs tracking-widest uppercase">You</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name" required error={errors.firstName?.message}>
            <Input {...register("firstName")} invalid={!!errors.firstName} />
          </Field>
          <Field label="Last name" error={errors.lastName?.message}>
            <Input {...register("lastName")} invalid={!!errors.lastName} />
          </Field>
          <Field label="Email" required error={errors.email?.message}>
            <Input type="email" autoComplete="email" {...register("email")} invalid={!!errors.email} />
          </Field>
          <Field label="Phone" error={errors.phone?.message}>
            <Input type="tel" {...register("phone")} invalid={!!errors.phone} />
          </Field>
          <Field label="Company / team / organization" error={errors.company?.message}>
            <Input {...register("company")} invalid={!!errors.company} />
          </Field>
        </div>
      </fieldset>

      <fieldset className="border-border rounded-xl border p-4">
        <legend className="font-heading text-text-1 px-2 text-xs tracking-widest uppercase">Shipping or pickup</legend>
        <div className="flex flex-col gap-2 sm:flex-row sm:gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" value="pickup" {...register("fulfillment")} /> Pickup in Port St. Lucie
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" value="ship" {...register("fulfillment")} /> Ship to me
          </label>
        </div>
        {fulfillment === "ship" ? (
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <Field label="Street" error={errors.street?.message}>
              <Input {...register("street")} invalid={!!errors.street} />
            </Field>
            <Field label="Apt / suite" error={errors.unit?.message}>
              <Input {...register("unit")} invalid={!!errors.unit} />
            </Field>
            <Field label="City" error={errors.city?.message}>
              <Input {...register("city")} invalid={!!errors.city} />
            </Field>
            <Field label="State" error={errors.state?.message}>
              <Select value={watch("state") ?? ""} onValueChange={(v) => setValue("state", v)}>
                <SelectTrigger className="h-11 w-full">
                  <SelectValue placeholder="State" />
                </SelectTrigger>
                <SelectContent>
                  {US_STATES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="ZIP" error={errors.zip?.message}>
              <Input {...register("zip")} invalid={!!errors.zip} />
            </Field>
          </div>
        ) : null}
      </fieldset>

      <fieldset className="border-border rounded-xl border p-4">
        <legend className="font-heading text-text-1 px-2 text-xs tracking-widest uppercase">What you need</legend>
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-text-2 mb-1 text-xs">Item types</p>
            <div className="flex flex-wrap gap-2">
              {GARMENTS.map((g) => (
                <label key={g.id} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={items.includes(g.name)} onCheckedChange={() => toggleItem(g.name)} />
                  {g.name}
                </label>
              ))}
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={!!watch("otherItem")} onCheckedChange={(v) => setValue("otherItem", Boolean(v))} />
                Other
              </label>
            </div>
          </div>
          <Field label="Garment color(s)" hint="Free text." error={errors.colors?.message}>
            <Input {...register("colors")} invalid={!!errors.colors} />
          </Field>
          <Field
            label="Print method"
            hint={
              watch("printMethod")
                ? PRINT_METHODS.find((m) => m.id === watch("printMethod"))?.blurb
                : "We'll pick what suits your design."
            }
            error={errors.printMethod?.message}
          >
            <Select value={watch("printMethod") ?? ""} onValueChange={(v) => setValue("printMethod", v)}>
              <SelectTrigger className="h-11 w-full">
                <SelectValue placeholder="Not sure, recommend one" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Not sure, recommend one</SelectItem>
                {PRINT_METHODS.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div>
            <p className="text-text-2 mb-1 text-xs">Print locations</p>
            <div className="flex flex-wrap gap-2">
              {PRINT_LOCATIONS.map((loc) => (
                <label key={loc} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={printLocations.includes(loc)} onCheckedChange={() => toggleLocation(loc)} />
                  {loc}
                </label>
              ))}
            </div>
          </div>
          <SizeGrid
            sizes={["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL", "OSFA"]}
            values={sizes}
            onChange={(size, qty) => {
              const next = { ...sizes, [size]: qty };
              setSizes(next);
              setValue("sizes", next, { shouldValidate: true });
            }}
            idPrefix="order"
            label="Sizes and quantities (running total)"
          />
          <Field label="Needed by" error={errors.neededBy?.message}>
            <Input type="date" {...register("neededBy")} invalid={!!errors.neededBy} />
          </Field>
        </div>
      </fieldset>

      <fieldset className="border-border rounded-xl border p-4">
        <legend className="font-heading text-text-1 px-2 text-xs tracking-widest uppercase">Artwork</legend>
        <FileField name="files" label="Artwork files" files={files} onChange={setFiles} multiple maxFiles={5} />
      </fieldset>

      <fieldset className="border-border rounded-xl border p-4">
        <legend className="font-heading text-text-1 px-2 text-xs tracking-widest uppercase">Notes</legend>
        <Field label="Notes" hint="Ideas, references, deadlines, anything that helps." error={errors.notes?.message}>
          <Textarea rows={4} {...register("notes")} invalid={!!errors.notes} />
        </Field>
      </fieldset>

      <fieldset className="border-border rounded-xl border p-4">
        <legend className="font-heading text-text-1 px-2 text-xs tracking-widest uppercase">
          How did you hear about us?
        </legend>
        <div className="flex flex-col gap-3">
          <Select
            value={(watch("referralSource") as string | undefined) ?? ""}
            onValueChange={(v) => setValue("referralSource", v as (typeof REFERRAL_SOURCES)[number])}
          >
            <SelectTrigger className="h-11 w-full">
              <SelectValue placeholder="Select one" />
            </SelectTrigger>
            <SelectContent>
              {REFERRAL_SOURCES.map((s) => (
                <SelectItem key={s} value={s}>
                  {referralLabels[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {watch("referralSource") === "other" ? (
            <Field label="Please specify" error={errors.referralOther?.message}>
              <Input {...register("referralOther")} invalid={!!errors.referralOther} />
            </Field>
          ) : null}
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={!!watch("marketingOptIn")}
              onCheckedChange={(v) => setValue("marketingOptIn", Boolean(v))}
            />
            Keep me posted about new products and deals.
          </label>
        </div>
      </fieldset>

      <Turnstile onToken={setToken} resetKey={tokenKey} />

      {progress !== null ? (
        <div className="flex flex-col gap-1">
          <span className="text-text-2 text-xs">Submitting… {progress}%</span>
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
        <Button type="submit">Send my order</Button>
      </div>
    </form>
  );
}
