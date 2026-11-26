"use client";
/**
 * The "Brand kit" tab (docs/02 Member perks, P49-3): the member's ink colors (≤ 8), fonts
 * (≤ 4) and a logo (≤ 10 MB). The builder puts all three first in the designer.
 */
import { useEffect, useRef, useState } from "react";

import type { BrandKit } from "@/app/api/account/brand-kit/route";
import { BRAND_FONTS_MAX, BRAND_INK_MAX } from "@/lib/member-schemas";
import { TEXT_FONTS, type TextFontId } from "@/lib/text-fonts";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NETWORK_ERROR } from "@/components/forms/auth-post";

const LOGO_MAX_BYTES = 10 * 1024 * 1024;
const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

export function BrandKitTab() {
  const [kit, setKit] = useState<BrandKit | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);

  // Local edits (the kit is saved explicitly).
  const [inks, setInks] = useState<string[]>([]);
  const [fonts, setFonts] = useState<TextFontId[]>([]);
  const [hexDraft, setHexDraft] = useState("#000000");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [pending, setPending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/account/brand-kit", { cache: "no-store" })
      .then(async (res) => {
        const data = (await res.json().catch(() => null)) as { brandKit?: BrandKit } | null;
        if (!alive) return;
        if (res.ok && data?.brandKit) {
          setKit(data.brandKit);
          setInks(data.brandKit.inkColors);
          setFonts(data.brandKit.fonts as TextFontId[]);
          setLogoPreview(data.brandKit.logo?.url ?? null);
        } else {
          setError("We couldn't load your brand kit. Please refresh the page.");
        }
      })
      .catch(() => {
        if (alive) setError("We couldn't load your brand kit. Please refresh the page.");
      });
    return () => {
      alive = false;
    };
  }, []);

  const pickLogo = (file: File | undefined) => {
    if (!file) return;
    if (!LOGO_TYPES.includes(file.type)) {
      setError("Logos can be PNG, JPG, WEBP, or SVG.");
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      setError("Your logo must be 10 MB or less.");
      return;
    }
    setError(null);
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
    setRemoveLogo(false);
  };

  const save = async () => {
    setPending(true);
    setError(null);
    const body = new FormData();
    body.append("payload", JSON.stringify({ inkColors: inks, fonts, removeLogo }));
    if (logoFile) body.append("logo-0", logoFile);
    try {
      const res = await fetch("/api/account/brand-kit", { method: "PUT", body });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; brandKit?: BrandKit } | null;
      if (res.ok && data?.ok && data.brandKit) {
        setKit(data.brandKit);
        setLogoFile(null);
        setLogoPreview(data.brandKit.logo?.url ?? null);
        setRemoveLogo(false);
        setAnnouncement("Brand kit saved.");
        return;
      }
      setError(data?.error ?? NETWORK_ERROR);
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      setPending(false);
    }
  };

  if (error && !kit) {
    return (
      <div role="alert" className="flex flex-col items-start gap-4">
        <p className="text-danger text-sm">{error}</p>
        <Button type="button" variant="secondary" size="sm" onClick={() => setError(null)}>
          Try again
        </Button>
      </div>
    );
  }
  if (!kit) {
    return (
      <p role="status" className="text-text-2 animate-pulse text-sm" data-testid="brand-kit-loading">
        Loading your brand kit…
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-8" data-testid="brand-kit">
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <p role="note" className="border-border bg-bg-2/60 text-text-2 rounded-xl border p-3 text-sm">
        Your colors, fonts and logo show up first in the designer — one tap to use them on any design.
      </p>

      <section className="flex flex-col gap-3" aria-labelledby="brand-inks">
        <h3 id="brand-inks" className="font-heading text-text-1 text-sm tracking-widest uppercase">
          Ink colors ({inks.length}/{BRAND_INK_MAX})
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          {inks.map((hex, index) => (
            <button
              key={`${hex}-${index}`}
              type="button"
              aria-label={`Remove ink ${hex}`}
              title={`Remove ${hex}`}
              onClick={() => setInks((prev) => prev.filter((_, i) => i !== index))}
              className="border-border focus-visible:ring-neon-cyan relative h-9 w-9 rounded-full border transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:outline-none"
              style={{ backgroundColor: hex }}
              data-testid={`brand-ink-remove-${index}`}
            >
              <span
                aria-hidden="true"
                className="bg-bg-0 text-text-1 absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full text-[9px]"
              >
                ×
              </span>
              <span className="sr-only">{hex}</span>
            </button>
          ))}
          {inks.length === 0 ? (
            <p className="text-text-3 text-xs">No colors yet — add your brand&apos;s inks.</p>
          ) : null}
        </div>
        {inks.length < BRAND_INK_MAX ? (
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Add a color" hint="Pick or type the hex." controlId="brand-ink-picker" className="w-40">
              <div className="flex items-center gap-2">
                <input
                  id="brand-ink-picker"
                  type="color"
                  value={hexDraft}
                  onChange={(e) => setHexDraft(e.target.value)}
                  className="h-9 w-12 cursor-pointer rounded-md border p-0.5"
                  data-testid="brand-ink-picker"
                />
                <Input
                  type="text"
                  value={hexDraft}
                  maxLength={7}
                  spellCheck={false}
                  onChange={(e) => {
                    const next = e.target.value.trim();
                    if (/^#[0-9a-fA-F]{6}$/.test(next)) setHexDraft(next.toLowerCase());
                  }}
                  className="h-9 w-24 font-mono text-xs"
                  aria-label="Ink hex value"
                  data-testid="brand-ink-hex"
                />
              </div>
            </Field>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={!/^#[0-9a-fA-F]{6}$/.test(hexDraft)}
              onClick={() => {
                const hex = hexDraft.toLowerCase();
                if (inks.some((c) => c.toLowerCase() === hex)) {
                  setError("That color is already in your kit.");
                  return;
                }
                setError(null);
                setInks((prev) => [...prev, hex]);
              }}
              data-testid="brand-ink-add"
            >
              Add color
            </Button>
          </div>
        ) : (
          <p role="note" className="text-text-3 text-xs" data-testid="brand-inks-cap">
            {BRAND_INK_MAX} colors is the max — remove one to add another.
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="brand-fonts">
        <h3 id="brand-fonts" className="font-heading text-text-1 text-sm tracking-widest uppercase">
          Fonts ({fonts.length}/{BRAND_FONTS_MAX})
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          {fonts.map((id) => {
            const font = TEXT_FONTS.find((f) => f.id === id);
            return (
              <button
                key={id}
                type="button"
                aria-label={`Remove font ${font?.label ?? id}`}
                onClick={() => setFonts((prev) => prev.filter((f) => f !== id))}
                className="border-border bg-bg-3 text-text-1 focus-visible:ring-neon-cyan hover:border-border-strong flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
                data-testid={`brand-font-remove-${id}`}
                style={{ fontFamily: `"${font?.family}", sans-serif`, fontWeight: font?.weight }}
              >
                {font?.label ?? id}
                <span aria-hidden="true" className="text-danger text-xs">
                  ×
                </span>
              </button>
            );
          })}
          {fonts.length === 0 ? <p className="text-text-3 text-xs">No fonts yet.</p> : null}
        </div>
        {fonts.length < BRAND_FONTS_MAX ? (
          <div className="flex flex-wrap items-end gap-2">
            <Field
              label="Add a font"
              hint="Shown in the designer first."
              controlId="brand-font-picker"
              className="w-72"
            >
              <select
                id="brand-font-picker"
                value=""
                onChange={(e) => {
                  const id = e.target.value as TextFontId;
                  if (id && !fonts.includes(id)) setFonts((prev) => [...prev, id]);
                }}
                data-testid="brand-font-picker"
                className="border-border bg-bg-3 text-text-1 focus-visible:ring-neon-cyan h-11 w-full rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
              >
                <option value="">Pick a font…</option>
                {TEXT_FONTS.filter((f) => !fonts.includes(f.id)).map((font) => (
                  <option
                    key={font.id}
                    value={font.id}
                    style={{ fontFamily: `"${font.family}"`, fontWeight: font.weight }}
                  >
                    {font.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        ) : (
          <p role="note" className="text-text-3 text-xs" data-testid="brand-fonts-cap">
            {BRAND_FONTS_MAX} fonts is the max — remove one to add another.
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="brand-logo">
        <h3 id="brand-logo" className="font-heading text-text-1 text-sm tracking-widest uppercase">
          Logo
        </h3>
        <div className="flex flex-wrap items-center gap-4">
          {logoPreview && !removeLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoPreview}
              alt="Your logo"
              className="border-border bg-bg-3 h-20 w-20 rounded-lg border object-contain p-1"
              data-testid="brand-logo-preview"
            />
          ) : (
            <div
              aria-hidden="true"
              className="border-border text-text-3 bg-bg-3 flex h-20 w-20 items-center justify-center rounded-lg border border-dashed text-xs"
            >
              No logo
            </div>
          )}
          <div className="flex flex-col gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml"
              className="sr-only"
              data-testid="brand-logo-input"
              aria-hidden="true"
              tabIndex={-1}
              onChange={(e) => {
                pickLogo(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="w-fit"
              onClick={() => fileRef.current?.click()}
              data-testid="brand-logo-pick"
            >
              {kit.logo ? "Replace logo" : "Upload a logo"}
            </Button>
            {kit.logo || logoFile ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-danger w-fit"
                onClick={() => {
                  setRemoveLogo(true);
                  setLogoFile(null);
                  setLogoPreview(null);
                }}
                data-testid="brand-logo-remove"
              >
                Remove logo
              </Button>
            ) : null}
          </div>
        </div>
      </section>

      {error ? (
        <p role="alert" className="text-danger text-sm" data-testid="brand-kit-error">
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="button" onClick={() => void save()} loading={pending} data-testid="brand-kit-save">
          Save brand kit
        </Button>
        <p className="text-text-3 text-xs">PNG, JPG, WEBP, or SVG up to 10 MB.</p>
      </div>
    </div>
  );
}
