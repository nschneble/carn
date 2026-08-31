# Fonts

Every byte figure below is a compressed woff2 as shipped, never a raw table size. Glyph and codepoint deltas don't reconcile to byte deltas by arithmetic; brotli decides. `test/contract/fonts-budget.contract.ts` measures the shipped files and fails if a figure here drifts out of date.

## carn-sans.woff2

Archivo 2.001, renamed to **Carn Sans**, axis-clamped and subset for Càrn. Self-hosted; not loaded from a CDN.

- **54,612 B**, 286 glyphs of the upstream's 834, and 212 mapped codepoints
- Axes: `wght` 400–900, `wdth` 100–125 (clamped from 100–900 / 62–125; the trimmed ranges are unused by the design and cost ~27 KB)
- Unicode: Latin-1 + typographic punctuation, arrows, currency
- OpenType features kept: `case` (lifts `. - /` to cap alignment — required by the small-caps rule), `kern`, `tnum` (tabular numerals for the age column), `ccmp`, `locl`, `liga`, `frac`, `zero`
- Cap height 686, constant across the whole wght × wdth space, which is what makes the small-caps compensation arithmetic clean

Regenerate:

```sh
curl -sfL -o Archivo.ttf \
  "https://raw.githubusercontent.com/google/fonts/main/ofl/archivo/Archivo%5Bwdth%2Cwght%5D.ttf"

fonttools varLib.instancer Archivo.ttf wght=400:900 wdth=100:125 -o Archivo-clamped.ttf

python - <<'EOF'
from fontTools.ttLib import TTFont

upstream = TTFont("Archivo.ttf", lazy=True)["head"].modified
f = TTFont("Archivo-clamped.ttf", recalcTimestamp=False)
f["head"].modified = upstream
f["OS/2"].achVendID = "NSCH"
n = f["name"]
n.setName("Carn Sans SemiBold", 1, 3, 1, 0x409)
n.setName("2.001;NSCH;CarnSans-SemiBold", 3, 3, 1, 0x409)
n.setName("Carn Sans SemiBold", 4, 3, 1, 0x409)
n.setName("CarnSans-SemiBold", 6, 3, 1, 0x409)
n.setName(
    "Carn Sans is an axis-clamped, subset build of Archivo 2.001 and is "
    "not the original font.",
    10, 3, 1, 0x409,
)
n.setName("Carn Sans", 16, 3, 1, 0x409)
n.setName("SemiBold", 17, 3, 1, 0x409)
for record in n.names:
    if record.nameID >= 256:
        record.string = str(record).replace("Archivo", "CarnSans")
f.save("renamed-sans.ttf")
EOF

pyftsubset renamed-sans.ttf \
  --output-file=carn-sans.woff2 --flavor=woff2 \
  --unicodes="U+0020-007E,U+00A0-00FF,U+2010-2015,U+2018-201D,U+2026,U+2032,U+2039-203A,U+2044,U+20AC,U+2122,U+2190-2193" \
  --layout-features+=case,tnum,lnum,zero --name-IDs+=7,8,9,10,11,12,13,14 --no-hinting
```

Note `--layout-features+=` with the `+`. Using `=` wipes every default feature and leaves an empty GSUB table.

The rename runs **after the clamp and before the subset**, and rewrites `name` IDs 1, 3, 4, 6, 10, 16, and 17; the family, unique, full, and PostScript names inside the binary. Before the clamp wouldn't stick: `varLib.instancer` prunes and rewrites the name table to reflect the new default instance, which is why the upstream family reads `Archivo SemiBold` here rather than `Archivo`. Only the name changes; the record structure is upstream's, so ID 1 keeps the default instance's weight the way upstream does. IDs 16 and 17 don't survive the subset, because `--name-IDs` doesn't list them.

The loop that follows catches the six `fvar` instance PostScript names, at IDs 270–275 here. A fixed list of IDs would be the wrong shape: `fvar` allocates them, so which IDs they land on is an artifact of the upstream build. **Scoping the loop to IDs ≥ 256 is what protects attribution.** Copyright, trademark, foundry, designer, vendor URL, and license are IDs 0, 7, 8, 9, 11, and 13, and a range excludes them structurally. The range is also complete: `fvar` may point `subfamilyNameID` at 2 or 17 and `postScriptNameID` at 6, but only for the default instance, and all three are rewritten by the `setName` calls above. Every other reference must be above 255.

The upstream prefix is `ArchivoRoman`, not `Archivo`, so the instances become `CarnSansRoman-*` and stay distinct from ID 6 the way upstream keeps them distinct.

