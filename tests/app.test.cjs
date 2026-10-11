'use strict';

// Dependency-free simulated DOM tests. These exercise app.js event handling and
// generated Blob contents, not a browser's layout, file picker, CSP or downloads.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const C = require('../core.js');
const demo = require('../demo.js');
const appSource = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

const srt = (text = 'Hello') => `1\n00:00:00,000 --> 00:00:01,000\n${text}\n`;
const settleReads = () => new Promise(resolve => setImmediate(resolve));

function deferredFile(name, text = srt(), bytes = new TextEncoder().encode(text)) {
  let resolve, reject;
  const pending = new Promise((res, rej) => { resolve = res; reject = rej; });
  return {
    name,
    size: bytes.byteLength,
    arrayBuffer: () => pending,
    finish: () => resolve(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)),
    fail: () => reject(new Error('Simulated file read failure.'))
  };
}

function createHarness() {
  const ids = new Map();
  const downloads = [], objectUrls = [], revokedUrls = [], timers = [];
  const forbiddenCalls = [];
  const forbid = name => function () {
    forbiddenCalls.push(name);
    throw new Error(`The simulated DOM forbids ${name}.`);
  };

  class Node {
    constructor(tagName = 'div', text = '') {
      this.tagName = tagName;
      this.children = [];
      this.parentNode = null;
      this.dataset = {};
      this.attributes = {};
      this.listeners = new Map();
      this.value = '';
      this.disabled = false;
      this.hidden = false;
      this._text = text;
      this._classes = new Set();
      this.classList = {
        add: (...names) => names.forEach(name => this._classes.add(name)),
        remove: (...names) => names.forEach(name => this._classes.delete(name)),
        contains: name => this._classes.has(name),
        toggle: (name, force) => {
          const add = force === undefined ? !this._classes.has(name) : force;
          if (add) this._classes.add(name); else this._classes.delete(name);
          return add;
        }
      };
    }
    set id(value) { this._id = value; ids.set(value, this); }
    get id() { return this._id; }
    set className(value) { this._classes = new Set(value.split(/\s+/).filter(Boolean)); }
    get className() { return [...this._classes].join(' '); }
    set textContent(value) {
      this.children.forEach(child => { child.parentNode = null; });
      this.children = [];
      this._text = String(value);
    }
    get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
    set innerHTML(value) { forbid('innerHTML')(value); }
    set outerHTML(value) { forbid('outerHTML')(value); }
    set src(value) { forbid('resource src')(value); }
    set href(value) {
      if (!String(value).startsWith('blob:')) forbid('non-Blob href')(value);
      this._href = value;
    }
    get href() { return this._href; }
    setAttribute(name, value) {
      if (/^on/i.test(name) || ['src', 'srcdoc'].includes(name)) forbid(`attribute ${name}`)(value);
      this.attributes[name] = value;
    }
    append(...children) {
      children.forEach(child => {
        child.remove();
        this.children.push(child);
        child.parentNode = this;
      });
    }
    replaceChildren(...children) { this.textContent = ''; this.append(...children); }
    remove() {
      if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(child => child !== this);
      this.parentNode = null;
    }
    addEventListener(type, listener) {
      if (!this.listeners.has(type)) this.listeners.set(type, []);
      this.listeners.get(type).push(listener);
    }
    dispatch(type, extra = {}) {
      const event = { target: this, preventDefault() {}, ...extra };
      for (const listener of this.listeners.get(type) || []) listener(event);
    }
    click() {
      if (this.disabled) return;
      if (this.tagName === 'a') downloads.push({ href: this.href, filename: this.download, attached: this.parentNode === document.body });
      this.dispatch('click');
    }
    focus() { document.activeElement = this; }
    insertAdjacentHTML(...args) { forbid('insertAdjacentHTML')(...args); }
  }

  const body = new Node('body');
  const document = {
    body,
    getElementById: id => ids.get(id),
    createElement: tagName => {
      if (['script', 'iframe', 'img', 'link', 'object', 'embed'].includes(tagName.toLowerCase())) forbid(`element ${tagName}`)();
      return new Node(tagName);
    },
    createTextNode: text => new Node('#text', text),
    write: forbid('document.write'),
    querySelectorAll: selector => {
      assert.equal(selector, '[data-export]');
      return buttons;
    }
  };
  for (const id of [
    'input-status', 'tracks', 'track-tools', 'results', 'empty-state', 'preview',
    'preview-note', 'warnings', 'merge-error', 'ready-badge', 'cue-count',
    'speaker-count', 'overlap-count', 'preview-format', 'file-input',
    'clear-button', 'demo-button', 'drop-zone'
  ]) {
    const node = new Node(); node.id = id; body.append(node);
  }
  ids.get('preview-format').value = 'text';
  const buttons = ['text', 'markdown', 'srt', 'json'].map(key => {
    const button = new Node('button'); button.dataset.export = key; body.append(button); return button;
  });
  const network = {
    fetch: forbid('fetch'),
    XMLHttpRequest: forbid('XMLHttpRequest'),
    WebSocket: forbid('WebSocket'),
    EventSource: forbid('EventSource'),
    navigator: { sendBeacon: forbid('sendBeacon') }
  };
  const window = Object.assign(new Node('window'), network, {
    CaptionMerger: C,
    CaptionMergerDemo: demo,
    setTimeout: (callback, delay) => { timers.push({ callback, delay }); return timers.length; }
  });
  const URL = {
    createObjectURL: blob => {
      const url = `blob:simulated-${objectUrls.length + 1}`;
      objectUrls.push({ url, blob }); return url;
    },
    revokeObjectURL: url => revokedUrls.push(url)
  };
  window.URL = URL;
  vm.runInNewContext(appSource, { window, document, URL, Blob, TextEncoder, TextDecoder, ...network }, { filename: 'app.js' });

  return {
    node: id => ids.get(id), buttons, downloads, objectUrls, revokedUrls, timers, forbiddenCalls,
    select(files) { const input = ids.get('file-input'); input.files = files; input.value = 'selected'; input.dispatch('change'); },
    clear() { ids.get('clear-button').click(); },
    remove(index = 0) { ids.get('tracks').children[index].children[0].children[1].click(); },
    export(key) { buttons.find(button => button.dataset.export === key).click(); },
    edit(id, value) { const input = ids.get(id); input.value = value; input.dispatch('input'); }
  };
}

