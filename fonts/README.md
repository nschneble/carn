# Fonts

## archivo-carn.woff2

Archivo variable, subset and axis-clamped for Càrn. Self-hosted — not loaded from a CDN.

- **54 KB**, 286 glyphs
- Axes: `wght` 400–900, `wdth` 100–125 (clamped from 100–900 / 62–125; the trimmed ranges are unused by the design and cost ~27 KB)
- Unicode: Latin-1 + typographic punctuation, arrows, currency
- OpenType features kept: `case` (lifts `. - /` to cap alignment — required by the small-caps rule), `kern`, `tnum` (tabular numerals for the age column), `ccmp`, `locl`, `liga`, `frac`, `zero`
- Cap height 686, constant across the whole wght × wdth space, which is what makes the small-caps compensation arithmetic clean

Regenerate:

```sh
curl -sfL -o Archivo.ttf \
  "https://raw.githubusercontent.com/google/fonts/main/ofl/archivo/Archivo%5Bwdth%2Cwght%5D.ttf"

fonttools varLib.instancer Archivo.ttf wght=400:900 wdth=100:125 -o Archivo-clamped.ttf

pyftsubset Archivo-clamped.ttf \
  --output-file=archivo-carn.woff2 --flavor=woff2 \
  --unicodes="U+0020-007E,U+00A0-00FF,U+2010-2015,U+2018-201D,U+2026,U+2032,U+2039-203A,U+2044,U+20AC,U+2122,U+2190-2193" \
  --layout-features+=case,tnum,lnum,zero --no-hinting
```

Note `--layout-features+=` with the `+`. Using `=` wipes every default feature and leaves an empty GSUB table.

## carn-mono-400.woff2, carn-mono-500.woff2

IBM Plex Mono 2.3, renamed to **Carn Mono** and subset for Càrn. Self-hosted — not loaded from a CDN.

