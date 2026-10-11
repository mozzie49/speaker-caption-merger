/* Speaker Caption Merger. MIT license. No runtime dependencies. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CaptionMerger = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  class SubtitleError extends Error {
    constructor(message, filename = '', line = null) {
      super(`${filename ? filename + ': ' : ''}${line ? 'line ' + line + ': ' : ''}${message}`);
      this.name = 'SubtitleError';
      this.filename = filename;
      this.line = line;
    }
  }
  function timestamp(value, format = 'srt') {
    const pattern = format === 'vtt'
      ? /^(?:(\d{2,}):)?([0-5]\d):([0-5]\d)\.(\d{3})$/
      : /^(\d{2,}):([0-5]\d):([0-5]\d)[,.](\d{3})$/;
    const parts = pattern.exec(value);
    if (!parts) throw new Error(`Invalid ${format.toUpperCase()} timestamp “${value}”. Use ${format === 'vtt' ? 'MM:SS.mmm or HH:MM:SS.mmm' : 'HH:MM:SS,mmm'}; minutes and seconds must be 00–59.`);
    const result = ((Number(parts[1] || 0) * 60 + Number(parts[2])) * 60 + Number(parts[3])) * 1000 + Number(parts[4]);
    if (!Number.isSafeInteger(result)) throw new Error('Timestamp is too large to represent exactly.');
    return result;
  }
  function parseSubtitles(input, options = {}) {
    const filename = options.filename || '';
    const fail = (message, line) => { throw new SubtitleError(message, filename, line); };
    if (typeof input !== 'string') fail('Expected text content.');
    if (input.includes('\0')) fail('NUL bytes found. Save the source as UTF-8 text, not UTF-16.');
    const normalized = input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    const lines = normalized.split('\n');
    const isVtt = /^WEBVTT(?:[ \t][^\r\n]*)?$/.test(lines[0]);
    const format = options.format || (isVtt ? 'vtt' : /\.vtt$/i.test(filename) ? 'vtt' : 'srt');
    if (!['srt', 'vtt'].includes(format)) fail('Only SRT and WebVTT inputs are supported.');
    const isBlank = line => format === 'vtt' ? line === '' : /^[ \t]*$/.test(line);
    let position = 0;
    const metadata = { header: [], blocks: [] };
    const warnings = [];
    if (format === 'vtt') {
      if (!isVtt || lines[0].includes('-->')) fail('WebVTT must begin with WEBVTT on the first line (a UTF-8 BOM is allowed).', 1);
      while (position < lines.length && !isBlank(lines[position])) {
        if (/X-TIMESTAMP-MAP/i.test(lines[position])) fail('X-TIMESTAMP-MAP uses an external media timeline and is not supported. Export a standalone VTT first.', position + 1);
        if (position && lines[position].includes('-->')) fail('Add a blank line after the WebVTT header before the first cue.', position + 1);
        metadata.header.push(lines[position++]);
      }
    }
    const cues = [];
    while (position < lines.length) {
      while (position < lines.length && isBlank(lines[position])) position++;
      if (position === lines.length) break;
      const firstLine = position + 1;
      const block = [];
      while (position < lines.length && !isBlank(lines[position])) block.push(lines[position++]);
      if (format === 'vtt' && (/^NOTE(?:[ \t]|$)/.test(block[0]) || /^(STYLE|REGION)[ \t]*$/.test(block[0]))) {
        const arrowLine = block.findIndex(line => line.includes('-->'));
        if (arrowLine !== -1) fail('WebVTT metadata cannot contain -->. If this is a cue, add an empty line before it.', firstLine + arrowLine);
        metadata.blocks.push({ line: firstLine, type: block[0].split(/[ \t]/)[0], text: block.join('\n') });
        continue;
      }
      let timingIndex = 0;
      let identifier = null;
      if (!block[0].includes('-->')) {
        if (format === 'srt' && !/^\d+$/.test(block[0])) fail('Expected a numeric cue index or an SRT timing line.', firstLine);
        identifier = block[0];
        timingIndex = 1;
      }
      const timing = block[timingIndex];
      const match = timing && /^(\S+)[ \t]+-->[ \t]+(\S+)(?:[ \t]+(.*))?$/.exec(timing);
      if (!match) fail('Expected a complete timing line, for example 00:00:01,000 --> 00:00:03,000.', firstLine + timingIndex);
      let startMs, endMs;
      try { startMs = timestamp(match[1], format); endMs = timestamp(match[2], format); }
      catch (error) { fail(error.message, firstLine + timingIndex); }
      if (endMs <= startMs) fail('Cue end must be later than its start; zero-duration cues are not supported.', firstLine + timingIndex);
      const settings = (match[3] || '').trim();
      if (format === 'srt' && settings) fail('Extra SRT timing-line fields are not supported. Remove them or export standard SRT.', firstLine + timingIndex);
      const payload = block.slice(timingIndex + 1);
      if (!payload.length) fail('Cue has no text. Add its text or remove the empty cue.', firstLine + timingIndex);
      if (format === 'vtt') {
        const arrowLine = payload.findIndex(line => line.includes('-->'));
        if (arrowLine !== -1) fail('WebVTT cue text cannot contain -->. Use &gt; for a literal >, or add an empty line before the next cue.', firstLine + timingIndex + 1 + arrowLine);
      }
      const nestedTiming = payload.findIndex(line => /^[ \t]*\d{2,}:\d{2}(?::\d{2})?[,.]\d{3}[ \t]+-->[ \t]+\d{2,}:\d{2}(?::\d{2})?[,.]\d{3}/.test(line));
      if (nestedTiming !== -1) fail('Found a timing line inside cue text. Add a blank line between cues.', firstLine + timingIndex + 1 + nestedTiming);
      cues.push({ identifier, startMs, endMs, text: payload.join('\n'), settings, line: firstLine, cueIndex: cues.length });
    }
    if (!cues.length) fail('No timed cues found. Plain TXT transcripts cannot be aligned; export SRT or VTT.');
    if (metadata.blocks.length || metadata.header.length > 1) warnings.push('WebVTT comments, styles, regions and header metadata are kept in the JSON archive but omitted from transcript/SRT exports.');
    if (cues.some(cue => cue.settings)) warnings.push('WebVTT cue positioning/settings are kept in the JSON archive but omitted from transcript/SRT exports.');
    if (cues.some(cue => /<[^>]*>/.test(cue.text))) warnings.push('Inline markup is preserved verbatim. VTT voice, styling and timestamp tags may not render correctly in SRT players.');
    if (cues.some((cue, i) => i > 0 && cue.startMs < cues[i - 1].startMs)) warnings.push('Source cues are out of chronological order; merged output is sorted by start time.');
    return { filename, format, sourceText: input, cues, metadata, warnings };
  }
  function parseOffset(value) {
    const raw = String(value).trim();
    if (!/^[+-]?\d+(?:\.\d{1,3})?$/.test(raw)) throw new Error('Offset must be seconds with up to 3 decimal places, such as -0.250 or 1.5.');
    const sign = raw.startsWith('-') ? -1 : 1;
    const [whole, fraction = ''] = raw.replace(/^[+-]/, '').split('.');
    const milliseconds = sign * (Number(whole) * 1000 + Number(fraction.padEnd(3, '0')));
    if (!Number.isSafeInteger(milliseconds)) throw new Error('Offset is too large to represent exactly.');
    return milliseconds;
  }
  function defaultSpeaker(filename) {
    return filename.replace(/\.(srt|vtt)$/i, '').trim() || 'Speaker';
  }
  function mergeTracks(tracks) {
    if (!tracks.length) throw new Error('Add at least one SRT or VTT file.');
    const cues = [];
    tracks.forEach((track, sourceIndex) => {
      const speaker = String(track.speaker || '').trim();
      if (!speaker || /[\r\n\u0000-\u001f\u007f]/.test(speaker)) throw new Error(`${track.filename || 'Track ' + (sourceIndex + 1)}: use a non-empty, single-line speaker label without control characters.`);
      const offsetMs = track.offsetMs === undefined ? 0 : track.offsetMs;
      if (!Number.isSafeInteger(offsetMs)) throw new Error(`${track.filename}: offset must be an integer number of milliseconds.`);
      if (!Array.isArray(track.cues) || !track.cues.length) throw new Error(`${track.filename}: no parsed cues.`);
      track.cues.forEach((cue, cueIndex) => {
        const startMs = cue.startMs + offsetMs, endMs = cue.endMs + offsetMs;
        if (!Number.isSafeInteger(startMs) || !Number.isSafeInteger(endMs) || startMs < 0 || endMs <= startMs) throw new Error(`${track.filename}: cue ${cueIndex + 1} has an invalid time after offset. Adjust the offset; cues are never clipped or dropped.`);
        cues.push({ ...cue, originalStartMs: cue.startMs, originalEndMs: cue.endMs, startMs, endMs, speaker, sourceIndex, cueIndex, filename: track.filename });
      });
    });
    cues.sort((a, b) => a.startMs - b.startMs || a.sourceIndex - b.sourceIndex || a.cueIndex - b.cueIndex);
    return cues;
  }
  // Half-open intervals [start, end): cues touching at an endpoint do not overlap.
  function overlapStats(cues) {
    let groups = 0, overlappingCues = 0, clusterSize = 0, end = -1;
    for (const cue of cues) {
      if (cue.startMs < end) { clusterSize++; end = Math.max(end, cue.endMs); }
      else {
        if (clusterSize > 1) { groups++; overlappingCues += clusterSize; }
        clusterSize = 1; end = cue.endMs;
      }
    }
    if (clusterSize > 1) { groups++; overlappingCues += clusterSize; }
    return { groups, overlappingCues };
  }
  function formatTimestamp(ms, separator = '.') {
    if (!Number.isSafeInteger(ms) || ms < 0) throw new Error('Expected non-negative integer milliseconds.');
    const hour = Math.floor(ms / 3600000), minute = Math.floor(ms / 60000) % 60, second = Math.floor(ms / 1000) % 60;
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}${separator}${String(ms % 1000).padStart(3, '0')}`;
  }
  function toText(cues) {
    return cues.map(cue => `[${formatTimestamp(cue.startMs)} → ${formatTimestamp(cue.endMs)}] ${cue.speaker}:\n${cue.text}`).join('\n\n') + '\n';
  }
  function escapeMarkdown(value) {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/([\\`*_{}\[\]()#+.!|~-])/g, '\\$1');
  }
  function toMarkdown(cues) {
    return '# Merged transcript\n\n' + cues.map(cue => `**${escapeMarkdown(cue.speaker)}** · ${formatTimestamp(cue.startMs)} → ${formatTimestamp(cue.endMs)}\n\n${cue.text.split('\n').map(line => '> ' + escapeMarkdown(line)).join('\n')}`).join('\n\n') + '\n';
  }
  function toSrt(cues) {
    return cues.map((cue, i) => `${i + 1}\n${formatTimestamp(cue.startMs, ',')} --> ${formatTimestamp(cue.endMs, ',')}\n${cue.speaker}: ${cue.text}`).join('\n\n') + '\n';
  }
  function toArchive(tracks, cues) {
    return JSON.stringify({ schemaVersion: 1, timeUnit: 'milliseconds', intervalConvention: '[start,end)', tieOrder: 'start time, input file order, source cue order', tracks: tracks.map(track => ({ filename: track.filename, speaker: track.speaker, offsetMs: track.offsetMs || 0, format: track.format, sourceText: track.sourceText, metadata: track.metadata, cues: track.cues })), mergedCues: cues }, null, 2) + '\n';
  }
  return Object.freeze({ SubtitleError, timestamp, parseSubtitles, parseOffset, defaultSpeaker, mergeTracks, overlapStats, formatTimestamp, toText, toMarkdown, toSrt, toArchive });
});