**The compound style names stay CamelCase — `SemiBold`, `ExtraBold`, `SemiExpanded` — and that is a decision, not an oversight.** Only five of the thirteen strings carrying a style name are written by hand above. The rest are upstream's: `SemiBold` and `ExtraBold` at IDs 263 and 265, their PostScript twins at 272 and 274, and `SemiExpanded` at 280. The loop replaces `Archivo` with `CarnSans` and nothing else, so the weight word passes straight through. Re-casing the five by hand therefore ships a font that disagrees with itself — family `Carn Sans Semibold` against instance `SemiBold` and PostScript `CarnSansRoman-SemiBold`, and that last one is a `postscriptNameID`, which is what a PDF embeds when it picks the 600 instance.

Changing the casing is a thirteen-string change and a rebuild from upstream Archivo 2.001, not a copy edit — and the rule has to reach `Semiexpanded` too, or it is not a rule. `test/contract/fonts.contract.ts` asserts these strings against the shipped binary, so the test is the thing that notices; do not edit it to agree with a recipe the binary does not match.

`--name-IDs+=` carries the Archivo Project Authors' trademark, foundry, designer, description, and license records through the subset. The pyftsubset default keeps IDs 0–6 and drops all of them. They cost 176 B.

`recalcTimestamp=False` alone is not enough here. `varLib.instancer` re-stamps `head.modified` itself and has no flag to stop it, so the rename step copies the value back from the pinned upstream `Archivo.ttf`. Without both, two clean runs of this recipe produce different bytes. Same rule as the fixture repo's pinned commit dates.

## carn-mono-400.woff2, carn-mono-500.woff2

IBM Plex Mono 2.3, renamed to **Carn Mono** and subset for Càrn. Self-hosted; not loaded from a CDN.

