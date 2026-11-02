# Fonts

- **Averia Serif Libre** — every word on the dive (`/mobile`), all at 12px. Loaded from Google
  Fonts through `next/font` in `app/mobile/page.tsx`, so there are no files here.
- **TeX Gyre Termes** (`texgyretermes-*.otf`) — headings on the other pages. Free under the GUST
  Font License; downloaded from CTAN: https://ctan.org/pkg/tex-gyre-termes
- **Helvetica** — body text everywhere else. A system font, so there are no files here; it's set as
  `--font-body` in `app/globals.css`, falling back to Arial where Helvetica isn't installed.
