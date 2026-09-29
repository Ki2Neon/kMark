import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname);
const artifactRoot = join(projectRoot, 'artifacts', 'tauri');
const fixture = join(projectRoot, 'tests', 'fixtures', 'documents', 'plantuml.md');
const runRoot = process.env.KMARK_E2E_RUN_ROOT ?? mkdtempSync(join(tmpdir(), 'kmark-e2e-'));
process.env.KMARK_E2E_RUN_ROOT = runRoot;
const outputDir = join(artifactRoot, '_service', basename(runRoot));
const workspaceDir = join(runRoot, 'workspace');
mkdirSync(workspaceDir, { recursive: true });
const appConfigDir = join(runRoot, 'app-config');
const webviewDataDir = join(runRoot, 'webview2');
mkdirSync(appConfigDir, { recursive: true });
mkdirSync(webviewDataDir, { recursive: true });
const documentPath = join(workspaceDir, 'document.md');
if (!existsSync(documentPath)) {
  copyFileSync(fixture, documentPath);
}
const binary = resolve(process.env.KMARK_E2E_APP_BINARY ?? join(projectRoot, 'target', 'debug', process.platform === 'win32' ? 'kmark.exe' : 'kmark'));
let startedWorkers = 0;

function safeName(name) {
  return name.replace(/[^a-z0-9-_]+/giu, '-').replace(/^-+|-+$/gu, '').slice(0, 90) || 'unnamed';
}

function readServiceLogs() {
  const entries = existsSync(outputDir) ? readdirSync(outputDir, { recursive: true, withFileTypes: true }) : [];
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.log'))
    .flatMap((entry) => {
      try {
        return readFileSync(join(entry.parentPath, entry.name), 'utf8').split(/\r?\n/u);
      } catch {
        return [];
      }
    });
}

async function writeFailureArtifact(test, error) {
  const folder = join(artifactRoot, safeName(test.fullTitle || test.title));
  mkdirSync(folder, { recursive: true });
  const state = await browser.executeAsync((done) => {
    window.__TAURI__.core.invoke('get_e2e_debug_snapshot').then(done, (reason) => done({ diagnosticError: String(reason) }));
  }).catch((reason) => ({ diagnosticError: String(reason) }));
  let frontendLogs = [];
  try {
    frontendLogs = await browser.getLogs('browser');
  } catch {
    // The service's forwarded console log remains available in its log files.
  }
  const serviceLogs = readServiceLogs();
  const frontendLogLines = serviceLogs.filter((line) => /\[Tauri:Frontend(?::[^\]]+)?\]/u.test(line));
  const backendLogLines = serviceLogs.filter((line) => /\[Tauri:Backend(?::[^\]]+)?\]/u.test(line));
  const lastIpcLine = [...serviceLogs].reverse().find((line) => line.includes('[kmark:ipc]'));
  const lastIpcCommand = lastIpcLine?.match(/command=([a-z_]+)|"command":"([a-z_]+)"/u)?.slice(1).find(Boolean) ?? null;
  const backendErrors = backendLogLines.filter((line) => line.includes('[kmark:ipc] error'));
  const frontendErrorCount = frontendLogs.filter((entry) => entry.level === 'SEVERE').length
    + frontendLogLines.filter((line) => /\b(?:ERROR|Uncaught|Unhandled)\b|\[kmark:ipc\] error/iu.test(line)).length;
  await browser.saveScreenshot(join(folder, 'screenshot.png')).catch(() => undefined);
  writeFileSync(join(folder, 'dom.html'), await browser.getPageSource().catch(() => ''), 'utf8');
  writeFileSync(join(folder, 'state.json'), JSON.stringify({ ...state, lastIpcCommand, backendErrors }, null, 2), 'utf8');
  writeFileSync(join(folder, 'frontend.log'), [...frontendLogLines, ...frontendLogs.map((entry) => JSON.stringify(entry))].join('\n'), 'utf8');
  writeFileSync(join(folder, 'backend.log'), backendLogLines.join('\n'), 'utf8');
  writeFileSync(join(folder, 'test-result.json'), JSON.stringify({
    test: test.fullTitle || test.title,
    error: error?.message ?? 'unknown failure',
    sessionId: state?.sessionId ?? null,
    documentRevision: state?.documentRevision ?? null,
    previewRevision: state?.previewRevision ?? null,
    lastOperationId: state?.lastOperationId ?? null,
    lastOperationRevision: state?.lastOperationRevision ?? null,
    lastIpcCommand,
    dirty: state?.dirty ?? null,
    pendingJobs: state?.pendingJobs ?? null,
    activeDocument: state?.activeDocument ?? null,
    frontendErrorCount,
    backendErrors,
  }, null, 2), 'utf8');
  if (existsSync(documentPath)) {
    copyFileSync(documentPath, join(folder, 'document.md'));
  }
}

export const config = {
  runner: 'local',
  specs: ['./tests/tauri/*.e2e.mjs'],
  suites: { smoke: ['./tests/tauri/critical-path.e2e.mjs'] },
  maxInstances: 1,
  logLevel: 'info',
  outputDir,
  waitforTimeout: 20_000,
  connectionRetryTimeout: 90_000,
  connectionRetryCount: 0,
  framework: 'mocha',
  mochaOpts: { timeout: 120_000 },
  reporters: ['spec'],
  services: [['@wdio/tauri-service', {
    appBinaryPath: binary,
    appArgs: [documentPath],
    env: {
      KMARK_E2E_DATA_DIR: appConfigDir,
      WEBVIEW2_USER_DATA_FOLDER: webviewDataDir,
    },
    driverProvider: 'embedded',
    autoDownloadEdgeDriver: true,
    captureBackendLogs: true,
    captureFrontendLogs: true,
    backendLogLevel: 'debug',
    frontendLogLevel: 'debug',
    startTimeout: 90_000,
  }]],
  capabilities: [{
    browserName: 'tauri',
    'tauri:options': { application: binary, args: [documentPath] },
  }],
  onWorkerStart() {
    startedWorkers += 1;
  },
  async afterTest(test, _context, { error }) {
    if (error) {
      await writeFailureArtifact(test, error);
    }
  },
  onComplete() {
    if (startedWorkers === 0) {
      throw new Error('Tauri E2E ran zero WebdriverIO workers');
    }
  },
};
