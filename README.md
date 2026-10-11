# Speaker Caption Merger

**Separate tracks. One conversation.** A small, local-first browser tool for combining per-speaker SRT and WebVTT exports into a labeled chronological transcript.

[中文说明](#中文说明) · [Synthetic examples](examples/) · [MIT license](LICENSE)

## Open it. Drop files. Download.

1. Download this folder and open **index.html** in a modern browser. No installation, build, account, API key or internet connection is needed.
2. Add one `.srt` or `.vtt` file per speaker. You can mix formats. Files must use UTF-8.
3. Edit the speaker labels, which start from filenames. If necessary, set per-file offsets in seconds, e.g. `+1.500` moves a speaker 1.5 seconds later and `-0.250` moves them 250 ms earlier.
4. Download TXT, Markdown, SRT or a JSON archive. The built-in example works offline and contains only synthetic dialogue.

If your browser or device does not open local HTML, serve the folder with `python3 -m http.server 8080 --bind 127.0.0.1`, then open `http://127.0.0.1:8080`. There is no application backend; this server only serves the static files.

## Why this exists

Separately recorded participants or split left/right audio can produce one timed subtitle file per speaker. Turning those files into a readable conversation can still mean manually interleaving cues. A [public Buzz discussion](https://github.com/chidiwilliams/buzz/issues/1386#issuecomment-3929614650) describes this exact downstream workflow, including simultaneous speech.

This tool focuses on that post-export step: choose timed files, label speakers, align clocks and download. Subtitle merging already exists in other tools; the goal here is a lightweight browser workflow with mixed SRT/VTT inputs and no runtime dependencies. It is independent of Buzz and is not an audio transcription or diarization system.

## What stays intact

- Every accepted cue appears once in the merged output, including duplicate text and simultaneous speech
- Cue start/end times are unchanged except for your explicit per-file offset; nothing is clipped, trimmed to another cue, or deduplicated
- Ordering is deterministic: start time, then input file order, then original cue order
- Unicode and multiline dialogue are retained. Input line endings are normalized for parsing/output; the exact decoded source text is retained in JSON
- Malformed files show a filename and line number where possible. Any invalid source or offset blocks the whole export until fixed or removed
- WebVTT headers, cue identifiers, settings, NOTE, STYLE and REGION data are retained in the JSON archive. Transcript/SRT exports omit metadata and cue positioning; the app calls this out

| Export | Intended use |
| --- | --- |
| TXT | Readable speaker labels, full start/end timestamps and original dialogue |
| Markdown | The same conversation, with literal dialogue escaped for safe Markdown rendering |
| SRT | Numbered subtitle cues with a speaker prefix and original intervals |
| JSON archive | Source text, source cue data/metadata, speaker labels, offsets and merged cue data |

The archive is an inspection/preservation format, not a project import format. Keep your source files too.

## Overlaps are deliberate

If one speaker talks from 1.0–3.5 seconds and another starts at 2.8 seconds, both intervals remain intact. The UI reports groups of overlapping cues, including overlaps within one source file. Touching endpoints do not overlap.

**Some subtitle players hide or replace overlapping SRT cues.** This tool does not manufacture non-overlapping display segments or promise that every player shows every simultaneous voice. Use TXT/Markdown for reading, or inspect the JSON archive for full timing. Original VTT inline markup is retained verbatim and may render differently in an SRT player.

## Scope and deliberate limits

- Timed exports only: no audio/video decoding, ASR, speaker detection, automatic sync, or alignment of untimed TXT
- One label and one constant offset per file. It cannot repair clock drift, different cuts, speaker changes inside a file, or mixed timelines
- UTF-8 only, with optional BOM. Invalid bytes fail rather than being silently replaced. Convert legacy/UTF-16 files before importing
- Up to 100 files, 10 MiB per file, 25 MiB total and 50,000 cues per merge. Preview shows at most 100 cues; downloads include all accepted cues
- SRT timestamps use `HH:MM:SS,mmm` (a dot is also accepted). Numeric indexes are optional. Nonstandard SRT positioning fields are rejected. ASCII whitespace-only lines are accepted as SRT cue separators
- WebVTT supports `MM:SS.mmm` and `HH:MM:SS.mmm`, with an initial `WEBVTT` header and empty-line block separators. Space-only VTT payload lines remain text. Cue settings are preserved as opaque text, not fully validated or rendered. This is a timed-text extractor, not a complete VTT conformance validator
- Zero-duration/reversed cues, negative shifted times and missing cue separators are errors. Dialogue lines that look exactly like subtitle timing lines are rejected as ambiguous
- `X-TIMESTAMP-MAP` is rejected because segmented/media-timeline mapping needs information this standalone tool does not have
- SRT and TXT leave inline markup literal. Markdown escapes it rather than interpreting it. JSON preserves the source representation
- No sessions, local storage or recovery: refreshing/closing the tab clears its data. Downloads are ordinary files on your device

## Privacy

All parsing and merging runs in the browser tab. There are no fetch calls, analytics, remote scripts, fonts, uploads, accounts or backend APIs. A Content Security Policy disables connections. If hosted on a website, the hosting provider can receive normal page-load traffic, but this app does not send it your selected captions. For offline use, open the downloaded folder directly.

Downloads and JSON archives can contain private transcript content, names and comments. Share them with the same care as the originals. The app's privacy claims do not cover browser extensions, a modified copy of the app, your operating system or a hosting provider's injected code.

## Develop and verify

No dependencies are needed for the app or core tests. Node.js 18+ is required only to run tests.

```sh
npm run check
```

This checks JavaScript syntax, deterministic parser/merge/export regressions (including a 1,500-cue round-trip), and simulated-DOM app regressions. See [the validation record](VALIDATION.md) for checks actually completed and remaining browser verification.

Optional real-browser smoke test:

```sh
npm install --no-save playwright@1.63.0
npx playwright install chromium
node tests/browser-smoke.cjs
```

For an existing installation, set `PLAYWRIGHT_MODULE` to its module path and/or `CHROMIUM_PATH` to a Chromium executable. Browser QA covers direct `file://` use, four downloads, offset errors, malformed/invalid-UTF-8 input, repeated actions, clear-during-read, drag/drop, tie ordering, mobile overflow, script errors and unexpected HTTP(S) requests. Screenshots and downloaded fixtures go to ignored `test-results/`.

Files: `core.js` is the dependency-free parser/merger/export API (also CommonJS-compatible), `app.js` is browser UI wiring, `demo.js` contains synthetic fixtures, and `tests/` contains regression and browser checks.

---

## 中文说明

**把每位说话人的字幕，按时间合成一段完整对话。**

这是一个本地浏览器小工具，用于合并按说话人分别导出的 SRT / VTT 字幕。下载整个目录后，直接打开 `index.html` 即可使用，不需要安装、账号、API 密钥或联网。

1. 添加每位说话人的 `.srt` 或 `.vtt` 文件，支持混用两种格式
2. 文件名会自动成为说话人标签，可以手动修改
3. 必要时设置秒数偏移：`1.500` 表示推迟 1.5 秒，`-0.250` 表示提前 250 毫秒
4. 下载带标签的 TXT、Markdown、SRT，或保留完整源文本与元数据的 JSON 存档

点击 “Try an example” 可加载中英双语虚构示例，完全离线可用。若设备不允许直接打开本地 HTML，可运行 `python3 -m http.server 8080 --bind 127.0.0.1`，再访问 `http://127.0.0.1:8080`。

**同时说话不会被裁剪。** 每条字幕保留原始起止时间，仅应用你设置的偏移。相同起点按文件添加顺序、原文件字幕顺序排列。不去重、不猜测谁在说话，也不把未计时的 TXT 强行对齐。部分播放器只能显示一条重叠 SRT 字幕；阅读对话建议用 TXT 或 Markdown。

**出现错误就停止导出。** 文件解析失败、偏移导致负时间、字幕结束早于开始等情况会明确提示，不会跳过出错文件后悄悄输出不完整结果。VTT 的 NOTE、STYLE、REGION、头部与定位设置会保存在 JSON 中，不会写进 TXT/Markdown/SRT；界面会提示这些差异。

**隐私与限制：** 文件内容只在当前标签页处理，没有上传、统计、外部字体或远程依赖。仅支持 UTF-8（可带 BOM）；上限为 100 个文件、单文件 10 MiB、总计 25 MiB、50,000 条字幕。预览最多显示前 100 条，下载包含全部有效字幕。刷新会清空当前会话；JSON 是保存与检查用的存档，暂不支持重新导入。音频转写、声纹识别、漂移校正、VTT 外部媒体时间映射不在本工具范围内。

测试：安装 Node.js 18+ 后运行 `npm run check`。项目采用 MIT 协议，示例内容均为虚构。
