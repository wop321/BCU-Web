# Offline BCU asset export

Run from PowerShell with the supplied installation still in `BCU/`:

```powershell
.\tools\export-assets.ps1
```

Requirements: JDK 21 (or a compatible JDK), Python 3, and the supplied desktop JAR plus `BCU_lib/`. Alternative locations:

```powershell
.\tools\export-assets.ps1 -Installation 'D:\path\BCU' -Output 'D:\path\web'
```

The exporter uses the supplied application's original `AssetLoader`, `PackData.DefPack`, model/animation classes, and AWT image implementation in headless mode. It does **not** start BCU, run its updater, save user preferences, or modify its installation. It reads the original encrypted archives through BCU's own reader and writes browser assets outside the installation. Browser files are copied lazily by content length on repeated exports.

`ExportBcu.java` produces:

- `web/data/catalog.json`: units/forms, base stats, talent-max stats, growth curves, desktop list display stats, enemies, collection/map/stage hierarchy, actual spawn lines, backgrounds, castles, effects, souls, and audio catalog.
- `web/data/resources.json`: manifest of all original virtual resources.
- `web/assets/org/`: all 38,250 original virtual resources, including PNGs, CSVs, models, image cuts, timelines, and original game UI sprites.
- `web/assets/icons/`: unit slots and enemy icons cropped by BCU's original `VImg` logic.
- `web/assets/effects/`: original effect models, image cuts, animation files, and images materialized after BCU's recoloring/reversal logic.
- `web/assets/music/`, `fonts/`, and `lang/`: installed audio, font and locale data.

`engine_manifest.py` additionally produces `web/data/engine-assets.json`. Its `entries` array has the complete original virtual paths (`./org/...`), browser URLs (`assets/org/...`), byte sizes, PNG dimensions, and UTF-8 text payloads. Image/audio payloads stay in separate files for lazy browser loading. Unknown binary data remains URL-addressable.

Catalog form `display` matches the original `UnitListTable.get` calculations: preferred level 50 capped by the unit's maximum, `Form.maxu()` for talent-max data, original `UnitLevel.getMult`, default maximum treasures from `BasisSet.current()`, and no lineup combos. `display.level` reports the actual capped level. Base level-one stats remain at the top of each form. `maxStats` holds the talent-max unscaled mask. Enemy `displayDrop` uses original maximum treasure drop scaling.

The runtime's language loader crashes on an installed locale line. The exporter reads local text defensively with preserved empty columns and does not call `BCUReader.readLang()`. It retains six-digit runtime collection IDs separately from the three-digit locale IDs.

The exported game data and images retain their original ownership and attribution. Exporting these files does not make desktop-only functionality a supported browser feature; the browser engine and UI must still implement and validate each feature.
