# Research Digest (from `ScrapedData/`)

> Condensed takeaways from ~45 scraped extraction files (May 2026). Use this first. Go to the raw JSON only when you need specifics.

## Data quality notes
- Most extractions captured **only `<head>` metadata/CSS**, not body copy. Treat "services: none found" as "not captured," not "not offered."
- Junk/blocked captures you can ignore: `extraction-result-incapsula-block.json`, `incapsula-blocked-page-analysis.json`, `competitor-data/cloudflare-challenge-extraction.json`, `scraped-data/403-error-extraction.json`, `extracted-data/skies-the-limit-extraction.json` (AMP boilerplate only).
- Duplicates: `retro-designs-extraction Copy.json`; customink and instaprintshirts appear twice.
- `competitor-data/screenprintdirect-portfolio-article.json` is **invalid JSON** (unescaped quotes in meta description).
- **Richest files:** `shirt-co-competitor-analysis.json`, `silverback-sports-extraction.json`, `inkheadgraphics_analysis.json`, `selogowear-analysis.json`, the design-inspiration folder, and `research/dark-mode-ui-patterns.md`.

## Local competitors (Port St. Lucie / Treasure Coast)
| Competitor | Platform | Notable |
|---|---|---|
| **Shirt.Co** (STL Shirt Co, PSL landing page) | WordPress + Elementor + Yoast | Union-certified, "since 1975," 4.9★ / 685+ Google reviews, **free quotes in under 2 hours**, no minimums, rush in ≤1 week, free online team stores, **200+ city landing pages** (`/custom-t-shirt/[city]-[state]/`) |
| **Silverback Sports** | Webflow | "Local, family-owned," hero video, tabbed services (screen print, embroidery, dye-sub, business apparel, sportswear, promo), "Get a free quote" CTA |
| **Custom One Online** | Shopify + **Zakeke** customizer | **Same-day** custom tees is the whole pitch |
| **PSL Custom Print & Graphics** (printpsl.com) | WordPress Divi + WooCommerce + **Fancy Product Designer** | Has an online product designer: the closest feature competitor to our builder |
| **Inkhead Graphics** | Squarespace | "One Stop Print Shop": shirts, signs, wraps, promo; keyword-stuffs Jensen Beach, Stuart, Fort Pierce |
| **SE Logo Wear** | GoDaddy builder | Screen print, embroidery, banners, promo; video hero, sticky transparent-to-solid header |

**Where Charly's can win:** none of them look or feel distinctive. All are generic white/blue/green templates. A bold neon brand plus a **better-than-FPD/Zakeke mockup builder** (realistic recolor, multi-zone colors, emailed mockup plus coupon) plus personality (Charly the dog, humor tees, memorial and fundraiser shirts) is a clear differentiator.

## National players (patterns to borrow)
- **Custom Ink:** design-lab flow, chat popup, store locator, Algolia search, Klaviyo newsletter.
- **Printful:** mockup generator; product cards with **dual-image hover swap + 1.0→1.15 scale**.
- **DecoNetwork / Printavo:** what shop software expects: online designer, quotes, order management. Printavo's guide: a print-shop site needs a portfolio, clear services, an easy quote path, and social proof.
- **Print Renegades (LA):** shows a Google rating (4.9 / 76) in schema; services DTG/DTF/screen/embroidery.
- **Hittn' Skins (Orlando):** sticker editor priced per square inch with quantity tiers (a useful model if Charly's adds stickers).

## Must-have features distilled
1. **Fast quote path**: prominent "Get a Quote" CTA; promise a response time (Shirt.Co: <2 hrs).
2. **Trust signals**: Google rating, review count, years in business, "local & family-owned," real photos.
3. **Services explainer**: screen printing vs DTF vs embroidery (when to choose which).
4. **Use-case sections**: businesses, teams, schools/fundraisers, events, memorials, gifts.
5. **Portfolio/gallery** of real jobs (curated, not a dump; per the Screen Print Direct article).
6. **No-minimums / rush** messaging if true (ask the owner).
7. **Online designer**: ours is the flagship.
8. Newsletter or lead capture: our email gate covers this.

## Local SEO plan
- Title pattern: `Custom T-Shirts & Screen Printing in Port St. Lucie, FL | Charly's Corner Store`
- Service + city landing pages (quality over Shirt.Co's 200 thin pages): **Port St. Lucie, Stuart, Jensen Beach, Fort Pierce, Tradition, Palm City, Hobe Sound, Vero Beach**, and services: custom t-shirts, screen printing, DTF, embroidery, custom hats, business/promo products, banners.
- Keywords seen across competitors: custom t shirts port st lucie, screen printing port st lucie, embroidery port st lucie, same day custom t-shirts, promotional products, custom hats, Treasure Coast.
- Schema (JSON-LD): `LocalBusiness` (or `ClothingStore`), `Product` + `Offer` on shop items, `BreadcrumbList`, `FAQPage`, `AggregateRating` once real reviews exist.
- Google Business Profile, NAP consistency, review-request email after orders.

## Design research summary
See `03-DESIGN-SYSTEM.md`. Sources: Vev dark palettes ("Neon Highlights" rated best fit), a ready-made `neon-dark-mode-theme.css` (variables, gradients, glows), Muzli dark-mode patterns (Poppins, glass cards, sticky blur nav, gradient pill buttons), Rapid Silk Screen (Bungee Inline + Nunito), Awwwards/Colorlib/Dribbble/Qode retro galleries.

## Ideas surfaced for later
- **"Ask Charly" chat**: research files map components for it (Custom Ink chat popup, toast patterns). v2: an AI helper that answers FAQs, recommends print method, and starts quotes.
- Free online team/fundraiser stores (Shirt.Co offers this).
- Sticker / DTF gang-sheet builder priced per square inch.
- Konami-code easter egg (Sunrise Wear has one): perfect for the synthwave vibe.
