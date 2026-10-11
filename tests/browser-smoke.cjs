'use strict';
// Optional QA only: npm install --no-save playwright; npx playwright install chromium
// Or point PLAYWRIGHT_MODULE / CHROMIUM_PATH at existing local installations.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
const C = require('../core.js');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'test-results');
const fileUrl = pathToFileURL(path.join(root, 'index.html')).href;
const sample = '1\n00:00:01,000 --> 00:00:02,000\nHello 世界\n';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1200 }, acceptDownloads: true });
    const page = await context.newPage();
    const errors = [], network = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', request => { if (/^https?:/i.test(request.url())) network.push(request.url()); });
    await page.goto(fileUrl);
    await page.getByRole('button', { name: 'Try an example' }).click();
    await page.locator('.badge.ready').waitFor();
    assert.equal(await page.locator('#cue-count').textContent(), '6');
    assert.equal(await page.locator('#speaker-count').textContent(), '2');
    assert.equal(await page.locator('#overlap-count').textContent(), '2');
    assert.match(await page.locator('#preview').textContent(), /可以/);
    await page.screenshot({ path: path.join(output, 'desktop.png'), fullPage: true });
    for (const [format, button] of [['text', 'Download TXT'], ['markdown', 'Markdown'], ['srt', 'SRT'], ['json', 'JSON archive']]) {
      const downloadPromise = page.waitForEvent('download');
      await page.getByRole('button', { name: button, exact: true }).click();
      const download = await downloadPromise;
      const target = path.join(output, download.suggestedFilename());
      await download.saveAs(target);
      const content = await fs.readFile(target, 'utf8');
      assert.ok(content.includes('Alex') && content.includes('小林'));
      if (format === 'srt') assert.equal(C.parseSubtitles(content).cues.length, 6);
      if (format === 'json') assert.equal(JSON.parse(content).mergedCues.length, 6);
    }
    await page.getByRole('button', { name: 'Try an example' }).click();
    assert.equal(await page.locator('.track').count(), 2, 'Repeated demo must not replace or duplicate files');
    await page.getByRole('textbox', { name: 'Offset (seconds) for Alex.srt', exact: true }).fill('-1.001');
    assert.equal(await page.getByRole('button', { name: 'Download TXT' }).isDisabled(), true);
    assert.match(await page.locator('.track-error:visible').textContent(), /never clipped or dropped/);
    await page.getByRole('textbox', { name: 'Offset (seconds) for Alex.srt', exact: true }).fill('0.500');
    assert.match(await page.locator('#preview').textContent(), /00:00:01.500/);
    await page.getByRole('textbox', { name: 'Speaker label for Alex.srt', exact: true }).fill('<img src=x onerror=alert(1)>');
    assert.equal(await page.locator('#preview img').count(), 0, 'Untrusted labels must be text, never HTML');
    await page.getByRole('textbox', { name: 'Speaker label for Alex.srt', exact: true }).fill('Alex');
    await page.locator('#preview-format').selectOption('srt');
    assert.match(await page.locator('#preview').textContent(), /1\n00:00:01,500/);
    await page.getByRole('button', { name: 'Clear all', exact: true }).click();
    assert.equal(await page.locator('.track').count(), 0);
    assert.equal(await page.locator('#empty-state').isVisible(), true);

    await page.locator('#file-input').setInputFiles([
      { name: 'UTF8.srt', mimeType: 'text/plain', buffer: Buffer.from('\ufeff' + sample) },
      { name: 'bad.srt', mimeType: 'text/plain', buffer: Buffer.from([0xff, 0xfe, 0x31, 0]) }
    ]);
    await page.locator('.track-error:visible').waitFor();
    assert.match(await page.locator('.track-error:visible').textContent(), /not valid UTF-8/);
    assert.equal(await page.getByRole('button', { name: 'Download TXT' }).isDisabled(), true);
    await page.getByRole('button', { name: 'Remove bad.srt', exact: true }).click();
    await page.locator('.badge.ready').waitFor();
    assert.equal(await page.locator('#cue-count').textContent(), '1');
    await page.locator('#file-input').setInputFiles({ name: 'broken.srt', mimeType: 'text/plain', buffer: Buffer.from('1\n00:00:01,000 --> 00:00:00,000\nText') });
    await page.locator('.track-error:visible').waitFor();
    assert.match(await page.locator('.track-error:visible').textContent(), /end must be later/);
    await page.getByRole('button', { name: 'Clear all', exact: true }).click();

    // A removed in-flight file must not resurrect itself after File.arrayBuffer resolves.
    await page.evaluate(() => {
      window.originalArrayBuffer = File.prototype.arrayBuffer;
      File.prototype.arrayBuffer = async function () { await new Promise(resolve => setTimeout(resolve, 350)); return window.originalArrayBuffer.call(this); };
    });
    await page.locator('#file-input').setInputFiles({ name: 'slow.srt', mimeType: 'text/plain', buffer: Buffer.from(sample) });
    await page.getByRole('button', { name: 'Clear all', exact: true }).click();
    await sleep(450);
    assert.equal(await page.locator('.track').count(), 0);
    assert.equal(await page.locator('#empty-state').isVisible(), true);
    await page.evaluate(() => { File.prototype.arrayBuffer = window.originalArrayBuffer; });

    // Real file-drop flow, including explicit order at equal start times.
    await page.locator('#drop-zone').evaluate((zone, content) => {
      const data = new DataTransfer();
      data.items.add(new File([content], 'Left.srt', { type: 'text/plain' }));
      data.items.add(new File([content], 'Right.srt', { type: 'text/plain' }));
      zone.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }));
    }, sample);
    await page.locator('.badge.ready').waitFor();
    const preview = await page.locator('#preview').textContent();
    assert.ok(preview.indexOf('Left:') < preview.indexOf('Right:'));
    assert.equal(await page.locator('#cue-count').textContent(), '2');
    await page.getByRole('textbox', { name: 'Speaker label for Left.srt', exact: true }).fill('');
    assert.equal(await page.getByRole('button', { name: 'Download TXT' }).isDisabled(), true);
    await page.getByRole('button', { name: 'Remove Left.srt', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Download TXT' }).isEnabled(), true);

    await page.getByRole('button', { name: 'Clear all', exact: true }).click();
    await page.getByRole('button', { name: 'Try an example' }).click();
    await page.locator('#preview-format').selectOption('text');
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Mobile must not overflow horizontally');
    await page.screenshot({ path: path.join(output, 'mobile.png'), fullPage: true });
    assert.deepEqual(network, [], 'File-based app must make zero HTTP(S) requests');
    assert.deepEqual(errors, [], 'No browser exceptions or CSP errors');
    await context.close();
    console.log('Browser smoke passed: file:// launch, demo, four downloads, SRT reparse, labels, offsets, error recovery, invalid UTF-8, clear-during-read, drag/drop, tie ordering, no horizontal mobile overflow, zero HTTP(S) requests, zero browser errors.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