- **8,816 B** at 400 and **8,880 B** at 500, 256 glyphs and 209 mapped codepoints each
- Two static files, not one variable file; Plex Mono ships per weight and has no `wght` axis, and so no `fvar` table and no `name` record above ID 255 for the sans face's rename loop to reach
- Unicode: the same `--unicodes=` request as Carn Sans, less three codepoints Plex Mono has no glyph for (see the delta below)
- OpenType features kept: `dnom`, `frac`, `numr`, `zero` (slashed zero, kept to match Carn Sans's recipe; nothing in `BRAND.md` enables it yet)
- GPOS drops to nothing: the subset range has no combining marks for `mark` to position, and a monospace face has no kerning to keep
- No `tnum` and no `case`, because Plex Mono has neither. Every digit in a monospace face is already one advance width, so `font-variant-numeric: tabular-nums` on `.row .age` is a harmless no-op. `--layout-features+=tnum` would be silently ignored (don't add it)

### Coverage delta against Carn Sans

U+2010 HYPHEN, U+2011 NON-BREAKING HYPHEN, and U+2015 HORIZONTAL BAR are in the requested range and in `carn-sans.woff2`, but IBM Plex Mono has no glyph for any of them. No `--unicodes=` value recovers them; the upstream simply lacks the outlines.

This is accepted and recorded. None of the three reaches the mono face in practice. With `typographer` off, markdown-it generates no dash characters at all. `--` and `---` pass through as ASCII, and only an authored U+2013 or U+2014 renders as one, both of which are in Plex. So all three gaps need someone to type the codepoint deliberately: U+2011 is a non-breaking hyphen almost nobody reaches for, U+2015 is Greek and European quotation typography, and U+2010 is a character that looks identical to the standard ASCII hyphen.

Carn Sans is itself missing U+2012 and U+201B from the same request, so the two shipped ranges are 212 and 209 codepoints against a 214-codepoint ask.

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
        "Carn Mono is a subset build of IBM Plex Mono 2.3 and is not the "
        "original font.",
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

The rename runs **before** the subset and rewrites `name` IDs 1, 3, 4, 6, 10, 16, and 17; the family, unique, full, and PostScript names inside the binary. That's the whole point; (see the license note). IDs 16 and 17 don't survive the subset, because `--name-IDs` doesn't list them; ID 1 carries `Carn Mono` and `Carn Mono Medium` on its own. Setting them keeps the intermediate `renamed-*.ttf` free of the reserved name too.

`--name-IDs+=` carries IBM's copyright, trademark, designer, foundry, and license records through the subset. The pyftsubset default keeps IDs 0–6 and would drop all of them.

`recalcTimestamp=False` is what makes the recipe reproduce byte-for-byte. Without it fontTools stamps `head.modified` with the time of the run, and the two committed files come out a few bytes different every time. Same rule as the fixture repo's pinned commit dates.

## Description (name ID 10)

Both faces carry one sentence, and it says the same three things in the same order: the source family and its version, what this build did to it, and that it's not the original.

> Carn Sans is an axis-clamped, subset build of Archivo 2.001 and is not the original font.
>
> Carn Mono is a subset build of IBM Plex Mono 2.3 and is not the original font.

Neither restates copyright or license. Those are IDs 0 and 13, verbatim from upstream, and a second copy in ID 10 is two records that can drift apart. Only the sans is "axis-clamped": Plex Mono ships static, so the mono faces are subset and nothing else.

The histories differ even though the fix doesn't. Plex Mono 2.3 carries no ID 10 at all – its `name` table runs 0–9, 11–14, 19 – so the mono record is one this build adds. Archivo 2.001 does carry one, a 205-character description of the typeface that survives the clamp and the subset, so the sans record is one this build rewrites.

Every ID 10 ships inside the woff2 and counts against the page budget.

## @font-face

```css
@font-face {
  font-family: "Carn Sans";
  src: url("/fonts/carn-sans.woff2") format("woff2-variations");
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

## License

Archivo is SIL Open Font License 1.1, with no Reserved Font Name. Subsetting, clamping, and modification are all permitted, and so is keeping the name. Ship `OFL.txt` alongside it.

IBM Plex Mono is also OFL 1.1, but it declares a Reserved Font Name: `Copyright © 2017 IBM Corp. with Reserved Font Name "Plex"`. Ship `OFL-plex.txt` alongside it; that's IBM's license text, verbatim and distinct from Archivo's `OFL.txt`.

The RFN is why the face is called Carn Mono. Per the OFL FAQ, subsetting a webfont is modification (2.6), and a Modified Version keeps an RFN only if it preserves Functional Equivalence, whose first requirement is the same full character inventory (2.7, 2.8). This subset goes from 930 mapped codepoints to 209, so it falls short and must pick its own name. The escape hatch in FAQ 2.2.1 — WOFF2-compress the original, change nothing else, keep the name — costs 79,328 B for the pair against 17,696 B subset. With the sans face that is 133,940 B, so it blows the 100 KB page budget on fonts alone. Renaming is the only route that ships.

**Carn Sans is a choice, not an obligation.** Archivo's license would let the subset keep the name. It doesn't, because the pair can only be made consistent in this direction (the mono face has no option) and because 286 glyphs of 834 with two clamped axes is not what Omnibus-Type published. A reader who sees `Carn Sans` and `Carn Mono` in `--f-display` and `--f-mono` gets one true story about what the browser loads.

Only the names change. Attribution stays loud in both directions: both `OFL.txt` files are verbatim, and both binaries carry their upstream's copyright, trademark, designer, and license records in their own `name` tables.

### Splicing smcp into Carn Sans is permitted

OFL 1.1 permits modification, so building a real `smcp` feature into Carn Sans is allowed. The grant paragraph is explicit – "use, study, copy, merge, embed, modify, redistribute" – and two conditions apply. The derivative must itself be distributed under OFL and under no other license (condition 5), and the copyright notice and license text must travel with it (condition 2), which is why `name` IDs 0 and 13 are carried through untouched.

Archivo carries no Reserved Font Name. That's not what permits the splice; it would only have permitted keeping the name Archivo, which this project declined to do. Condition 3 governs what a Modified Version may be named, not whether it may be modified.

If any `smcp` glyphs come from a source other than Archivo, they arrive with their own license and condition 5 governs the combined result: the merged face has to ship entirely under OFL, so an incoming outline that cannot be redistributed that way cannot go in.

## TODO: Small caps inside Carn Sans

Carn Sans has no `smcp` table, so filenames use the compensated synthetic small-caps rule in the brand book. When the font pipeline is worth extending, draw the caps and merge `smcp` and `c2sc` into this face.

Inside the face there's no extra `@font-face`, no extra file, and no extra request on the critical path, and the CSS collapses to `font-variant-caps: small-caps` with no `font-family` override on every small-caps run. A separate family buys none of that. Small caps are used in exactly one style today – `.t-item`, `wght` 700 and `wdth` 110 – so the drawn glyphs can be static, with no `gvar` deltas across the axis space, and the build costs the same either way.

A reason to change this is if the added glyphs and lookups ever measure larger on the page than a standalone file would cost on the routes that actually set small caps.
