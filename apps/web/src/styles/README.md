Wiki reading surface
====================

`wiki-material.css` is generated from Material for MkDocs **9.8.1**, the version
served by the reference site. Its MIT license is retained alongside the file.
The generator scopes reading, navigation, code and palette rules to
`.wiki-material`. It preserves upstream selectors and transitions; `rem` values
use `--wiki-unit` so the host header and footer retain their own root font size.
The unit follows upstream's 20 / 22 / 24px viewport breakpoints.

`wiki-material-reset.css` restores the upstream browser defaults which the
host site's reset overrides. `WikiPage.css` contains application integration
(header height, responsive entry buttons, metadata, search and editor styles).
Roboto and Roboto Mono are served locally under `public/fonts/wiki/`, with
both OFL licenses included. No font service is required at runtime.

From the repository root:

```sh
node tools/update-wiki-material.mjs
node --import tsx tools/wiki-examples.mjs
npm run build
npm run test:wiki:ui
```

The examples command explicitly seeds the local `data.db` (or a database path
passed as its first argument). It is idempotent and does not alter existing
articles. It never runs during server startup or production migrations.

For an independent computed-style and raster comparison, start the local app
and the Material reference site, then run:

```sh
node tests/wiki-material-reference.mjs \
  http://localhost:5173 \
  http://localhost:8000/jottings/legacy/the-top-3-myths-busted-about-llm/
```

This compares identical reading markup against upstream in both themes at six
viewport sizes, including hover states, navigation styling and transition
parameters. It writes screenshots and `comparison.json` to
`output/playwright/wiki-material/`. The global header and footer are excluded
from this comparison; their shared site rendering is checked by `wiki-ui.mjs`.
