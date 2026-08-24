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

## @font-face

```css
@font-face {
  font-family: "Archivo";
  src: url("/fonts/archivo-carn.woff2") format("woff2-variations");
  font-weight: 400 900;
  font-stretch: 100% 125%;
  font-display: swap;
}
```

## Licence

Archivo is SIL Open Font License 1.1, with no Reserved Font Name. Subsetting, clamping, and modification are all permitted. Ship `OFL.txt` alongside it.

## Later: ArchivoSC

Archivo has no `smcp` table, so filenames use the compensated synthetic small-caps rule in the brand book. When the font pipeline is worth extending, build a real `smcp` into Archivo — the OFL permits it, and the CSS then collapses to `font-variant-caps: small-caps`. Not needed for the MLP.
