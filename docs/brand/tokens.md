# Leadway Health — Brand Tokens

Source: `docs/brand/leadway-mini-manual.pdf`
("De Novo. Leadway Health Style Guide — Mini Edition", CorelDRAW, 2021‑02‑24).

Only values explicitly present in the Mini Manual are recorded here. Anything
marked **NOT IN PDF — ASK** must be confirmed by the client before it is
baked into `tailwind.config.ts` / CSS variables.

---

## 1. Colour Palette

The Mini Manual describes **three primary colours** plus **supporting
(secondary) colours**, all originating from the mother brand (Assurance).
Codes are supplied in HEX / RGB / CMYK.

> Usage rules (verbatim from manual):
> - **RGB** — all PDF documents, online materials, web applications, stationery.
> - **CMYK** — external print marketing / publications.
> - **HEX** — digital touchpoints & interfaces.
> - "To maintain consistency and brand recognition, these colours should be the lead colours in all applications."

### 1.1 Primary

| Token name              | HEX       | RGB             | CMYK             | Notes                  |
| ----------------------- | --------- | --------------- | ---------------- | ---------------------- |
| `brand.orange` (sunset) | `#F15A24` | 241 · 90 · 36   | 0-80-97-0        | Camel-sunset orange    |
| `brand.red`             | `#C61531` | 198 · 21 · 49   | 15-100-100-7     | "Leadway Red" – wordmark & accent |
| `brand.charcoal`        | `#262626` | 38 · 38 · 38    | 71-65-64-69      | Near‑black body text   |

### 1.2 Supporting

| Token name        | HEX       | RGB              | CMYK             |
| ----------------- | --------- | ---------------- | ---------------- |
| `brand.yellow`    | `#FCEE21` | 252 · 238 · 33   | 5-0-93-0         |
| `brand.grey`      | `#808080` | 128 · 128 · 128  | 52-43-43-8       |
| `brand.greyLight` | `#E6E6E6` | 230 · 230 · 230  | 8-6-7-0          |
| `brand.navy`      | `#1B1464` | 27 · 20 · 100    | 100-100-26-24    |
| `brand.sky`       | `#29ABE2` | 41 · 171 · 226   | 70-15-0-0        |

### 1.3 Semantic state colours (derived — **NOT IN PDF, ASK**)

The Mini Manual does not specify success / warning / error / info hues for
UI. Proposed derivations (pending approval):

| Semantic role | Proposed HEX | Derived from            |
| ------------- | ------------ | ----------------------- |
| success       | TBC          | (not supplied)          |
| warning       | `#FCEE21` ?  | brand.yellow            |
| danger/error  | `#C61531` ?  | brand.red (also primary) |
| info          | `#29ABE2` ?  | brand.sky               |

> **Ask client**: semantic palette (success / warning / error / info) and
> whether red may double as both brand accent *and* destructive state.

---

## 2. Typography

### 2.1 Families

The manual mandates a **proprietary "Leadway" font family**:

> "All Leadway communication should use the Leadway Font family. This unique
> font is specially designed for the brand with over 9,000 custom characters."

> "1 Family. 13 Members. 9,000+ Glyphs."

Members listed in the manual:

- Leadway Thin / Thin Italic
- Leadway Light / Light Italic
- Leadway Book / Book Italic   ← **body default**
- Leadway Regular Medium / Regular Medium Italic
- Leadway Bold / Bold Italic
- Leadway Heavy / Heavy Italic
- Leadway Black

Roles (verbatim):

- "The body font is the Leadway Book variant."
- "Bold can be used for headlines. The heavy variants for billboards and other OOH materials."

### 2.2 Web fallback — **NOT IN PDF, ASK**

The Leadway font is proprietary and not supplied with web‑licensed `.woff2`
files in the Mini Manual. Before implementation we need:

- A web‑licensed copy of the font (hosted under `/public/fonts/`), OR
- An approved fallback stack.

Proposed fallback stack (pending approval):

```
font-family:
  "Leadway", /* if licensed webfont provided */
  "Inter", system-ui, -apple-system, "Segoe UI", Roboto, Arial,
  sans-serif;
```

### 2.3 Sizes, line-heights, letter-spacing — **NOT IN PDF**

Type scale, heading sizes, line-heights and tracking are **not specified**
in the Mini Manual. We will adopt a conservative modular scale unless the
client supplies one:

| Token        | Size (rem) | Line-height | Weight        | Usage            |
| ------------ | ---------- | ----------- | ------------- | ---------------- |
| `display`    | 3.0        | 1.1         | Bold / Heavy  | Hero only        |
| `h1`         | 2.25       | 1.15        | Bold          | Page title       |
| `h2`         | 1.75       | 1.2         | Bold          | Section          |
| `h3`         | 1.375      | 1.3         | Medium        | Subsection       |
| `body-lg`    | 1.125      | 1.55        | Book          | Body large       |
| `body`       | 1.0        | 1.55        | Book          | Default          |
| `body-sm`    | 0.875      | 1.5         | Book          | Small / captions |
| `caption`    | 0.75       | 1.4         | Book          | Footnotes        |

> **Ask client**: confirm/override this scale; any required letter-spacing.

---

## 3. Spacing scale — **NOT IN PDF, ASK**

Not specified. Proposed 4px baseline (Tailwind default):
`0, 1, 2, 3, 4, 6, 8, 12, 16, 24` × 4px. Confirm.

## 4. Radius — **NOT IN PDF, ASK**

Logo roundel is circular; otherwise silent. Proposed defaults:

| Token     | Value |
| --------- | ----- |
| `sm`      | 4px   |
| `md`      | 8px   |
| `lg`      | 12px  |
| `xl`      | 16px  |
| `pill`    | 9999px|
| `circle`  | 50%   |

Confirm preferred default for form inputs, buttons, cards.

## 5. Shadows / elevation — **NOT IN PDF, ASK**

Not specified. Proposed subtle 3-step elevation (sm/md/lg). Confirm.

## 6. Button styles — **NOT IN PDF, ASK**

Not specified. Proposed variants (all pending confirmation):

- **Primary** — background `brand.red` (#C61531), text white, hover 8% darken.
- **Secondary** — background `brand.charcoal`, text white.
- **Outline** — transparent bg, border `brand.charcoal`, text `brand.charcoal`.
- **Ghost** — transparent bg, text `brand.red`, hover tint.
- **Destructive** — background `brand.red` (same as primary ⇒ need separate token).

> **Ask client**: is **red** the primary CTA colour, or is **orange** the
> action colour and red reserved for brand accents / errors only? The
> manual does not state this explicitly.

---

## 7. Logo usage

From page 3:

- Wordmark: "LEADWAY" set in heavy/black weight in **`brand.charcoal`**,
  with "Health" set in **`brand.red`** underneath, followed by a small
  heart-with-heartbeat pictogram (also red).
- Symbol: black roundel containing a camel silhouette on an orange→yellow
  sunset gradient (`brand.orange → brand.yellow`).
- Lockups shown: symbol-left + wordmark-right (primary), symbol‑only,
  and white-on-red reversed use (e.g. campaign back cover).

> The Mini Manual does **not** state minimum clear-space, minimum size,
> or incorrect-use rules. **Ask client** for the full brand book if these
> are needed for print or co‑branded surfaces.

Locally stored:

- `public/brand/leadway-logo.png` — the supplied lockup (JPEG payload, `.png`
  extension retained per spec). Recommend replacing with a true transparent
  PNG **or** SVG from the client for production.

---

## 8. Tone of voice — **PARTIAL**

The manual does not include explicit tone-of-voice rules. It does show
campaign copy examples (pages 8–10) from which we can infer tone:

- "Nobody understands pregnancy care like we do."
- "Healthcare you can feel."
- "Our opinions are never out of sight."
- "World-class care is just a dial away."
- "Healthcare for senior citizens."
- "Even the tiny details are never left out."
- Closing line (page 11): "For health, wealth & more…"

Inferred voice: **warm, reassuring, benefit-led, plain-spoken, quietly
confident**. Short sentences. First-person plural ("we") when the brand
speaks. No jargon.

> **Ask client** for a formal tone-of-voice reference before writing
> transactional/email copy.

---

## 9. Open items (client sign-off required)

1. Semantic colour tokens (success/warning/error/info).
2. Confirm primary-CTA colour (red vs. orange) and destructive-state colour.
3. Web‑licensed Leadway font files (or approved fallback stack).
4. Type scale, line-heights, letter-spacing.
5. Spacing scale.
6. Border radii defaults.
7. Elevation / shadow ramp.
8. Button variant specification.
9. Tone-of-voice guide + transactional copy templates (OTP SMS / email,
   security alert email, lockout notice, success confirmation).
10. A vector (SVG) copy of the logo lockup + symbol mark.
