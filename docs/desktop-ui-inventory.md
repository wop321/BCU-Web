# BCU desktop baseline

This inventory was recovered from the supplied `BCU/BCU-0-5-8-8.jar` using `jar` and `javap`, and from the supplied English locale files. The installed JAR is the UI baseline; upstream current source may differ.

## Available runtime data

- Desktop application and shared engine are together in the 1,945,180-byte application JAR.
- Eight `assets/assets/*.assets.bcuzips` archives contain approximately 573 MB of game data.
- `assets/music` contains 193 OGG files (`000`–`192`).
- `assets/fonts/stage_font.otf` is available.
- Locale directories: `de`, `en`, `es`, `fr`, `it`, `jp`, `kr`, `ru`, `zh`.
- `packs` has no custom content at inspection time.
- User configuration selects English, light/default theme (Nimbus false), JOGL false, two-row lineup, large screen, and preferred unit level 50.
- `user/config.json` contains local preferences and update hashes. It should not be copied wholesale to a published site.

## Main page geometry

`page.Page.set` scales each coordinate independently from a **2300 × 1300** reference space, using integer truncation:

```text
left = floor(x * viewportWidth / 2300)
top = floor(y * viewportHeight / 1300)
width = floor(w * viewportWidth / 2300)
height = floor(h * viewportHeight / 1300)
```

The root panel uses absolute positioning. Its background is white for the installed light/default configuration. A dark Nimbus configuration uses RGB `(54,54,54)`. Global font family is Java `Dialog`, plain; size is `min(floor(24 * width / 2300), floor(24 * height / 1300))`.

Main buttons are all `200 × 50` in reference units. Rows begin at `y=200`, separated by 100 reference units.

| Row y | x=600 | x=900 | x=1200 | x=1500 |
|---|---|---|---|---|
| 200 | Unit animation | Configuration | Stage info | Custom animation |
| 300 | Enemy animation | Save all | Enemy data | Sprite Editor |
| 400 | Effects | Lineup | Unit data | Model Editor |
| 500 | Castles | Backup | Compare¹ | Animation Editor |
| 600 | Backgrounds | Current | Custom pack | |
| 700 | Audio | Author | Replay | |
| 800 | All files¹ | Refresh tips | Error logs¹ | |

¹ The JAR requests locale keys `compare`, `allfile`, and `logs`; these keys are absent from the installed English page properties. The desktop localization fallback must be checked before choosing final display text.

Header labels:

| Element | x | y | w | h | Text/behavior |
|---|---:|---:|---:|---:|---|
| Memory | 50 | 30 | 500 | 50 | `memory used: … MB / … MB, …%` |
| Enemy icon credit | 50 | 60 | 500 | 50 | `Source of enemy icon: battlecats-db.com` |
| GIF exporter credit | 50 | 90 | 800 | 50 | `Author of GIF exporter: Kevin Weiner, FM Software` |
| Author welcome | 50 | 120 | 500 | 50 | `Welcome <author>!`; hidden when author is empty |
| Random tip | 600 | 900 | 1100 | 200 | One of `tip0`–`tip15`; supports HTML line breaks |

`Current` is disabled until a `BattleInfoPage.current` exists. Returning to the main page refreshes the tip and memory display.

The application menu bar has `File` and `History`. File items include `Save All` and `Go Back`; Go Back is disabled on the main page. Saving via the menu shows `Successfully saved data.` / `Save Confirmation`.

## Main navigation targets

| Main action | Original class |
|---|---|
| Unit animation | `page.view.UnitViewPage` |
| Enemy animation | `page.view.EnemyViewPage` |
| Stage info | `page.info.StageViewPage`, initialized with all `MapColc` collections |
| Custom animation | `page.anim.DIYViewPage` |
| Configuration | `page.ConfigPage` |
| Effects | `page.view.EffectViewPage` |
| Castles | `page.view.CastleViewPage` |
| Backgrounds | `page.view.BGViewPage` |
| Enemy data | `page.info.filter.EnemyFindPage` |
| Unit data | `page.info.filter.UnitFindPage` |
| Lineup | `page.basis.BasisPage` |
| Current | Existing `page.battle.BattleInfoPage.current` |
| Custom pack | `page.pack.PackEditPage` |
| Sprite Editor | `page.anim.ImgCutEditPage` |
| Model Editor | `page.anim.MaModelEditPage` |
| Animation Editor | `page.anim.MaAnimEditPage` |
| Save all | `io.BCUWriter.writeData()` |
| Audio | `page.view.MusicPage` |
| Replay | `page.battle.RecdManagePage` |
| All files | `page.pack.ResourcePage` |
| Backup | `page.BackupPage(parent, true)` |
| Error logs | `page.LogPage` |
| Author | Prompt `Decide your author name`; trims value, updates author of editable custom packs and welcome label |
| Compare | `page.info.ComparePage` |
| Refresh tips | Randomly chooses one of the 16 locale tips |

## Further desktop screens

The JAR includes approximately 60 page classes in these groups:

- Animation/sprite/model editors, custom animation tree, image cuts, animation timelines, advanced animation editor.
- Battle setup/info, damage/entity/coming tables, recording/replay management and saving.
- Unit/enemy data filters and tables, stage collection/map/stage selectors, stage search/random/filter, unit/enemy/stage/limit/talent editors.
- Lineup, unit form/level/orb selection, treasures and cannon/base configuration.
- Custom pack editing, unit management, custom traits, character groups, level restrictions, random enemy groups, combos, backgrounds, castles, souls, music, validation, and resource browser.
- Configuration, color picker, backup, logs, load/save dialogs.

## Browser adapter seams

The shared engine already abstracts rendering via `common.system.fake.FakeGraphics`, `FakeImage`, `FakeTransform`, and `ImageBuilder`. Canvas implementations can preserve the engine's draw/transform/composite calls. Browser audio needs an implementation behind `CommonStatic.Itf` sound/music methods. `common.pack.Context` centralizes workspace, asset, user, backup and language access, but its API still uses `java.io.File`; direct browser compilation needs virtual storage or a replacement of the file-facing layer.

Desktop dependencies include Swing/AWT, JOGL native rendering, Java Sound/Vorbis, JCodec/GIF export, Apache HTTP, Google Drive OAuth, Gson, and Kotlin runtime. These require browser equivalents or explicit parity work; they cannot be treated as working TeaVM features by merely adding them to the classpath.

## Existing installation issue

The supplied log `logs/20261103191822.log` records an unavailable update host and then `ArrayIndexOutOfBoundsException` in `io.BCUReader.readLang(BCUReader.java:216)`. Asset loading had progressed before the language error. The logged reported version is `0-5-5-0`, despite the application filename `0-5-8-8.jar`; identify compatibility from actual classes/data rather than filename alone.
