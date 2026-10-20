# Test fixtures

`frames/*.json` are what YAMNet (the open audio model the app runs) heard in real recordings, one row per
quarter second: `[seconds, steam, tone, dB]`. `steam` is the larger of its Steam and Hiss scores, `tone` the
larger of Whistle and Steam whistle. They were made by running the model in Chrome over each recording with
the same one-second window and quarter-second hop the app uses, so the counter's tests run on real model output
without needing a browser.

| File | Recording (freesound.org, CC0 unless noted) |
|---|---|
| `session` | `public/demo/kitchen-session.mp3`: three whistles, plus talking, frying, TV, a kettle and a mixer |
| `jibanshil-whistle` | Indian cooker whistle bursts (s/536520) |
| `kospak`, `gremaud`, `voxhumana`, `danilo`, `eduardogon`, `meanraccoon`, `hatchetgirl`, `stutter-hiss` | pressure cookers with a valve that hisses (s/867524, 462922, 457977, 391459, 383368, 816443, 185144, 844404) |
| `neg-kettle1`, `neg-kettle2` | whistling kettles (s/678964, 628982) |
| `neg-talk1`, `neg-tv1`, `neg-mixer`, `neg-sizzle1`, `neg-sizzle2`, `neg-stove`, `neg-kitchen1`, `neg-kitchen2` | talking, TV, a mixer, frying, a gas stove, kitchen background (s/457605, 474395, 554847, 709951, 862622, 813666, 473723, 459843) |