test('simulated DOM: exports wait for every pending source, regardless of read completion order', async () => {
  const h = createHarness();
  const a = deferredFile('A.srt', srt('First')), b = deferredFile('B.srt', srt('Second'));
  h.select([a, b]);
  assert.equal(h.node('file-input').value, '');
  assert(h.buttons.every(button => button.disabled));
  b.finish(); await settleReads();
  assert(h.buttons.every(button => button.disabled));
  assert.equal(h.node('ready-badge').textContent, 'Reading files');
  h.export('srt'); assert.equal(h.objectUrls.length, 0);
  a.finish(); await settleReads();
  assert(h.buttons.every(button => !button.disabled));
  assert.equal(h.node('cue-count').textContent, '2');
  assert(h.node('preview').textContent.indexOf('A:') < h.node('preview').textContent.indexOf('B:'));
});

test('simulated DOM: clear/reselect ignores stale successful reads', async () => {
  const h = createHarness();
  const old = deferredFile('Old.srt'), current = deferredFile('Current.srt');
  h.select([old]); h.clear(); h.select([current]);
  old.finish(); await settleReads();
  assert.equal(h.node('tracks').children.length, 1);
  assert(h.buttons.every(button => button.disabled));
  assert.equal(h.node('input-status').textContent, 'Reading 1 file on your device…');
  current.finish(); await settleReads();
  assert.equal(h.node('cue-count').textContent, '1');
  assert.match(h.node('preview').textContent, /Current:/);
  assert.doesNotMatch(h.node('preview').textContent, /Old:/);
});

test('simulated DOM: clear/reselect ignores stale failed reads', async () => {
  const h = createHarness();
  const old = deferredFile('Old.srt'), current = deferredFile('Current.srt');
  h.select([old]); h.clear(); h.select([current]);
  current.finish(); await settleReads();
  old.fail(); await settleReads();
  assert.equal(h.node('tracks').children.length, 1);
  assert(h.buttons.every(button => !button.disabled));
  assert.equal(h.node('merge-error').hidden, true);
  assert.equal(h.node('cue-count').textContent, '1');
});

test('simulated DOM: removing a pending source never resurrects it', async () => {
  for (const outcome of ['finish', 'fail']) {
    const h = createHarness();
    const file = deferredFile('Removed.srt');
    h.select([file]); h.remove(); file[outcome](); await settleReads();
    assert.equal(h.node('tracks').children.length, 0);
    assert.equal(h.node('results').hidden, true);
    assert.equal(h.node('empty-state').hidden, false);
    assert.equal(h.node('preview').textContent, '');
    assert(h.buttons.every(button => button.disabled));
  }
});

test('simulated DOM: invalid sources block all exports until explicitly removed', async () => {
  const h = createHarness();
  const good = deferredFile('Good.srt'), bad = deferredFile('Bad.srt', 'Untimed content');
  h.select([good, bad]); good.finish(); bad.finish(); await settleReads();
  assert(h.buttons.every(button => button.disabled));
  assert.equal(h.node('ready-badge').textContent, 'Fix source errors');
  assert.equal(h.node('merge-error').hidden, false);
  h.remove(1);
  assert(h.buttons.every(button => !button.disabled));
  assert.equal(h.node('cue-count').textContent, '1');
});