- **8,876 B** at 400 and **8,896 B** at 500, 256 glyphs and 209 mapped codepoints each
- Two static files, not one variable file — Plex Mono ships per weight and has no `wght` axis
- Unicode: the same `--unicodes=` request as Archivo, less three codepoints Plex Mono has no glyph for — see the delta below
- OpenType features kept: `dnom`, `frac`, `numr`, `zero` (slashed zero, kept to match Archivo's recipe; nothing in `BRAND.md` enables it yet)
- GPOS drops to nothing, which is correct here: the subset range has no combining marks for `mark` to position, and a monospace face has no kerning to keep
- No `tnum` and no `case`, because Plex Mono has neither. Every digit in a monospace face is already one advance width, so `font-variant-numeric: tabular-nums` on `.row .age` is a harmless no-op. `--layout-features+=tnum` would be silently ignored — don't add it

### Coverage delta against Archivo

U+2010 HYPHEN, U+2011 NON-BREAKING HYPHEN, and U+2015 HORIZONTAL BAR are in the requested range and in `archivo-carn.woff2`, but IBM Plex Mono has no glyph for any of them. No `--unicodes=` value recovers them; the upstream simply lacks the outlines.

This is accepted and recorded, not worked around. None of the three reaches the mono face in practice. With `typographer` off, markdown-it generates no dash characters at all — `--` and `---` pass through as ASCII, and only an authored U+2013 or U+2014 renders as one, both of which are in Plex. So all three gaps need someone to type the codepoint deliberately: U+2011 is a non-breaking hyphen almost nobody reaches for, U+2015 is Greek and European quotation typography, and U+2010 is a character that looks identical to the ASCII hyphen sitting on the keyboard.

Archivo is itself missing U+2012 and U+201B from the same request, so the two shipped ranges are 212 and 209 codepoints against a 214-codepoint ask.

Regenerate:

```sh
curl -sfL -o IBMPlexMono-Regular.ttf \
  "https://raw.githubusercontent.com/google/fonts/main/ofl/ibmplexmono/IBMPlexMono-Regular.ttf"
curl -sfL -o IBMPlexMono-Medium.ttf \
  "https://raw.githubusercontent.com/google/fonts/main/ofl/ibmplexmono/IBMPlexMono-Medium.ttf"

python - <<'EOF'
from fontTools.ttLib import TTFont

for weight in ("Regular", "Medium"):
    f = TTFont(f"IBMPlexMono-{weight}.ttf", recalcTimestamp=False)
    f["OS/2"].achVendID = "NSCH"
    n = f["name"]
    full = "Carn Mono" if weight == "Regular" else f"Carn Mono {weight}"
    n.setName(full, 1, 3, 1, 0x409)
    n.setName("Regular", 2, 3, 1, 0x409)
    n.setName(f"2.3;NSCH;CarnMono-{weight}", 3, 3, 1, 0x409)
    n.setName(full, 4, 3, 1, 0x409)
    n.setName(f"CarnMono-{weight}", 6, 3, 1, 0x409)
    n.setName(
        "Carn Mono is a Latin subset of IBM Plex Mono 2.3, renamed because "
        'the OFL reserves the font name "Plex".',
        10, 3, 1, 0x409,
    )
    n.setName("Carn Mono", 16, 3, 1, 0x409)
    n.setName(weight, 17, 3, 1, 0x409)
    f.save(f"renamed-{weight}.ttf")
EOF

for pair in Regular:400 Medium:500; do
  pyftsubset "renamed-${pair%%:*}.ttf" \
    --output-file="carn-mono-${pair##*:}.woff2" --flavor=woff2 \
    --unicodes="U+0020-007E,U+00A0-00FF,U+2010-2015,U+2018-201D,U+2026,U+2032,U+2039-203A,U+2044,U+20AC,U+2122,U+2190-2193" \
    --layout-features+=zero --name-IDs+=7,8,9,10,11,12,13,14 --no-hinting
done
```

The rename runs **before** the subset and rewrites `name` IDs 1, 3, 4, 6, 16, and 17 — the family, unique, full, and PostScript names inside the binary, not just the output filename. That is the whole point; see the licence note. IDs 16 and 17 don't survive the subset, because `--name-IDs` doesn't list them; ID 1 carries `Carn Mono` and `Carn Mono Medium` on its own, which is the naming a Medium weight needs anyway. Setting them keeps the intermediate `renamed-*.ttf` free of the reserved name too.

`--name-IDs+=` carries IBM's copyright, trademark, designer, foundry, and licence records through the subset. The pyftsubset default keeps IDs 0–6 and would drop all of them.

`recalcTimestamp=False` is what makes the recipe reproduce byte-for-byte. Without it fontTools stamps `head.modified` with the time of the run, and the two committed files come out a few bytes different every time for no reason a reader could check. Same rule as the fixture repo's pinned commit dates.

## @font-face

```css
@font-face {
  font-family: "Archivo";
  src: url("/fonts/archivo-carn.woff2") format("woff2-variations");
  font-weight: 400 900;
  font-stretch: 100% 125%;
  font-display: swap;
}

@font-face {
  font-family: "Carn Mono";
  src: url("/fonts/carn-mono-400.woff2") format("woff2");
  font-weight: 400;
  font-display: swap;
}

@font-face {
  font-family: "Carn Mono";
  src: url("/fonts/carn-mono-500.woff2") format("woff2");
  font-weight: 500;
  font-display: swap;
}
```

## Licence

Archivo is SIL Open Font License 1.1, with no Reserved Font Name. Subsetting, clamping, and modification are all permitted. Ship `OFL.txt` alongside it.

IBM Plex Mono is also OFL 1.1, but it declares a Reserved Font Name: `Copyright © 2017 IBM Corp. with Reserved Font Name "Plex"`. Ship `OFL-plex.txt` alongside it — that is IBM's licence text, verbatim and distinct from Archivo's `OFL.txt`.

The RFN is why the face is called Carn Mono. Per the OFL FAQ, subsetting a webfont **is** modification (2.6), and a Modified Version keeps an RFN only if it preserves Functional Equivalence, whose first requirement is the same full character inventory (2.7, 2.8). This subset goes from 930 mapped codepoints to 209, so it falls short and must pick its own name. The escape hatch in FAQ 2.2.1 — WOFF2-compress the original, change nothing else, keep the name — costs 79,328 B for the pair against 17,772 B subset. With Archivo that is 133,820 B, so it blows the 100 KB page budget on fonts alone. Renaming is the only route that ships.

Only the name changes. Attribution stays loud in both directions: `OFL-plex.txt` is verbatim with IBM's copyright and RFN notice intact, and the binaries carry IBM's copyright, trademark, and designer credits in their own `name` tables.

## Later: ArchivoSC

Archivo has no `smcp` table, so filenames use the compensated synthetic small-caps rule in the brand book. When the font pipeline is worth extending, build a real `smcp` into Archivo — the OFL permits it, and the CSS then collapses to `font-variant-caps: small-caps`. Not needed for the MLP.
