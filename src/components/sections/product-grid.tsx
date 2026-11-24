import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPrice, type Product } from "@/content/catalog";
import { cn } from "@/lib/cn";

export interface ProductGridProps {
  items: readonly Product[];
  className?: string;
}

export function ProductGrid({ items, className }: ProductGridProps) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-3", className)}>
      {items.map((product) => (
        <Card key={product.slug}>
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <CardTitle>{product.name}</CardTitle>
              {product.category === "memorial" ? <Badge variant="yellow">Memorial · gives back</Badge> : null}
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-text-2 text-sm">{product.blurb}</p>
            <p className="text-neon-yellow font-mono">{formatPrice(product)}</p>
            {product.donation ? <p className="text-text-3 text-xs">{product.donation}</p> : null}
            {product.priceFromCents === null ? (
              <Link href="#quote" className="text-neon-cyan text-sm underline-offset-4 hover:underline">
                Get a quote
              </Link>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
