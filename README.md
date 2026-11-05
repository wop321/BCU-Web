# BCU Web

Browser-only TeaVM port of the supplied Battle Cats Ultimate installation. The browser runs the original Java animation and battle code compiled with TeaVM. The development server serves static files; it does not run a Java backend.

This is an actively developed port. It does **not yet have complete desktop feature parity**. Controls without an implemented adapter are disabled or explicitly report their status. Do not treat the presence of a page or button as proof that every original workflow works.

## Run the existing build

From `D:\BCU-Web`:

```powershell
npm run dev
```

Open [BCU Web](http://127.0.0.1:5173). Browser data, lineups, preferences and editable animation files are stored in IndexedDB on that origin. Use File → Export browser backup to copy them to a file. Browser backups are distinct from native desktop backups.

The `web/` directory is a static application and can be served by another static HTTP host. It must be served over HTTP or HTTPS rather than opened through a `file:` URL. Java is needed only for building and extracting assets, not for using the application.

## Deploy to Vercel

Prepare and upload the locally built static site from the repository root:

```powershell
npm run prepare:vercel
npx vercel link
npx vercel deploy --prebuilt --archive=split-tgz
```

Select your existing Vercel project when linking. Add `--prod` to the deploy command for production. The preparation step stages `.vercel/output` with the browser engine and assets, including a gzip copy of the engine manifest. A Git-based deploy of this checkout lacks the generated files, which are ignored by Git.

## Build

Build requirements: Node.js, Maven, Python 3, and JDK 21. Retain the supplied `BCU/` installation with its application JAR, libraries and assets. Keep the original installation separate from generated web output.

```powershell
npm run build
```

To reuse exported assets and cached Maven dependencies:

```powershell
.\scripts\build.ps1 -SkipAssets -Offline
```

Layout extraction reads the original UI source from `upstream/BCU-java-PC`. Its inspected revision and the supplied JAR hash are recorded in `source-lock.json`. If that checkout is absent, obtain the public source with its common submodule before doing a full asset/layout build:

```powershell
git clone --recurse-submodules https://github.com/battlecatsultimate/BCU-java-PC.git upstream/BCU-java-PC
git -C upstream/BCU-java-PC checkout 386d4c25b6deb2fd3a44ad2e4f1bf95b3083817a
git -C upstream/BCU-java-PC submodule update --init --recursive
```

The exporter calls the original archive loader and data parser headlessly, extracts real game files, and exports browser catalog metadata. It avoids the supplied desktop updater and its failing language-loading path. It does not overwrite the supplied installation or copy its private user configuration into the website.

## Structure

| Directory | Purpose |
| --- | --- |
| `engine/` | TeaVM entry points, original Java engine dependencies and browser adapters |
| `web/` | Static UI, compiled engine, game data and original assets |
| `tools/` | Original-runtime data extraction and format interchange checks |
| `tools-layout/` | Original Swing geometry and public locale extraction |
| `scripts/` | Build, compression, static server and verification |
| `docs/` | Desktop UI inventory and original Swing reference screenshot |

The UI uses BCU's original 2300 × 1300 coordinate system and integer scaling. Original labels, native image assets, model files and animation timelines are retained. The information, lineup and editor adapters use the original page geometry. Browser font rasterization and some platform widgets differ from Swing.

The first battle loads a large virtual-file manifest and initializes the original data model. JSON manifests have precompressed copies; the bundled server serves them with gzip when the browser supports it. PNGs and audio remain separate files and load as needed.

## Verification

```powershell
npm run check
node tools/check-editor-formats.mjs
node engine/smoke.mjs
node engine/battle-smoke.mjs
node engine/unit-behavior.test.mjs
node engine/cooldown-render.test.mjs
```

The battle smoke runs the compiled game engine with a headless graphics boundary. It verifies simulation and renderer calls, not the final appearance in a browser. See the additional fixture scripts under `engine/` and `tools/` for JVM comparisons and native format checks as they are added.

TeaVM's `strict` checks must remain enabled. Older BCU unit CSVs intentionally omit newer fields; the original parser catches out-of-bounds reads to keep the correct legacy defaults. Disabling bounds checks can incorrectly grant spirit/conjure to ordinary units and break their battle behavior. The unit behavior regression verifies ordinary Cat animation, damage, absence of conjure, and a genuine conjurer's spirit spawn.

The Canvas graphics adapter preserves the desktop `colRect` convention: negative alpha means fully opaque. The cooldown rendering regression checks opaque backgrounds and advancing cyan recharge fills in both lineup layouts.

Use the replay button in battle to save a recording, then open **Replays** from the main menu to play, import, or export `.replay` files. Saved recordings are included in browser workspace backups.

## Remaining parity work

Full browser interaction QA, advanced animation editor tools, replay seeking and branching, native desktop backups, custom pack subeditors, combo/talent/orb controls, and desktop-specific settings still need parity work.

Original game data, artwork and third-party code retain their respective ownership and attribution. The original GIF exporter attribution remains in the main menu.
