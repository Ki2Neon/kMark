import assert from 'node:assert/strict';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Key } from 'webdriverio';

const workspaceDir = join(process.env.KMARK_E2E_RUN_ROOT, 'workspace');
const documentPath = join(workspaceDir, 'document.md');
const editorSelector = '[aria-label="Markdown エディター"]';
const previewSelector = '.kmark-persistent-generated-svg-block svg';

async function diagnostic() {
  return browser.executeAsync((done) => {
    window.__TAURI__.core.invoke('get_e2e_debug_snapshot').then(done, (reason) => done({ diagnosticError: String(reason) }));
  });
}

async function editorDraft() {
  return browser.executeAsync((done) => {
    window.__TAURI__.core.invoke('get_editor_draft').then(done, (reason) => done({ diagnosticError: String(reason) }));
  });
}

async function waitForState(label, condition, timeout = 30_000) {
  let current = null;
  try {
    await browser.waitUntil(async () => {
      current = await diagnostic();
      return condition(current);
    }, { timeout, interval: 100, timeoutMsg: label });
  } catch (error) {
    throw new Error(`${label}: state=${JSON.stringify(current)}`, { cause: error });
  }
  return current;
}

async function waitForDom(label, condition, timeout = 30_000) {
  let current = null;
  try {
    await browser.waitUntil(async () => {
      current = await browser.execute(condition);
      return Boolean(current);
    }, { timeout, interval: 100, timeoutMsg: label });
  } catch (error) {
    throw new Error(`${label}: result=${JSON.stringify(current)} state=${JSON.stringify(await diagnostic())}`, { cause: error });
  }
}

async function editorText() {
  return browser.execute((selector) => document.querySelector(selector)?.textContent ?? null, editorSelector);
}

async function insertAtEndOfLine(lineIndex, text) {
  const inserted = await browser.execute((selector, index, value) => {
    const editor = document.querySelector(selector);
    const line = editor?.querySelectorAll('.cm-line')[index];
    if (!editor || !line) throw new Error(`editor line ${index} missing`);
    editor.focus();
    const range = document.createRange();
    range.selectNodeContents(line);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    return document.execCommand('insertText', false, value);
  }, editorSelector, lineIndex, text);
  assert.equal(inserted, true, `WebView2 could not insert text at editor line ${lineIndex}`);
}

async function editAtDocumentStart(text) {
  await insertAtEndOfLine(0, text);
}

async function editFirstDiagram(text) {
  await insertAtEndOfLine(4, text);
}

