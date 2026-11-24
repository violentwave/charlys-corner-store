# Current Site Inventory and Feature-Parity Checklist

> Audited from the live Weebly site on 2026-11-23. **Every item below must exist in the new site** (equal or better). Tick boxes as they ship.

Platform: **Weebly** ("Proudly powered by Weebly", images on `cdn2.editmysite.com`). Weebly is owned by Square, so the store likely runs on Square; confirm with the owner.

## Navigation (header and footer)
Home · Custom Image Uploader · Product · About · Business & Promotional Products · Design Your Own Shirt

## Page-by-page

### Home: `/`
- [ ] Brand header plus nav
- [ ] **"We would like to know" referral survey:** "How did you hear about this site?" (required): Internet Search / Advertisement / Friend / Other, plus a conditional "If Other please specify" text field, plus Submit
  - New site: keep it, but fold it into checkout, the mockup gate, and quote forms as an optional "How did you hear about us?" field, and keep a lightweight version on Home.

### Product: `/product.html` (catalog)
Each item has a "Shop" link to its own product page.

| Product | Price |
|---|---|
| Austin Hodge Memorial Shirt (a % of sales to the Hodge family) | $30.00 |
| Omari Lewis Memorial Shirt (link text says "Omari Linzell Williams"; **confirm correct name**) | $30.00 to $35.00 |
| Custom Hats | $48.00 |
| Men and Women's Polos | $55.00 to $63.50 |
| Gildan Custom Tank Tops | $16.99 to $20.99 |
| Gildan Cotton Tees | $25.00 to $30.00 |
| Banners, Indoor/Outdoor (6x3, 8x3, 10x3) | $125.00 to $225.00 |
| Custom Foam Koozies | $1.25 |
| Business Cards (250 / 500 / 1,000; matte or glossy) | $57.50 to $150.00 |

- [ ] All 9 products with variants (size, color, quantity, finish) and real photos
- [ ] Individual product pages
- [ ] Cart plus checkout (the current site has no visible cart on the listing page; checkout presumably lives on Weebly/Square product pages)
- [ ] "Memorial / Fundraiser" collection with donation messaging

### Custom Image Uploader: `/custom-image-uploader.html`
Used by customers who **already placed an order** to attach artwork.
- [ ] Name (First and Last, required)
- [ ] Email (required)
- [ ] Order number (required)
- [ ] File upload (required), PNG or JPEG, max 20 MB
- [ ] Fix: the current heading says "attach order number and file in the comment section", but there's no comment field. Add an optional Notes field.
- New site: allow PDF, SVG, and AI/EPS too (better for print), show a preview, and email the owner a link to the file.

### About: `/about.html`
- [ ] Origin story (Charly the dog, bold-message shirts), "Have a Ruffin awesome day"
- [ ] Custom order request form: Name, Email, Comment
- New site: add photos of Charly and the shop, the Treasure Coast angle, and testimonials.

### Business & Promotional Products: `/business--promotional-products.html`
- [ ] Copy: promo products to brand clients: **hats, koozies, totes, mouse pads, pop sockets**
- [ ] Email-for-orders contact: **CHARLYSCORNERSTORE@GMAIL.COM**
- [ ] Image gallery (~11 images, no captions). **Download originals before cutover.**
- New site: turn it into a proper Business/Bulk page with a quote form (company, quantity, deadline, logo upload).

### Design Your Own Shirt: `/design-your-own-shirt.html` ("Charly's Corner Store Tee's Mockup Builder")
**Step 1, Choose Product:** T-Shirt / Hoodie / Polo / Tank / Hat · Product Color · Upload design (PNG with transparency recommended) · Front View / Back View
**Step 2, Edit Design:** Size · Rotate · Center · Remove · Download Mockup
**Step 3, Order Details:** Print location (Front Chest / Full Front / Full Back / Left Chest / Hat Front) · Sizes/Quantity · Extra notes · Submit Mockup
**Submit section:** Name · Email · Phone · *re-upload the downloaded mockup* (clunky) · Order notes · Cancel / "Send To Charly's"

- [ ] Every control above exists in the new builder (spec: `04-MOCKUP-BUILDER-SPEC.md`)
- [ ] The new builder sends the generated mockup automatically, with **no download-then-reupload step**
- [ ] Garments: **T-shirt, Baseball tee, Hoodie, Hat, Polo, Tank** (Polo and Tank confirmed 2026-11-23)

## Past-work photos (`Assets/Clothes/`, received 2026-11-23)
These are 12 photos of real jobs, not blank garment templates (so they can't be used as mockup-builder templates). Use them for the **portfolio/gallery**. Logan will supply better photos later; treat these as placeholders.
- Trucker/mesh hats (several business logos), printed tees (business and character art), dark tees with full-color prints
- Most are low-res phone photos (some ~100–280px wide).
- They show client logos (TCS Cleaning, Green & Clean, Harley & Family, A1 Pressure Cleaning, Gold Star Water, etc.). **Confirm the owner is OK showing client work** before publishing (Brief Q11).

### Products confirmed offered (2026-11-23), missing from the old site
The owner offers all of these. They need product/service listings on **Shop** and **Business & Promo**, not just gallery photos:
- [ ] **Business cards** (incl. appointment-card backs; current catalog already lists 250/500/1,000, matte/glossy)
- [ ] **Flyers**
- [ ] **Stickers / decals**
- [ ] **Lanyards**
- [ ] **Sublimated pillows** (strong "fun gift" item)
- Pricing for these is TBD (Brief Q3); use `TODO(content)` until then.

## Not on the current site (all gaps we fill)
Contact info · address/map · hours · social links · testimonials/reviews · FAQ · portfolio of past work · services explainer (screen print vs DTF vs embroidery) · quote form for bulk · SEO schema · analytics.

## Migration tasks
- [ ] Scrape and download all product and gallery images at full resolution (Weebly CDN)
- [ ] Export any existing customer/order data from Weebly/Square
- [x] Permanent (308) redirects in `next.config.ts`: `/product.html` → `/shop`, `/about.html` → `/about`, `/custom-image-uploader.html` → `/upload`, `/business--promotional-products.html` → `/business`, `/design-your-own-shirt.html` → `/design`
