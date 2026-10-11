'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../core.js');
const demo = require('../demo.js');
const srt = (text = 'Hello', start = '00:00:01,000', end = '00:00:02,000') => `1\n${start} --> ${end}\n${text}\n`;
const parse = (input, filename = 'sample.srt') => C.parseSubtitles(input, { filename });
const track = (input = srt(), speaker = 'Alex', offsetMs = 0, filename = 'sample.srt') => ({ ...parse(input, filename), speaker, offsetMs });

test('SRT retains Unicode, multiline text, spacing and source data', () => {
  const text = '\uFEFF7\r\n00:00:01,001 --> 00:00:02,500\r\n  你好，世界 👋\r\nSecond line  \r\n';
  const result = parse(text);
  assert.equal(result.sourceText, text);
  assert.equal(result.cues[0].identifier, '7');
  assert.equal(result.cues[0].text, '  你好，世界 👋\nSecond line  ');
  assert.equal(result.cues[0].startMs, 1001);
  assert.equal(result.cues[0].endMs, 2500);
});
test('SRT accepts missing numeric indexes, dot milliseconds, CR line endings', () => {
  const result = parse('00:00:01.000 --> 00:00:02.000\rText\r');
  assert.equal(result.cues[0].identifier, null);
  assert.equal(result.cues[0].text, 'Text');
});
test('WebVTT supports BOM, title, headers, identifiers, settings and comments', () => {
  const result = parse('\uFEFFWEBVTT Example\nLanguage: en\n\nNOTE keep this\nA comment\n\nSTYLE\n::cue { color: lime }\n\nREGION\nid:main\n\nfirst cue\n00:01.000 --> 00:02.000 position:20% align:start\n<v Alex>Hello</v>\n', 'example.vtt');
  assert.equal(result.format, 'vtt');
  assert.equal(result.metadata.header.length, 2);
  assert.equal(result.metadata.blocks.length, 3);
  assert.equal(result.cues.length, 1);
  assert.equal(result.cues[0].settings, 'position:20% align:start');
  assert.equal(result.cues[0].text, '<v Alex>Hello</v>');
  assert.equal(result.cues[0].identifier, 'first cue');
  assert.equal(result.warnings.length, 3);
});
test('VTT sniffing works even with .srt extension', () => {
  assert.equal(parse('WEBVTT\n\n00:01.000 --> 00:02.000\nText').format, 'vtt');
});
test('Unicode line separators inside a VTT title are not physical newlines', () => {
  for (const separator of ['\u2028', '\u2029']) {
    const result = parse(`WEBVTT title${separator}part\n\n00:01.000 --> 00:02.000\nText`, 'example.vtt');
    assert.equal(result.cues.length, 1);
  }
});
test('VTT supports anonymous cues and hours above 99', () => {
  const result = parse('WEBVTT\n\n100:00:01.001 --> 100:00:02.099\nText', 'test.vtt');
  assert.equal(result.cues[0].identifier, null);
  assert.equal(result.cues[0].startMs, 360001001);
});
test('NOTE prefix without a separator is a normal cue identifier', () => {
  const result = parse('WEBVTT\n\nNOTEworthy\n00:01.000 --> 00:02.000\nText', 'sample.vtt');
  assert.equal(result.cues[0].identifier, 'NOTEworthy');
});
test('empty files, TXT, and metadata-only VTT fail rather than disappear', () => {
  for (const input of ['', '\n\n', 'Plain text without time']) assert.throws(() => parse(input));
  assert.throws(() => parse('WEBVTT\n\nNOTE empty', 'test.vtt'), /No timed cues/);
});
test('VTT extension requires actual WebVTT header', () => {
  assert.throws(() => parse('00:01.000 --> 00:02.000\nText', 'test.vtt'), /must begin with WEBVTT/);
});
test('VTT header requires blank separator', () => {
  assert.throws(() => parse('WEBVTT\n00:01.000 --> 00:02.000\nText', 'test.vtt'), /blank line after/);
});
test('external MPEG timeline mapping is rejected explicitly', () => {
  assert.throws(() => parse('WEBVTT\nX-TIMESTAMP-MAP=LOCAL:00:00:00.000,MPEGTS:900000\n\n00:01.000 --> 00:02.000\nText', 'a.vtt'), /external media timeline/);
});
test('missing cue separators cannot consume subsequent cues', () => {
  assert.throws(() => parse(srt().trimEnd() + '\n2\n00:00:03,000 --> 00:00:04,000\nWorld'), /blank line between cues/);
});
test('literal arrows in dialogue are not confused with timing lines', () => {
  assert.equal(parse(srt('Alice --> Bob')).cues[0].text, 'Alice --> Bob');
});
test('Unicode whitespace payload lines are retained', () => {
  assert.equal(parse(srt('hello\n\u00a0')).cues[0].text, 'hello\n\u00a0');
  assert.equal(parse(srt('hello\n\u3000')).cues[0].text, 'hello\n\u3000');
});
test('VTT preserves ASCII whitespace-only payload and style lines', () => {
  const result = parse('WEBVTT\n\nSTYLE \t\n::cue {\n \ncolor: red;\n}\n\nREGION \t\nid:main\n\n00:01.000 --> 00:02.000\nhello\n \n', 'file.vtt');
  assert.equal(result.cues[0].text, 'hello\n ');
  assert.match(result.metadata.blocks[0].text, /\{\n \ncolor/);
  assert.equal(result.metadata.blocks[1].type, 'REGION');
});
test('VTT metadata cannot swallow an adjacent cue without a blank line', () => {
  for (const type of ['NOTE comment', 'STYLE', 'REGION']) {
    assert.throws(() => parse(`WEBVTT\n\n${type}\n00:01.000 --> 00:02.000\nLost cue\n\n00:03.000 --> 00:04.000\nOther cue`, 'file.vtt'), /metadata cannot contain/);
  }
});
test('VTT payload arrows are rejected with an actionable error', () => {
  assert.throws(() => parse('WEBVTT\n\n00:01.000 --> 00:02.000\nAlice --> Bob', 'file.vtt'), /cue text cannot contain/);
});
test('invalid timestamp formats report a source line', () => {
  for (const timestamp of ['00:60:00,000', '00:00:60,000', '00:00:01,12', '-00:00:01,000', '00:01,000', 'one']) {
    assert.throws(() => parse(srt('Text', timestamp)), error => error instanceof C.SubtitleError && error.line === 2 && error.message.includes('sample.srt'));
  }
});
test('incomplete arrow, trailing garbage, cue indexes and empty text are errors', () => {
  for (const input of ['1\n00:00:01,000 -> 00:00:02,000\nText', 'a\n00:00:01,000 --> 00:00:02,000\nText', '1\n00:00:01,000 --> 00:00:02,000 junk\nText', '1\n00:00:01,000 --> 00:00:02,000\n']) assert.throws(() => parse(input));
});
test('zero and reversed durations fail', () => {
  assert.throws(() => parse(srt('text', '00:00:02,000', '00:00:02,000')), /end must be later/);
  assert.throws(() => parse(srt('text', '00:00:03,000', '00:00:02,000')), /end must be later/);
});
test('NUL/UTF-16 input is rejected', () => assert.throws(() => parse('1\0\n'), /UTF-8/));
test('huge timestamps cannot lose integer precision', () => assert.throws(() => C.timestamp('99999999999999:00:00,000'), /too large/));
test('unknown parse formats are rejected', () => assert.throws(() => C.parseSubtitles(srt(), { format: 'txt' }), /Only SRT/));
test('out-of-order source cues are reported and sorted', () => {
  const t = track(srt('Later', '00:00:03,000', '00:00:04,000') + '\n' + srt('Earlier'));
  assert.match(t.warnings.join(' '), /out of chronological order/);
  assert.deepEqual(C.mergeTracks([t]).map(c => c.text), ['Earlier', 'Later']);
});
test('exact offsets allow milliseconds, zero, and signed seconds', () => {
  for (const [input, expected] of [['0', 0], ['0.001', 1], ['+1.500', 1500], ['-0.250', -250], [' 2.01 ', 2010], ['9000', 9000000]]) assert.equal(C.parseOffset(input), expected);
});
test('offset parsing rejects empty, exponent, infinity and extra precision', () => {
  for (const input of ['', ' ', 'NaN', 'Infinity', '1e2', '0.0001', '1,5', '1.', '.5', '9007199254740991']) assert.throws(() => C.parseOffset(input));
});
test('offsets preserve duration and original times without mutation', () => {
  const source = track(srt(), 'Alex', -250);
  const merged = C.mergeTracks([source]);
  assert.equal(merged[0].startMs, 750);
  assert.equal(merged[0].endMs, 1750);
  assert.equal(merged[0].originalStartMs, 1000);
  assert.equal(source.cues[0].startMs, 1000);
});
test('negative shifted times block the whole merge rather than clip', () => assert.throws(() => C.mergeTracks([track(srt(), 'Alex', -1001)]), /never clipped or dropped/));
test('invalid offsets and labels block merging', () => {
  for (const offset of [NaN, Infinity, 0.5]) assert.throws(() => C.mergeTracks([track(srt(), 'A', offset)]));
  for (const label of ['', '  ', 'A\nB', 'A\tB', 'A\0B']) assert.throws(() => C.mergeTracks([track(srt(), label)]));
  assert.throws(() => C.mergeTracks([]));
});
test('ties preserve source file order then source cue order, not duration', () => {
  const first = track(srt('A long', '00:00:01,000', '00:00:09,000') + '\n' + srt('A short'), 'A');
  const second = track(srt('B short'), 'B');
  assert.deepEqual(C.mergeTracks([first, second]).map(c => c.text), ['A long', 'A short', 'B short']);
});
test('duplicate and identical text cues are never deduplicated', () => {
  const merged = C.mergeTracks([track(), track()]);
  assert.equal(merged.length, 2);
  assert.deepEqual(C.overlapStats(merged), { groups: 1, overlappingCues: 2 });
});
test('overlap groups handle nested, chained, touching and disjoint cues', () => {
  const intervals = [[0, 10], [1, 2], [9, 12], [12, 14], [15, 20], [16, 17], [21, 22]];
  assert.deepEqual(C.overlapStats(intervals.map(([startMs, endMs]) => ({ startMs, endMs }))), { groups: 2, overlappingCues: 5 });
  assert.deepEqual(C.overlapStats([]), { groups: 0, overlappingCues: 0 });
});
test('timestamp formatting is exact at boundaries and beyond 24 hours', () => {
  for (const [ms, expected] of [[0, '00:00:00.000'], [59999, '00:00:59.999'], [60000, '00:01:00.000'], [360000000, '100:00:00.000']]) assert.equal(C.formatTimestamp(ms), expected);
  assert.throws(() => C.formatTimestamp(-1));
});
test('TXT and Markdown retain full cue times and multiline text', () => {
  const cues = C.mergeTracks([track(srt('First\n第二行'), '小林')]);
  assert.equal(C.toText(cues), '[00:00:01.000 → 00:00:02.000] 小林:\nFirst\n第二行\n');
  assert.match(C.toMarkdown(cues), /> First\n> 第二行/);
});
test('Markdown escapes HTML and structural characters in text and labels', () => {
  const cues = C.mergeTracks([track(srt('<script>alert(1)</script>\n# heading'), '[Alex]*')]);
  const md = C.toMarkdown(cues);
  assert.ok(!md.includes('<script>'));
  assert.match(md, /&lt;script&gt;/);
  assert.ok(md.includes('\\[Alex\\]\\*'));
  assert.ok(md.includes('> \\# heading'));
});
test('SRT output reindexes without changing overlapping intervals', () => {
  const cues = C.mergeTracks(demo.map(file => track(file.text, C.defaultSpeaker(file.name), 0, file.name)));
  const output = C.toSrt(cues), reparsed = parse(output);
  assert.equal(reparsed.cues.length, 6);
  assert.deepEqual(reparsed.cues.map(c => [c.startMs, c.endMs]), cues.map(c => [c.startMs, c.endMs]));
  assert.equal(reparsed.cues[0].text, 'Alex: Shall we start with the launch plan?');
  assert.deepEqual(C.overlapStats(cues), { groups: 2, overlappingCues: 4 });
});
test('JSON archive preserves exact original text and VTT metadata', () => {
  const tracks = demo.map(file => track(file.text, C.defaultSpeaker(file.name), 500, file.name));
  const archive = JSON.parse(C.toArchive(tracks, C.mergeTracks(tracks)));
  assert.equal(archive.schemaVersion, 1);
  assert.equal(archive.tracks[1].sourceText, demo[1].text);
  assert.equal(archive.tracks[1].metadata.blocks[0].type, 'NOTE');
  assert.equal(archive.mergedCues[0].originalStartMs, 1000);
  assert.equal(archive.mergedCues[0].startMs, 1500);
});
test('filename labels retain Unicode and only remove final known extension', () => {
  assert.equal(C.defaultSpeaker('小林.final.SRT'), '小林.final');
  assert.equal(C.defaultSpeaker('file.vtt.backup.srt'), 'file.vtt.backup');
  assert.equal(C.defaultSpeaker('.srt'), 'Speaker');
});
test('deterministic generated round-trip preserves every interval and text', () => {
  let seed = 123456;
  const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0);
  const tracks = Array.from({ length: 5 }, (_, source) => {
    const cues = Array.from({ length: 300 }, (_, i) => {
      const startMs = rand() % 600000, endMs = startMs + 1 + rand() % 8000;
      return `${i + 1}\n${C.formatTimestamp(startMs, ',')} --> ${C.formatTimestamp(endMs, ',')}\nSpeaker ${source}: 文字 ${i}\nline two`;
    });
    return track(cues.join('\n\n'), `Speaker ${source}`);
  });
  const merged = C.mergeTracks(tracks), again = parse(C.toSrt(merged)).cues;
  assert.equal(merged.length, 1500);
  for (let i = 0; i < merged.length; i++) {
    assert.equal(again[i].startMs, merged[i].startMs);
    assert.equal(again[i].endMs, merged[i].endMs);
    assert.equal(again[i].text, `${merged[i].speaker}: ${merged[i].text}`);
    if (i) assert.ok(merged[i].startMs >= merged[i - 1].startMs);
  }
});
test('committed demo fixtures exactly match the offline demo', () => {
  for (const file of demo) assert.equal(fs.readFileSync(path.join(__dirname, '..', 'examples', file.name), 'utf8'), file.text);
});