describe('real Tauri critical path', () => {
  it('opens, edits, previews, saves, reloads and reports Rust errors through WebView2', async () => {
    await $(editorSelector).waitForDisplayed();
    await browser.execute((selector) => document.querySelector(selector)?.focus(), editorSelector);
    await browser.keys([Key.Ctrl, 'f']);
    await waitForDom('Ctrl+F did not open Edit search in WebView2', () => document.querySelector('.section--edit .cm-search input[name="search"]') !== null);
    await browser.keys([Key.Escape]);
    await waitForDom('Edit search panel did not close', () => document.querySelector('.section--edit .cm-search') === null);
    await browser.execute((selector) => document.querySelector(selector)?.focus(), editorSelector);
    await browser.keys([Key.Ctrl, Key.Shift, 'f']);
    await waitForDom('Ctrl+Shift+F did not open Edit replace in WebView2', () => document.querySelector('.section--edit .cm-search input[name="replace"]') !== null);
    await browser.keys([Key.Escape]);
    await waitForDom('Edit replace panel did not close', () => document.querySelector('.section--edit .cm-search') === null);
    await browser.keys([Key.Ctrl, Key.Shift, 'b']);
    const shortcutMenu = await $('[role="dialog"][aria-label="メニュー"]');
    await shortcutMenu.waitForDisplayed();
    await browser.execute(() => {
      const toggle = document.querySelector('input[aria-label="行番号の表示を切り替え"]');
      if (toggle instanceof HTMLInputElement && !toggle.checked) toggle.click();
    });
    await browser.keys([Key.Escape]);
    await waitForDom('Edit line numbers did not appear', () => document.querySelector('.cm-lineNumbers .cm-gutterElement') !== null);
    await $('.cm-lineNumbers .cm-gutterElement').click();
    await browser.keys([Key.Ctrl, 'f']);
    await waitForDom('Ctrl+F from line numbers did not open Edit search', () => document.querySelector('.section--edit .cm-search input[name="search"]') !== null);
    await browser.keys([Key.Escape]);
    await waitForDom('Edit search panel did not close after gutter shortcut', () => document.querySelector('.section--edit .cm-search') === null);
    await $('.cm-lineNumbers .cm-gutterElement').click();
    await browser.keys([Key.Ctrl, Key.Shift, 'f']);
    await waitForDom('Ctrl+Shift+F from line numbers did not open Edit replace', () => document.querySelector('.section--edit .cm-search input[name="replace"]') !== null);
    await browser.keys([Key.Escape]);
    await waitForDom('Edit replace panel did not close after gutter shortcut', () => document.querySelector('.section--edit .cm-search') === null);
    const opened = await waitForState('startup file not registered in Rust', (state) => state.activeDocument === documentPath);
    assert.equal(opened.appConfigDir, join(process.env.KMARK_E2E_RUN_ROOT, 'app-config'), 'E2E app state is not isolated in the temporary workspace');
    assert.equal(opened.documentRevision, 1);
    assert.equal(opened.dirty, false);
    assert.match(await editorText(), /Diagram fixture/u);
    await waitForDom('React preview missing first PlantUML SVG', () => document.querySelectorAll('.kmark-persistent-generated-svg-block svg').length === 2, 60_000);
    const unchangedDiagram = (await $$(previewSelector))[1];

    await editAtDocumentStart('!');
    const edited = await waitForState('UI edit did not reach Rust EditorSession', (state) => state.documentRevision > opened.documentRevision && state.dirty === true);
    assert.ok(edited.lastOperationId, 'Rust did not expose the applied batch operation ID');
    assert.equal(edited.lastOperationRevision, edited.documentRevision, 'Rust operation revision does not match edited document');
    assert.match(await editorText(), /Diagram fixture!/u);
    await waitForDom('preview did not render edited Markdown', () => document.querySelector('.section--preview h1')?.textContent?.includes('Diagram fixture!'));
    await waitForState('Rust preview cache did not reach edited revision', (state) => state.previewRevision === edited.documentRevision);

    await editFirstDiagram('!');
    const diagramRevision = await waitForState('PlantUML edit did not reach Rust', (state) => state.documentRevision > edited.documentRevision);
    await waitForDom('PlantUML SVG was not updated', () => document.querySelectorAll('.kmark-persistent-generated-svg-block svg')[0]?.textContent?.includes('first!'), 60_000);
    assert.equal(await browser.execute(() => document.querySelectorAll('.kmark-persistent-generated-svg-block svg')[1]?.textContent?.includes('second')), true);
    assert.equal(await unchangedDiagram.isEqual((await $$(previewSelector))[1]), true, 'Unchanged PlantUML SVG lost DOM identity');

    await browser.keys([Key.Ctrl, 'z']);
    const undone = await waitForState('Undo did not update Rust revision', (state) => state.documentRevision > diagramRevision.documentRevision);
    assert.doesNotMatch(await editorText(), /first!/u);
    await browser.keys([Key.Ctrl, 'y']);
    const redone = await waitForState('Redo did not update Rust revision', (state) => state.documentRevision > undone.documentRevision);
    assert.match(await editorText(), /first!/u);

    await browser.keys([Key.Ctrl, 's']);
    await waitForState('Save did not clear Rust dirty state', (state) => state.documentRevision >= redone.documentRevision && state.dirty === false);
    const savedContent = readFileSync(documentPath, 'utf8');
    assert.match(savedContent, /Diagram fixture!/u);
    assert.match(savedContent, /first!/u);
    assert.equal(await $('[role="status"]').getAttribute('data-visible'), 'false');

    let observedDraft = null;
    const canonicalSavedContent = savedContent.replace(/\r\n/gu, '\n');
    const savedLineEnding = savedContent.includes('\r\n') ? 'crlf' : 'lf';
    try {
      await browser.waitUntil(async () => {
        observedDraft = await editorDraft();
        return observedDraft?.filePath === documentPath
          && observedDraft?.content === canonicalSavedContent
          && observedDraft?.lineEnding === savedLineEnding;
      }, { timeout: 10_000, interval: 100, timeoutMsg: 'Saved document was not persisted as the editor draft' });
    } catch (error) {
      const draftContent = typeof observedDraft?.content === 'string' ? observedDraft.content : null;
      throw new Error(`Saved draft mismatch: ${JSON.stringify({
        draftPath: observedDraft?.filePath,
        expectedPath: documentPath,
        draftLength: draftContent?.length,
        savedLength: savedContent.length,
        draftLineEnding: observedDraft?.lineEnding,
        savedLineEnding,
        draftCrlfCount: draftContent?.match(/\r\n/gu)?.length ?? 0,
        savedCrlfCount: savedContent.match(/\r\n/gu)?.length ?? 0,
        normalizedContentEqual: draftContent?.replace(/\r\n/gu, '\n') === savedContent.replace(/\r\n/gu, '\n'),
      })}`, { cause: error });
    }

    const cleanExternalContent = `${savedContent}\nexternal-clean-marker\n`;
    writeFileSync(documentPath, cleanExternalContent, 'utf8');
    await waitForDom('Saved document did not reload an external edit', () => document.querySelector('[aria-label="Markdown エディター"]')?.textContent?.includes('external-clean-marker'));
    await waitForState('External reload marked the saved document dirty', (state) => state.dirty === false);

    await editAtDocumentStart('LOCAL-');
    await waitForState('Local edit before external conflict was not dirty', (state) => state.dirty === true);
    const discardedDiskContent = `${cleanExternalContent}\nexternal-discard-marker\n`;
    writeFileSync(documentPath, discardedDiskContent, 'utf8');
    await $('.external-file-conflict-dialog[role="alertdialog"]').waitForDisplayed();
    await $('.external-file-conflict-dialog__discard').click();
    await waitForDom('Discard did not load the external document', () => {
      const content = document.querySelector('[aria-label="Markdown エディター"]')?.textContent ?? '';
      return content.includes('external-discard-marker') && !content.includes('LOCAL-');
    });
    await waitForState('Discard did not clear dirty state', (state) => state.dirty === false);

    await editAtDocumentStart('OVERWRITE-');
    await waitForState('Local edit before overwrite was not dirty', (state) => state.dirty === true);
    writeFileSync(documentPath, `${discardedDiskContent}\nexternal-overwrite-marker\n`, 'utf8');
    await $('.external-file-conflict-dialog[role="alertdialog"]').waitForDisplayed();
    await $('.external-file-conflict-dialog__overwrite').click();
    await waitForState('Confirmed overwrite did not save the local document', (state) => state.dirty === false);
    assert.match(readFileSync(documentPath, 'utf8'), /OVERWRITE-/u);
    assert.doesNotMatch(readFileSync(documentPath, 'utf8'), /external-overwrite-marker/u);

    await browser.keys([Key.Ctrl, 'n']);
    const closed = await waitForState('UI did not close the saved document', (state) => state.activeDocument === null && state.dirty === false);
    assert.notEqual(closed.sessionId, opened.sessionId, 'New document reused the saved Rust session');
    await browser.keys([Key.Ctrl, Key.Shift, 'b']);
    const menu = await $('[role="dialog"][aria-label="メニュー"]');
    await menu.waitForDisplayed();
    await menu.$('button=最近開いたファイル').click();
    const recentFiles = await menu.$$('.menu-section__recent-item');
    const savedFile = await (async () => {
      for (const file of recentFiles) {
        if (await file.getAttribute('title') === documentPath) return file;
      }
      return null;
    })();
    assert.ok(savedFile, `Recent files menu did not contain saved path ${documentPath}`);
    await savedFile.click();
    const reopened = await waitForState('Reopened Tauri session did not reopen saved file', (state) => state.activeDocument === documentPath && state.dirty === false);
    assert.notEqual(reopened.sessionId, closed.sessionId, 'Reopen did not create a Rust document session');
    assert.match(await editorText(), /first!/u);

    renameSync(workspaceDir, join(process.env.KMARK_E2E_RUN_ROOT, 'unavailable'));
    await editAtDocumentStart('?');
    await waitForState('Final edit did not reach Rust before failure test', (state) => state.dirty === true);
    await browser.keys([Key.Ctrl, 's']);
    await $('[role="alert"]').waitForDisplayed();
    assert.match(await $('[role="alert"]').getText(), /保存|失敗|write|read markdown document/u);
    assert.equal((await diagnostic()).dirty, true, 'Failed Rust save cleared the dirty state');
  });
});