test('simulated DOM: malformed UTF-8 is rejected rather than replaced', async () => {
  const h = createHarness();
  const bad = deferredFile('Invalid.srt', '', Uint8Array.from([0xc3, 0x28]));
  h.select([bad]); bad.finish(); await settleReads();
  assert(h.buttons.every(button => button.disabled));
  assert.match(h.node('tracks').textContent, /not valid UTF-8/);
});

test('simulated DOM: SRT Blob contains all cues beyond the preview and its URL is released later', async () => {
  const h = createHarness();
  const source = Array.from({ length: 105 }, (_, i) => `${i + 1}\n00:00:00,000 --> 00:00:01,000\nCue ${i + 1}`).join('\n\n') + '\n';
  const file = deferredFile('Speaker.srt', source);
  h.select([file]); file.finish(); await settleReads();
  assert.match(h.node('preview-note').textContent, /first 100 of 105/);
  assert.doesNotMatch(h.node('preview').textContent, /Cue 105/);
  h.export('srt');
  assert.equal(h.objectUrls.length, 1);
  const output = await h.objectUrls[0].blob.text();
  assert.equal(C.parseSubtitles(output).cues.length, 105);
  assert.match(output, /Speaker: Cue 105/);
  assert.equal(h.objectUrls[0].blob.type, 'application/x-subrip;charset=utf-8');
  assert.deepEqual(h.downloads, [{ href: h.objectUrls[0].url, filename: 'merged-speakers.srt', attached: true }]);
  assert.equal(h.revokedUrls.length, 0);
  assert.equal(h.timers.length, 1);
  assert.equal(h.timers[0].delay, 60000);
  h.timers[0].callback();
  assert.deepEqual(h.revokedUrls, [h.objectUrls[0].url]);
});

test('simulated DOM: editing offsets or labels invalidates stale output and then recovers', async () => {
  const h = createHarness();
  const file = deferredFile('Speaker.srt');
  h.select([file]); file.finish(); await settleReads();
  h.edit('offset-1', '-0.001');
  assert(h.buttons.every(button => button.disabled));
  assert.equal(h.node('preview').textContent, '');
  h.edit('offset-1', '0.500');
  assert(h.buttons.every(button => !button.disabled));
  assert.match(h.node('preview').textContent, /00:00:00\.500/);
  h.edit('speaker-1', ''); assert(h.buttons.every(button => button.disabled));
  h.edit('speaker-1', 'Renamed'); assert(h.buttons.every(button => !button.disabled));
  assert.match(h.node('preview').textContent, /Renamed:/);
});

test('simulated DOM: hostile filename, label and cue text remain inert with no network calls', async () => {
  const h = createHarness();
  const text = '<script>alert(1)</script>\n<img src=https://example.invalid/x onerror=alert(2)>';
  const file = deferredFile('<img src=x onerror=alert(3)>.srt', srt(text));
  h.select([file]); file.finish(); await settleReads();
  h.edit('speaker-1', '<b onclick=alert(4)>Voice</b>');
  assert(h.buttons.every(button => !button.disabled));
  assert.match(h.node('preview').textContent, /<script>alert\(1\)<\/script>/);
  assert.match(h.node('preview').textContent, /<b onclick=alert\(4\)>Voice<\/b>/);
  for (const format of ['text', 'markdown', 'srt', 'json']) h.export(format);
  assert.equal(h.objectUrls.length, 4);
  const archive = JSON.parse(await h.objectUrls[3].blob.text());
  assert.equal(archive.tracks[0].sourceText, srt(text));
  assert.deepEqual(h.forbiddenCalls, []);
});

test('simulated DOM: demo cannot overwrite current sources and clears without unsafe effects', async () => {
  const h = createHarness();
  const file = deferredFile('Existing.srt');
  h.select([file]); h.node('demo-button').click();
  assert.equal(h.node('tracks').children.length, 1);
  assert.match(h.node('input-status').textContent, /Clear your current sources/);
  h.clear(); h.node('demo-button').click();
  assert.equal(h.node('tracks').children.length, demo.length);
  assert(h.buttons.every(button => !button.disabled));
  file.finish(); await settleReads();
  assert.equal(h.node('tracks').children.length, demo.length);
  h.clear();
  assert.equal(h.node('tracks').children.length, 0);
  assert.equal(h.node('preview').textContent, '');
  assert.deepEqual(h.forbiddenCalls, []);
});
