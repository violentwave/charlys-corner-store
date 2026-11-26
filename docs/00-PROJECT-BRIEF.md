# Charly's Corner Store: Project Brief

> Source of truth for _what_ we're building and _why_. Other docs go deeper on each area.
> Last updated: 2026-11-23

## 1. The business

|                    |                                                                                                                                                                                                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Name**           | Charly's Corner Store Tees & Apparel (the current site's header reads "CHARLY'S CORNERSTORE T-SHIRTS")                                                                                                                                                                                            |
| **Location**       | Port St. Lucie, FL (Treasure Coast)                                                                                                                                                                                                                                                              |
| **What they do**   | Custom T-shirts, hats, hoodies, uniforms, and branded and promotional products, plus **business cards, flyers, stickers/decals, lanyards, and sublimated pillows** (confirmed 2026-11-23). The current meta description mentions DTF printing and embroidery.                                      |
| **Origin story**   | The founders wanted their own business for years. The idea came while walking their dog, **Charly**, in the park: they noticed that shirts with bold messages make people stop, read, and take a short break from daily stress. They sell shirts with humorous everyday captions and memes alongside custom work. |
| **Catchphrase**    | "Have a Ruffin awesome day" 🐾                                                                                                                                                                                                                                                                    |
| **Current domain** | charlyscornerstoreteesandapparel.com (Weebly). The owner owns the domain and will repoint it to the new host at cutover.                                                                                                                                                                          |
| **Contact**        | **Email: CHARLYSCORNERSTORE@GMAIL.COM** (only contact channel for now). Phone, address, hours, and socials are still TBD.                                                                                                                                                                        |
| **Blanks**         | **Gildan** is always stocked. Other brands aren't confirmed, but they'll print on any garment a customer brings in or requests.                                                                                                                                                                  |
| **Logo**           | Temporary logo at `Assets/Logo.png` (1536×1024 raster, neon diamond badge). Final vector is TBD. ⚠️ The wordmark reads "Tee's & **Apperal**", a misspelling of _Apparel_; fix it before production use.                                                                                          |

## 2. The goal

Replace the Weebly site with a **fully custom, fast, mobile-first website** that:

1. **Keeps every feature the current site has** (see `01-CURRENT-SITE-INVENTORY.md`; this is a hard requirement).
2. **Adds a best-in-class Build-Your-Own Mockup tool** (see `04-MOCKUP-BUILDER-SPEC.md`):
   - Garments: **T-shirt, baseball tee (raglan), hoodie, hat, polo, tank**
   - Custom garment color(s) plus upload of the customer's own design
   - **Email gate:** the customer must enter their email to receive the mockup **and a 15% off your 2nd order coupon**
3. Looks unmistakably **Miami Vice / neon synthwave / cyberpunk** (see `03-DESIGN-SYSTEM.md`) while staying readable, accessible, and trustworthy enough to take orders.
4. Wins **local search** for "custom t-shirts Port St. Lucie" and nearby Treasure Coast terms (see `05-RESEARCH-DIGEST.md`).
5. Gives Charly's a real **lead and order pipeline**: every mockup, upload, and quote request lands somewhere the owner can act on.

## 3. Audiences

- **Locals and individuals:** gifts, events, family reunions, memorial shirts, funny tees, custom pillows.
- **Small businesses:** uniforms, polos, hats, banners, business cards, flyers, lanyards, stickers, koozies, promo items.
- **Teams, schools, and orgs:** bulk orders and fundraisers (memorial shirts already donate a percentage to families).

## 4. Success criteria (v1 launch)

- [ ] 100% feature parity checklist in `01-CURRENT-SITE-INVENTORY.md` ticked
- [ ] Mockup builder works on phone and desktop; the email gate delivers the mockup and a unique coupon to the inbox
- [ ] Owner receives a notification for every mockup lead, upload, and quote request
- [ ] Lighthouse: Performance ≥ 90 mobile, Accessibility ≥ 95, SEO 100
- [ ] LocalBusiness schema and Google Business Profile linked
- [ ] Domain cut over from Weebly with redirects for all old `.html` URLs

## 5. Out of scope for v1 (parking lot)

- Customer accounts and order history (we only need email-keyed records for the coupon)
- Full production-management backend (Printavo/DecoNetwork-style)
- Vehicle wraps, signage beyond banners
- "Ask Charly" AI chat assistant (the research files map components for it; strong v2 candidate)

## 6. Open questions for the owner

Track answers here. They block specific roadmap items. ✅ = answered (2026-11-23), ◐ = partial, ☐ = open.

1. ◐ Contact: **email CHARLYSCORNERSTORE@GMAIL.COM** ✅. Phone, address (or "by appointment"), hours, and socials (IG/FB/TikTok) are still open.
2. ◐ **Payments:** ✅ Square, his existing account (Logan, 2026-11-26). Still needed: a Square developer app under his account (access token + location ID), Apple Pay / Google Pay / Cash App Pay turned on for online checkout.
3. ☐ Real pricing rules for custom orders: per-garment base price, per-print-location upcharge, quantity breaks, rush fee? Also pricing for cards, flyers, stickers, lanyards, and pillows.
4. ◐ Blanks: **Gildan is always stocked** ✅, and they'll print on anything brought in or requested ✅. Still open: confirm the styles the builder now assumes (Gildan 5000 tee, 5400 long sleeve, 18500 hoodie, 2200 tank, 8800 polo; Bella+Canvas 3200 baseball tee; Richardson 112 trucker hat), which colors/combos he stocks of each, and the polo/tank color lists.
5. ✅ **Polo and Tank stay in the new builder** (6 garments total).
6. ✅ Coupon: **one per email, 1-year expiry, $30 minimum order.** Still open: does it apply to catalog items, custom orders, or both? (Default assumption: both.)
7. ☐ Turnaround times, shipping vs local pickup, minimum order quantities?
8. ◐ Temporary logo received (`Assets/Logo.png`) ✅. Fix the "Apperal" typo. Still need a vector logo plus photos of Charly the dog 🐶. Logan will supply better past-work photos for the portfolio.
9. ✅ One inbox for all notifications: **CHARLYSCORNERSTORE@GMAIL.COM**.
10. ◐ **Hosting:** owner is fine with a small monthly fee and already owns his domain ✅ (relayed by Logan). Planned host: Render, about $13/month. Still open: who has the login for his domain registrar/DNS, and does he approve opening the hosting account in his own name with his card? (Account email = his; add Logan as a team member if the plan allows.)
11. ☐ OK to show client work (logos on past jobs) in the online portfolio?
12. ☐ **Max print sizes** per location (the builder assumes Full Front/Back 12″ × 14″, hoodie front 12″ × 10″ above the pocket, Front Chest 10″ × 5″, Left Chest 4″ × 4″, sleeves 3.5″ wide, hat front 4″ × 2.25″). Can the press do bigger (oversized/jumbo prints, e.g. 14″ × 16″ or more)? Logan, 2026-11-25: the print box feels small.
13. ☐ **Performance shirts:** we use Gildan 42000 (tee) and 42400 (long sleeve), S–3XL. Gildan doesn't advertise a UPF rating for them: may the site say "UV protection"? If he stocks a UPF 50+ blank instead (or as well), which one? Youth/ladies versions wanted?
14. ✅ **Print methods:** he runs all of them in house: screen printing, DTF, DTG, embroidery, sublimation, heat-transfer vinyl (Logan, 2026-11-26).
