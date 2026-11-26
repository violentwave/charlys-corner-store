import { site } from "@/lib/site";

/**
 * Contact details straight from `src/lib/site.ts` — the confirmed facts only
 * (email is the only confirmed channel; phone/address/hours render when set).
 * Shared by the /contact page and the Home contact summary.
 */
export function ContactDetails({ className }: { className?: string }) {
  return (
    <div className={`border-border bg-bg-2/60 rounded-2xl border p-6 ${className ?? ""}`}>
      <p className="text-text-2">
        Email is the fastest way to reach us. We serve {site.city} and the {site.areaServed}.
      </p>
      <a
        href={`mailto:${site.email}`}
        className="text-neon-cyan mt-3 inline-block font-mono underline-offset-4 hover:underline"
      >
        {site.email.toLowerCase()}
      </a>
      {site.phone ? (
        <p className="text-text-2 mt-2">
          Phone:{" "}
          <a href={`tel:${site.phone}`} className="text-neon-cyan hover:underline">
            {site.phone}
          </a>
        </p>
      ) : null}
      {site.address ? <p className="text-text-2 mt-2">{site.address}</p> : null}
      {site.hours ? <p className="text-text-2 mt-2">{site.hours}</p> : null}
    </div>
  );
}
