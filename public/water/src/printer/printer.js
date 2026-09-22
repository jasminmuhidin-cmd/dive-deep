// ---------------------------------------------------------------------------
// printer.js — turns a thought into a physical artefact.
// Canvas compositing of receipt.png lives in electron/main.js (keeps participant
// drawing rules: no fillText/strokeText in src/ outside debug overlays).
// ---------------------------------------------------------------------------
import * as C from '../config/constants.js';
import { PUBLIC_APP_URL, resolveApiBase } from '../config/urls.js';

let statusHandler = () => {};
let printedCount = 0;
let warnedFallback = false;

export function setPrinterStatusHandler(fn) {
  statusHandler = typeof fn === 'function' ? fn : () => {};
}

export function wrapText(text, width) {
  const lines = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const test = line ? `${line} ${word}` : word;
    if (line && test.length > width) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

const center = (s, width) => ' '.repeat(Math.max(0, Math.floor((width - s.length) / 2))) + s;

export function formatReceipt(thought, width = C.PRINT_LINE_WIDTH) {
  const wave = center('~   ~   ~   ~   ~', width);
  const body = wrapText(thought.text, width - 4).map((l) => center(l, width));
  const code = thought.anonymousCode || thought.id?.slice?.(0, 8) || '';
  const lines = [
    '',
    wave,
    '',
    ...body,
    '',
    center(`feeling: ${thought.feelingTag || 'quiet'}`, width),
    code ? center(`code: ${code}`, width) : '',
    '',
    wave,
    '',
    '',
    '',
  ];
  return { lines, plainText: lines.join('\n') };
}

const mockBackend = {
  name: 'mock',
  async print(job) {
    const bar = '-'.repeat(C.PRINT_LINE_WIDTH + 1);
    console.log(
      `[printer:mock] ${job.id}\n+${bar}+\n${job.lines.map((l) => `| ${l.padEnd(C.PRINT_LINE_WIDTH)}|`).join('\n')}\n+${bar}+`,
    );
    await new Promise((r) => setTimeout(r, C.MOCK_PRINT_DELAY * 1000));
    return {};
  },
};

const electronBackend = {
  name: 'electron',
  async print(job) {
    return window.installation.printThought(job);
  },
};

function chooseBackend() {
  if (C.PRINTER_MODE === 'electron') {
    if (
      typeof window !== 'undefined' &&
      typeof window.installation?.printThought === 'function'
    ) {
      return electronBackend;
    }
    if (!warnedFallback) {
      console.warn(
        '[printer] electron printer bridge not available — using mock.',
      );
      warnedFallback = true;
    }
  }
  return mockBackend;
}

/**
 * Print one thought. Always resolves: { ok, backend, error? }.
 */
export async function printThought(thought) {
  const backend = chooseBackend();
  const { lines, plainText } = formatReceipt(thought);

  const job = {
    id: thought.id,
    text: thought.text,
    feelingTag: thought.feelingTag,
    anonymousCode: thought.anonymousCode || null,
    lines,
    plainText,
    archiveUrl: `${PUBLIC_APP_URL}/gallery?id=${encodeURIComponent(thought.id)}`,
    apiBase: resolveApiBase(),
    receiptTemplateRelative: 'assets/branding/receipt.png',
  };

  statusHandler({
    mode: backend.name,
    status: 'printing',
    lastJobId: job.id,
    lastReceipt: plainText,
  });
  try {
    await backend.print(job);
    printedCount++;
    statusHandler({ status: 'idle', lastResult: 'ok', count: printedCount });
    return { ok: true, backend: backend.name };
  } catch (err) {
    const error = String(err?.message ?? err);
    console.error('[printer] print failed:', error);
    statusHandler({ status: 'error', lastResult: `failed: ${error}` });
    return { ok: false, backend: backend.name, error };
  }
}
