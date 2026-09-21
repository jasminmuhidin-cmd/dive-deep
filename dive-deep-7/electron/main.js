// Electron main process — window + printer IPC (receipt.png composite + MX06 attempt).
const { app, BrowserWindow, session, systemPreferences, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const kiosk = process.argv.includes('--kiosk') || process.env.INSTALLATION === '1';

app.commandLine.appendSwitch('touch-events', 'enabled');
app.commandLine.appendSwitch('disable-pinch');

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    backgroundColor: '#071820',
    fullscreen: kiosk,
    kiosk,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  win.webContents.setVisualZoomLevelLimits(1, 1);
  win.loadFile(path.join(__dirname, '..', 'index.html'));
  return win;
}

function wrapWords(text, maxChars) {
  const words = String(text || '').split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (line && test.length > maxChars) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Composite thought onto receipt.png via offscreen BrowserWindow,
 * then save PNG and attempt silent system print (Anko MX06 if paired as printer).
 */
async function handlePrintThought(job) {
  const printsDir = path.join(__dirname, '..', 'data', 'prints');
  fs.mkdirSync(printsDir, { recursive: true });
  const filename = `exchange-${String(job.id || 'job').slice(0, 8)}-${Date.now()}.png`;
  const filePath = path.join(printsDir, filename);

  const templatePath = path.join(__dirname, '..', 'assets', 'branding', 'receipt.png');
  const templateDataUrl = fs.existsSync(templatePath)
    ? `data:image/png;base64,${fs.readFileSync(templatePath).toString('base64')}`
    : null;

  const apiBase = (job.apiBase || 'http://localhost:3000').replace(/\/$/, '');
  const archiveUrl =
    job.archiveUrl || `https://dive-deep.vercel.app/gallery?id=${job.id}`;
  const lines = wrapWords(job.text || '', 28);
  const code = job.anonymousCode || '';

  let qrDataUrl = null;
  const qrEndpoints = [
    `${apiBase}/api/qr?data=${encodeURIComponent(archiveUrl)}&size=140`,
    `http://localhost:3000/api/qr?data=${encodeURIComponent(archiveUrl)}&size=140`,
  ];
  for (const url of qrEndpoints) {
    try {
      const qrRes = await fetch(url);
      if (qrRes.ok) {
        const qrJson = await qrRes.json();
        qrDataUrl = qrJson.dataUrl || null;
        if (qrDataUrl) break;
      }
    } catch {
      // try next
    }
  }

  let imageDataUrl = null;
  if (templateDataUrl) {
    const printWin = new BrowserWindow({
      show: false,
      width: 1200,
      height: 1600,
      webPreferences: { offscreen: true },
    });

    const html = `<!DOCTYPE html><html><body style="margin:0;background:#fff">
<canvas id="c"></canvas>
<script>
(async () => {
  const tpl = new Image();
  tpl.src = ${JSON.stringify(templateDataUrl)};
  await new Promise((res, rej) => { tpl.onload = res; tpl.onerror = rej; });
  const canvas = document.getElementById('c');
  canvas.width = tpl.naturalWidth;
  canvas.height = tpl.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(tpl, 0, 0);
  const left = 40, top = 40, rightPad = 80;
  const maxW = canvas.width - left - rightPad;
  const fontSize = 48;
  const lineH = fontSize * 1.25;
  const padX = 10, padY = 4;
  ctx.font = 'italic ' + fontSize + 'px Georgia, serif';
  ctx.textBaseline = 'top';
  const lines = ${JSON.stringify(lines)};
  let y = top;
  for (const line of lines) {
    const tw = Math.min(maxW, ctx.measureText(line).width);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(left - padX, y - padY, tw + padX * 2, fontSize + padY * 2);
    ctx.fillStyle = '#111';
    ctx.fillText(line, left, y);
    y += lineH;
    if (y > canvas.height * 0.62) break;
  }
  const code = ${JSON.stringify(code)};
  if (code) {
    ctx.font = '500 22px monospace';
    const codeY = canvas.height - 120;
    const tw = ctx.measureText(code).width;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(left - 8, codeY - 4, tw + 16, 22 + 8);
    ctx.fillStyle = '#222';
    ctx.fillText(code, left, codeY);
  }
  const qrData = ${JSON.stringify(qrDataUrl)};
  if (qrData) {
    const qr = new Image();
    qr.src = qrData;
    await new Promise((res) => { qr.onload = res; qr.onerror = res; });
    const qrSize = 120;
    const qrX = 40, qrY = canvas.height - qrSize - 40;
    ctx.fillStyle = '#fff';
    ctx.fillRect(qrX - 6, qrY - 6, qrSize + 12, qrSize + 12);
    ctx.drawImage(qr, qrX, qrY, qrSize, qrSize);
  }
  document.title = canvas.toDataURL('image/png');
})();
<\/script></body></html>`;

    await printWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    await new Promise((r) => setTimeout(r, 800));
    try {
      imageDataUrl = await printWin.webContents.executeJavaScript('document.title');
      if (!imageDataUrl?.startsWith?.('data:image')) imageDataUrl = null;
    } catch {
      imageDataUrl = null;
    }
    printWin.destroy();
  }

  if (imageDataUrl?.startsWith('data:image/')) {
    const base64 = imageDataUrl.replace(/^data:image\/\w+;base64,/, '');
    fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
    console.log('[printer:electron] saved', filePath);
  } else {
    const txtPath = filePath.replace(/\.png$/, '.txt');
    fs.writeFileSync(txtPath, job.plainText || job.text || '', 'utf8');
    console.log('[printer:electron] saved text', txtPath);
  }

  try {
    const printWin = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
    const src = imageDataUrl
      || `data:text/html,${encodeURIComponent(`<pre>${(job.plainText || '').replace(/</g, '&lt;')}</pre>`)}`;
    const html = imageDataUrl
      ? `<html><body style="margin:0"><img src="${imageDataUrl}" style="width:100%"/></body></html>`
      : `<html><body style="font-family:serif;padding:24px;white-space:pre-wrap">${(job.plainText || '').replace(/</g, '&lt;')}</body></html>`;
    await printWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    await new Promise((resolve) => {
      printWin.webContents.print({ silent: true, printBackground: true }, (success, failureReason) => {
        if (!success) console.warn('[printer:electron] system print:', failureReason);
        else console.log('[printer:electron] sent to system printer (pair MX06 in Bluetooth if needed)');
        resolve();
      });
    });
    printWin.destroy();
  } catch (err) {
    console.warn('[printer:electron] system print skipped:', err?.message || err);
  }

  return { ok: true, filePath };
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) =>
    callback(permission === 'media'),
  );
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => permission === 'media');

  if (process.platform === 'darwin' && systemPreferences.askForMediaAccess) {
    systemPreferences.askForMediaAccess('camera').then(
      (granted) => {
        if (!granted)
          console.error(
            '[camera] macOS camera access is off: System Settings → Privacy & Security → Camera',
          );
      },
      (err) => console.error('[camera] could not ask macOS for camera access:', err),
    );
  }

  ipcMain.handle('print-thought', async (_event, job) => handlePrintThought(job));
  createWindow();
});

app.on('window-all-closed', () => app.quit());
