# Design tokens — "Haldi & Ink"

Extracted from `Storefront AI — Mobile Screens.html` (board 17 + computed styles of every board; see `png/_tokens-raw.json`, `png/_frames/`). Names map 1:1 to the Tailwind `@theme` in `src/app/globals.css`.

## Neutrals
| Token | Hex | Use |
|---|---|---|
| `paper` | `#FBF7F1` | page background |
| `surface` | `#FFFFFF` | cards, sheets |
| `sand` | `#F1E9DE` | segmented-control background, skeletons |
| `line` | `#EADFD1` | borders, dividers |
| `line-input` | `#E3D6C6` | input borders |
| `muted` | `#6B5D50` | secondary text |
| `ink` | `#221A14` | primary text |
| `warn-bg` / `warn-ink` | `#FFF3C4` / `#6B4A00` | price warning, "Unpublished changes", save-link box |
| `scrim` | `#4A4038` | behind bottom sheets |
| `danger` | `#B00020` | field errors |

## Store accents (white text passes 4.5:1)
| Theme | Accent | Soft | Ink |
|---|---|---|---|
| saffron (brand default) | `#B4500A` | `#FCEBDD` | `#6E3106` |
| teal | `#0F766E` | `#DDF3F0` | `#0B4F4A` |
| plum | `#8E2C74` | `#F6E3EF` | `#5E1C4C` |
| indigo | `#3E46B5` | `#E4E6F9` | `#2A3080` |

App chrome (S1, S2, editor buttons) uses saffron; the public store and its preview use the store's theme. "Share on WhatsApp" / success check use teal.

## Format covers — 135° gradient, 28 px icon, 12 px caps label, ghost icon at 16 % opacity
| Format | From → To |
|---|---|
| ebook | `#B45309 → #78350F` |
| template_pack | `#BE185D → #831843` |
| recorded_course | `#4338CA → #312E81` |
| live_workshop | `#B91C1C → #7F1D1D` |
| cohort_course | `#047857 → #064E3B` |
| one_on_one | `#7E22CE → #4C1D95` |
| community | `#0369A1 → #0C4A6E` |

## Type
- Display: **Bricolage Grotesque 700** (headings, names, prices). Body: **Plus Jakarta Sans 400/600/700**.
- Scale: 3xl 32/1.1 · 2xl 28/1.15 · price 20–22 display · lg 18/1.3 (card title) · base 16/1.5 (inputs, CTAs — no iOS zoom) · sm 14/1.5 (summary, labels) · xs 12 caps (format label, section labels).

## Spacing (4 px base)
1·4 · 2·8 (chip gap) · 3·12 · 4·16 (card padding, card gap) · 5·20 (screen gutter) · 6·24 (form field gap) · 8·32 (section gap).
Tap targets: min-h 44 · CTAs 52–56 · inputs 48.

## Radius & shadow
md 10–12 inputs · lg 14–16 buttons · xl 20 cards · 2xl 24 sheet top · full chips/badges.
Card shadow: `0 1px 2px rgba(34,26,20,.04), 0 8px 24px rgba(34,26,20,.06)`.

## Formatting
Prices: `Intl.NumberFormat('en-IN')` → ₹1,999 · ₹99,999.

## Screens (rendered references in `png/`)
01 S1 input · 02–03 S2 generating (+ slow) · 04 S2b direction · 05 S2c unclear · 06 S2c retry · 07–08 S3 editor (top, Why ₹ open, regenerating overlay) · 09 product edit sheet · 10 D7 rejected alternative · 11 editor desktop 1440 with side panel · 12–13 S4 publish steps · 14 S5 public store · 15 S6 not found · 16 S5 desktop 1440 · 17 tokens + covers.

Where the design's copy differs from SPEC.md (e.g. "Publish with/without WhatsApp"), the build follows SPEC.md.
