# Desktop layout export

Run from the project root:

```powershell
python tools-layout/extract_layouts.py
```

The tool reads Java page sources under `upstream/BCU-java-PC` and public UI
properties from the supplied `BCU` installation. It writes only
`web/data/layouts.json` and `web/data/locales.json`. Java is not needed to run
the browser application.

`layouts.json` preserves the desktop's 2300 × 1300 reference coordinate system.
Its `pages` object is keyed by Java class name. Each page has:

- `parent`: Java superclass for inherited layout declarations.
- `source`: source path for reviewing the original layout.
- `widgets`: fields declared in this class. `text` is the English desktop
  label; `section` and `localeKey` resolve other languages. Scroll panes have
  a `child` field identifying the list/table they wrap.
- `placements`: all source `set(widget,x,y,l,t,w,h)` calls from `resized()`.
  Each records `id`, `bounds`, `conditions` and the original one-based `line`.
  Unresolved bounds have `null` entries plus `boundsExpressions`.
- `resolvedWidgets`: parent fields merged with this class's fields.
- `defaultPlacements`: inherited, statically resolved placement mapping for
  default viewer state (`larges=false`) and data filter state (`show=true`).

Simple local coordinate constants and fixed numeric loops are evaluated.
For example, the configuration controls `left[0]` through `left[3]` have
individual bounds, and pack editor columns retain their original positions.
Conditional placements remain available when toggles change at runtime.

`locales.json` is keyed by locale code, then resource section (`page`, `info`,
`internet`, `util`), then property key. Each locale includes the supplied
desktop JAR's bundled fallback values and overrides from the installed locale
folder. The desktop lookup returns the key itself when no value exists.

This is layout metadata, not a Swing emulator or a behavior port. Dynamic
table dimensions, widget event handlers and drawing code require their
corresponding browser implementations. Current upstream sources may differ
from the supplied desktop runtime on screens outside the verified main/viewer
baseline.
