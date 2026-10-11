# Validation record

## Local checks, 2026-10-11

- JavaScript syntax checks: passed
- Core deterministic tests: 40 passed, 0 failed
- Dependency-free simulated-DOM app tests: 10 passed, 0 failed. Covers pending/stale reads, error recovery, invalid UTF-8, full export beyond preview truncation, URL cleanup and inert hostile text
- Includes a seeded 1,500-cue SRT round-trip checking every interval, cue count and text payload
- Independent integrity review completed. Findings fixed and regression-tested: metadata swallowing adjacent cues, Unicode/ASCII VTT whitespace lines, literal SRT arrows, trailing STYLE/REGION whitespace, and Unicode line separators inside VTT titles
- Example data is synthetic English/Chinese dialogue; no private or copyrighted conversation was used
- A local Node.js sanity check merged and exported 50,000 synthetic cues (the browser UI limit) without loss. This is not a browser-performance guarantee

## Real browser verification: pending

The `tests/browser-smoke.cjs` script and GitHub Actions workflow are provided, but the real-browser suite has **not passed in this build environment**. Installed Chromium could not create its local process socket, including on an approved retry. The supported cloud browser disallowed `file://` and the localhost preview. These restrictions were respected; no public deployment was created to work around them.

The smoke suite is intended to verify direct-file launch, synthetic demo/import, all four downloads, SRT reparse, offsets and labels, invalid UTF-8, malformed cues, error recovery, repeated example/reset actions, clear during a pending read, drag/drop, stable tie order, mobile horizontal overflow, zero HTTP(S) requests, and browser errors. It saves desktop/mobile screenshots and downloaded test outputs under ignored `test-results/`.

Run the workflow after publishing to a repository, or execute the documented browser command in a browser-capable environment. Until that succeeds, treat rendering, browser downloads and the complete browser smoke flow as unverified. Simulated-DOM tests are not a substitute for that step.
