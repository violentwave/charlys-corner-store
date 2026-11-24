import Image from "next/image";

import { cn } from "@/lib/cn";
import { portfolio, type PortfolioItem } from "@/content/portfolio";

export interface PortfolioGalleryProps {
  items?: readonly PortfolioItem[];
  limit?: number;
  kind?: PortfolioItem["kind"];
  className?: string;
}

export function PortfolioGallery({ items, limit, kind, className }: PortfolioGalleryProps) {
  let list = items ?? portfolio;
  if (kind) list = list.filter((item) => item.kind === kind);
  if (limit) list = list.slice(0, limit);

  return (
    <div className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-3", className)}>
      {list.map((item) => (
        <figure key={item.src} className="flex flex-col gap-2">
          <div className="border-border bg-bg-2/60 overflow-hidden rounded-xl border" style={{ maxWidth: item.width }}>
            <Image
              src={item.src}
              alt={item.alt}
              width={item.width}
              height={item.height}
              className="h-auto w-full object-contain"
            />
          </div>
          <figcaption className="text-text-3 text-xs">{item.caption}</figcaption>
        </figure>
      ))}
    </div>
  );
}
