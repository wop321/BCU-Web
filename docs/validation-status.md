# Validation status

The browser port implements the original battle engine and animation renderer. Desktop feature parity is still incomplete.

- The JavaScript build rounds BCU float arithmetic and casts at the Java bytecode operations. The desktop JVM battle trace matches all five snapshots through frame 1,200. Three Catclaw Championships presets also match desktop unit IDs, forms, levels, initial base HP and cannon charge limits.
- Battle setup queries the original Java stage restrictions for the selected star. The query succeeded for all 6,212 catalog stages at their first star. That sweep did not find a level-restricted fixture for an end-to-end test.
- The replay regression reproduces the original battle state after exporting and reopening the recording. Desktop BCU read and played the web export through frame 450, and the web engine played the desktop re-export to the same state. The web replay player supports forward playback, pause, and stepping. Desktop seeking and replay branching are still pending.
- The native pack container tests cover JSON and binary asset round trips. A separate native pack model round trip inside the compiled TeaVM engine fails in the original reflective JSON codec with `function fields must have tag`.

Original Quest generation, advanced editors, custom pack subeditors, combo and talent controls, native desktop backups, and desktop-specific settings still need parity work. These checks exercise the compiled engine and static app files. A live browser UI check remains outstanding.
