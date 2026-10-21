# Document Fonts & Provenance

## Font Assets
- `NotoSans-Regular.ttf`: Noto Sans Regular (Latin, Greek, Cyrillic), OFL 1.1.
- `NotoSans-Bold.ttf`: Noto Sans Bold (Latin, Greek, Cyrillic), OFL 1.1.
- `NotoSansArabic-Regular.ttf`: Noto Sans Arabic Regular (Arabic script + Latin fallbacks), OFL 1.1.
- `NotoSansArabic-Bold.ttf`: Noto Sans Arabic Bold (Arabic script + Latin fallbacks), OFL 1.1.
- `OFL.txt`: SIL Open Font License, Version 1.1 (Google Fonts / Noto project).

## Provenance
Downloaded from official Google Fonts Noto repository:
`https://github.com/googlefonts/noto-fonts/tree/main/hinted/ttf`

## Browser Contract Coordination Note
To maintain 1:1 visual parity across server PNG exports, email attachments, and browser preview/canvas:
1. Browser CSS uses font-family stack matching these exact bundled families:
   - Latin: `"Noto Sans", Arial, sans-serif`
   - Arabic: `"Noto Sans Arabic", Tahoma, Arial, sans-serif`
2. Server renderer uses the bundled TrueType `.ttf` files directly via FreeType/GD, eliminating dependency on unlicensed or inconsistent host OS fonts.
3. Coordinates and bounding widths match the calibrated 1774×887 booking ticket and 1122×1402 archive thank-you tag templates.
