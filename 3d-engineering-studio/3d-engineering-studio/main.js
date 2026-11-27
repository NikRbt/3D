const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const fs = require('fs');
const path = require('path');

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1500,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#101923',
    title: '3D Engineering Studio',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  Menu.setApplicationMenu(null);
  win.loadFile('index.html');

  // F12 öffnet die Entwicklerkonsole (hilfreich bei console.log im Modellcode)
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') {
      win.webContents.toggleDevTools();
    }
  });
}

ipcMain.handle('file:open', async () => {
  const res = await dialog.showOpenDialog(win, {
    title: 'Modell-Code öffnen',
    filters: [{ name: 'JavaScript', extensions: ['js', 'txt'] }],
    properties: ['openFile'],
  });
  if (res.canceled || !res.filePaths[0]) return null;
  const file = res.filePaths[0];
  return { name: path.basename(file), content: fs.readFileSync(file, 'utf8') };
});

ipcMain.handle('file:save', async (_e, content, suggestedName) => {
  const res = await dialog.showSaveDialog(win, {
    title: 'Modell-Code speichern',
    defaultPath: suggestedName || 'modell.js',
    filters: [{ name: 'JavaScript', extensions: ['js'] }],
  });
  if (res.canceled || !res.filePath) return null;
  fs.writeFileSync(res.filePath, content, 'utf8');
  return path.basename(res.filePath);
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
