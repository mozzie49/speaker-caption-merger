(function () {
  'use strict';
  const C = window.CaptionMerger;
  const $ = id => document.getElementById(id);
  const tracks = [];
  let nextId = 1;
  let merged = [];
  let validTracks = [];
  const MAX_FILE_BYTES = 10 * 1024 * 1024, MAX_TOTAL_BYTES = 25 * 1024 * 1024;
  const MAX_FILES = 100, MAX_CUES = 50000, PREVIEW_LIMIT = 100;
  const exportButtons = [...document.querySelectorAll('[data-export]')];
  const formats = { text: { name: 'merged-transcript.txt', type: 'text/plain;charset=utf-8', render: C.toText }, markdown: { name: 'merged-transcript.md', type: 'text/markdown;charset=utf-8', render: C.toMarkdown }, srt: { name: 'merged-speakers.srt', type: 'application/x-subrip;charset=utf-8', render: C.toSrt } };
  function status(text, failure = false) { $('input-status').textContent = text; $('input-status').classList.toggle('failure', failure); }
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function renderTrack(track) {
    const card = element('div', 'track'); card.dataset.trackId = track.id;
    const header = element('div', 'track-header'), name = element('div', 'track-file');
    const dot = element('span', 'track-dot'); dot.setAttribute('aria-hidden', 'true');
    name.append(dot, document.createTextNode(track.filename));
    const remove = element('button', 'remove', '×'); remove.type = 'button'; remove.setAttribute('aria-label', `Remove ${track.filename}`);
    remove.addEventListener('click', () => { const i = tracks.indexOf(track); if (i !== -1) tracks.splice(i, 1); card.remove(); recompute(); status('Source removed. Output updated.'); });
    header.append(name, remove); card.append(header);
    const fields = element('div', 'track-fields');
    for (const [kind, labelText, value] of [['speaker', 'Speaker label', track.speaker], ['offset', 'Offset (seconds)', track.offset]]) {
      const field = element('div', 'field'), label = element('label', '', labelText), input = element('input');
      input.id = `${kind}-${track.id}`; label.htmlFor = input.id; input.value = value; input.autocomplete = 'off'; input.spellcheck = false;
      input.setAttribute('aria-label', `${labelText} for ${track.filename}`);
      if (kind === 'offset') { input.inputMode = 'decimal'; input.placeholder = '0.000'; }
      input.addEventListener('input', () => { track[kind] = input.value; recompute(); });
      field.append(label, input); fields.append(field);
    }
    card.append(fields);
    const meta = element('p', 'track-meta', 'Reading locally…'); card.append(meta); track.metaNode = meta;
    const error = element('p', 'track-error'); error.hidden = true; card.append(error); track.errorNode = error;
    $('tracks').append(card);
  }
  function recompute() {
    merged = []; validTracks = [];
    exportButtons.forEach(button => button.disabled = true);
    $('track-tools').hidden = !tracks.length;
    $('results').hidden = !tracks.length;
    $('empty-state').hidden = !!tracks.length;
    $('preview').textContent = '';
    $('preview-note').textContent = '';
    $('warnings').replaceChildren();
    $('merge-error').hidden = true;
    $('ready-badge').className = 'badge';
    $('ready-badge').textContent = tracks.length ? 'Checking sources' : 'Waiting for files';
    $('cue-count').textContent = '0'; $('speaker-count').textContent = '0'; $('overlap-count').textContent = '0';
    if (!tracks.length) return;
    let blocked = false, loading = false;
    for (const track of tracks) {
      track.errorNode.hidden = true;
      if (track.loading) { loading = true; continue; }
      track.metaNode.textContent = track.parsed ? `${track.parsed.cues.length.toLocaleString()} cues · ${track.parsed.format.toUpperCase()} · UTF-8` : 'Needs attention';
      try {
        if (track.error) throw new Error(track.error);
        const candidate = { ...track.parsed, speaker: track.speaker, offsetMs: C.parseOffset(track.offset) };
        C.mergeTracks([candidate]);
        validTracks.push(candidate);
      } catch (error) { blocked = true; track.errorNode.textContent = error.message; track.errorNode.hidden = false; }
    }
    if (blocked || loading) {
      $('ready-badge').textContent = loading ? 'Reading files' : 'Fix source errors';
      $('ready-badge').classList.toggle('invalid', blocked);
      $('merge-error').textContent = loading ? 'Reading your files locally. Downloads will be ready after all sources are checked.' : 'Some sources need attention. Fix or remove them to export; no source is silently skipped.';
      $('merge-error').hidden = false;
      return;
    }
    try {
      const count = validTracks.reduce((sum, track) => sum + track.cues.length, 0);
      if (count > MAX_CUES) throw new Error(`This browser tool supports up to ${MAX_CUES.toLocaleString()} cues per merge. Your sources contain ${count.toLocaleString()}; split them into smaller time ranges first.`);
      merged = C.mergeTracks(validTracks);
    } catch (error) { $('merge-error').textContent = error.message; $('merge-error').hidden = false; $('ready-badge').textContent = 'Fix source errors'; $('ready-badge').classList.add('invalid'); return; }
    const overlap = C.overlapStats(merged);
    $('cue-count').textContent = merged.length.toLocaleString();
    const speakers = new Set(merged.map(cue => cue.speaker));
    $('speaker-count').textContent = speakers.size.toLocaleString();
    $('overlap-count').textContent = overlap.groups.toLocaleString();
    const notices = new Set(validTracks.flatMap(track => track.warnings));
    if (overlap.groups) notices.add(`${overlap.overlappingCues} cues in ${overlap.groups} overlapping time ${overlap.groups === 1 ? 'group' : 'groups'}. Every cue keeps its full interval; SRT player behavior varies.`);
    if (speakers.size < tracks.length) notices.add('Some files share a speaker label. They remain separate sources; cues are not deduplicated.');
    for (const notice of notices) $('warnings').append(element('p', '', notice));
    $('ready-badge').textContent = 'Ready to download'; $('ready-badge').classList.add('ready');
    exportButtons.forEach(button => button.disabled = false);
    renderPreview();
  }
  function renderPreview() {
    if (!merged.length) return;
    $('preview').textContent = formats[$('preview-format').value].render(merged.slice(0, PREVIEW_LIMIT));
    $('preview-note').textContent = merged.length > PREVIEW_LIMIT ? `Preview: first ${PREVIEW_LIMIT} of ${merged.length.toLocaleString()} cues. Downloads include all cues.` : `All ${merged.length} cues shown. Ties follow file order, then source cue order.`;
  }
  function finishTrack(track, input) {
    if (!tracks.includes(track)) return;
    try { track.parsed = C.parseSubtitles(input, { filename: track.filename }); }
    catch (error) { track.error = error.message; }
    track.loading = false; recompute();
  }
  async function addFiles(files) {
    const selected = Array.from(files);
    if (!selected.length) return;
    if (selected.length + tracks.length > MAX_FILES) { status(`Add at most ${MAX_FILES} files per merge. No files from this selection were added.`, true); return; }
    const size = selected.reduce((sum, file) => sum + file.size, 0) + tracks.reduce((sum, track) => sum + track.size, 0);
    if (size > MAX_TOTAL_BYTES) { status('The 25 MiB total limit would be exceeded. No files from this selection were added.', true); return; }
    const jobs = selected.map(file => {
      const track = { id: nextId++, filename: file.name, size: file.size, speaker: C.defaultSpeaker(file.name), offset: '0', loading: true };
      tracks.push(track); renderTrack(track);
      return { file, track };
    });
    recompute(); status(`Reading ${selected.length} ${selected.length === 1 ? 'file' : 'files'} on your device…`);
    await Promise.all(jobs.map(async ({ file, track }) => {
      try {
        if (!/\.(srt|vtt)$/i.test(file.name)) throw new Error('Use an .srt or .vtt file. Untimed TXT cannot be aligned.');
        if (file.size > MAX_FILE_BYTES) throw new Error('This file exceeds the 10 MiB limit. Split it into smaller timed files first.');
        const bytes = await file.arrayBuffer();
        if (!tracks.includes(track)) return;
        let input;
        try { input = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
        catch (_) { throw new Error('This file is not valid UTF-8. Re-export or save it as UTF-8 so characters are not silently replaced.'); }
        finishTrack(track, input);
      } catch (error) { if (tracks.includes(track)) { track.error = error.message; track.loading = false; recompute(); } }
    }));
    if (jobs.some(({ track }) => tracks.includes(track))) status('Files checked locally. Review speaker labels and offsets before downloading.');
  }
  $('file-input').addEventListener('change', event => { addFiles(event.target.files); event.target.value = ''; });
  $('preview-format').addEventListener('change', renderPreview);
  $('clear-button').addEventListener('click', () => { tracks.length = 0; $('tracks').replaceChildren(); recompute(); status('All sources cleared. Nothing is stored by this app.'); $('file-input').focus(); });
  $('demo-button').addEventListener('click', () => {
    if (tracks.length) { status('Clear your current sources before loading the example, so it cannot replace or mix with your files.', true); return; }
    for (const file of window.CaptionMergerDemo) {
      const track = { id: nextId++, filename: file.name, size: new TextEncoder().encode(file.text).length, speaker: C.defaultSpeaker(file.name), offset: '0', loading: true };
      tracks.push(track); renderTrack(track); finishTrack(track, file.text);
    }
    status('Synthetic two-speaker example loaded. Try an offset of 0.500 seconds.');
  });
  const drop = $('drop-zone'); let dragDepth = 0;
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(type => window.addEventListener(type, event => { if (event.dataTransfer && Array.from(event.dataTransfer.types).includes('Files')) event.preventDefault(); }));
  drop.addEventListener('dragenter', event => { event.preventDefault(); dragDepth++; drop.classList.add('dragging'); });
  drop.addEventListener('dragover', event => { event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'; });
  drop.addEventListener('dragleave', () => { dragDepth--; if (dragDepth <= 0) { dragDepth = 0; drop.classList.remove('dragging'); } });
  drop.addEventListener('drop', event => { event.preventDefault(); dragDepth = 0; drop.classList.remove('dragging'); if (event.dataTransfer) addFiles(event.dataTransfer.files); });
  exportButtons.forEach(button => button.addEventListener('click', () => {
    if (!merged.length || button.disabled) return;
    const key = button.dataset.export;
    const output = key === 'json' ? C.toArchive(validTracks, merged) : formats[key].render(merged);
    const file = key === 'json' ? { name: 'merged-caption-archive.json', type: 'application/json;charset=utf-8' } : formats[key];
    const url = URL.createObjectURL(new Blob([output], { type: file.type }));
    const link = document.createElement('a'); link.href = url; link.download = file.name; document.body.append(link); link.click(); link.remove();
    // Let the browser finish consuming the Blob URL before releasing it.
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    status(`Download prepared: ${file.name}. Check your browser’s downloads.`);
  }));
  recompute();
})();
