# Validation record

## Local checks, 2026-10-11

- JavaScript syntax checks: passed
- Core deterministic tests: 40 passed, 0 failed
- Dependency-free simulated-DOM app tests: 10 passed, 0 failed. Covers pending/stale reads, error recovery, invalid UTF-8, full export beyond preview truncation, URL cleanup and inert hostile text
- Includes a seeded 1,500-cue SRT round-trip checking every interval, cue count and text payload
- Independent integrity review completed. Findings fixed and regression-tested: metadata swallowing adjacent cues, Unicode/ASCII VTT whitespace lines, literal SRT arrows, trailing STYLE/REGION whitespace, and Unicode line separators inside VTT titles
- Example data is synthetic English/Chinese dialogue; no private or copyrighted conversation was used
- A local Node.js sanity check merged and exported 50,000 synthetic cues (the browser UI limit) without loss. This is not a browser-performance guarantee

## Real Chromium verification: passed, 2026-10-11

The [GitHub Actions run](https://github.com/mozzie49/speaker-caption-merger/actions/runs/38135364837) passed for the complete application source at commit [ca47406140a7e76e6e03c5b4214b5193bf447c48](https://github.com/mozzie49/speaker-caption-merger/commit/ca47406140a7e76e6e03c5b4214b5193bf447c48): all 50 core/simulated-DOM tests, syntax checks and the actual Playwright Chromium smoke suite passed.

The real-browser suite verified direct `file://` launch, synthetic demo/import, all four downloads, SRT reparse, offsets and labels, invalid UTF-8, malformed cues, error recovery, repeated example/reset actions, clear during a pending read, drag/drop, stable tie order, no horizontal overflow at a mobile-sized viewport, and no browser errors. The **direct-file test** also observed zero HTTP(S) requests; that assertion does not describe normal page-load traffic on a hosted website.

Desktop and mobile-viewport screenshots were saved as CI artifacts and visually inspected. The suite saves screenshots and downloaded outputs under ignored `test-results/` for local runs too.

## Hosted application checks: passed, 2026-10-11

The [live application](https://mozzie49.github.io/speaker-caption-merger/) was separately checked in a cloud browser:

- Synthetic demo: 6 cues, 2 speaker labels and 2 overlap groups
- Invalid `-1.001`-second offset blocks every export; changing it to `0.500` restores valid output
- Downloaded JSON parses successfully with 6 cues, 2 source tracks, a 500 ms offset and the first shifted cue starting at 1,500 ms
- Downloaded SRT reparses to 6 cues with the expected intervals intact
- Clear resets the interface; selecting actual local SRT and VTT fixtures imports them successfully
- Repeated demo activation protects already imported sources; reloading clears the session

## Coverage limits and initial environment history

The initial local build environment could not launch Chromium because its process socket was restricted, and its cloud browser disallowed local file/preview URLs. No local browser pass was claimed. Subsequent authorized repository CI and hosted checks supplied the real-browser verification above.

Browser evidence covers Chromium and a mobile-sized Chromium viewport. It does not establish Safari/Firefox compatibility, testing on a physical phone, subtitle-player behavior for simultaneous SRT cues, or browser performance at every supported input limit. Simulated-DOM tests remain supplemental to the actual browser checks.
