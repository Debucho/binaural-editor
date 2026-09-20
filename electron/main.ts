import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1080,
    minHeight: 700,
    backgroundColor: '#121316',
    title: 'Binaural Editor',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false, // Allows flexible local media loading if needed
    },
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  setupIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

function setupIpcHandlers() {
  // Open audio file dialog
  ipcMain.handle('dialog:openAudioFile', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '音声ファイルを選択 (WAV / MP3 / OGG)',
      filters: [
        { name: 'Audio Files', extensions: ['wav', 'mp3', 'ogg', 'flac', 'm4a', 'aac'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile']
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const filePath = result.filePaths[0];
    const name = path.basename(filePath);
    const buffer = await fs.readFile(filePath);

    return {
      filePath,
      name,
      buffer: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
    };
  });

  // Open SOFA / HRIR file dialog
  ipcMain.handle('dialog:openHrirFile', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'SOFA / HRIR データファイルを選択 (.sofa / .json / .wav)',
      filters: [
        { name: 'SOFA & HRIR Datasets', extensions: ['sofa', 'json', 'wav'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile']
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const filePath = result.filePaths[0];
    const name = path.basename(filePath);
    const buffer = await fs.readFile(filePath);

    return {
      filePath,
      name,
      buffer: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
    };
  });

  // Read audio file by path
  ipcMain.handle('audio:readFile', async (_event, filePath: string) => {
    try {
      const buffer = await fs.readFile(filePath);
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    } catch (err: any) {
      console.error('Failed to read audio file:', filePath, err);
      return null;
    }
  });

  // Save project dialog
  ipcMain.handle('dialog:saveProject', async (_event, { projectJson, defaultPath }: { projectJson: string, defaultPath?: string }) => {
    if (!mainWindow) return null;
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'プロジェクトを保存',
      defaultPath: defaultPath || 'project.bbproj',
      filters: [
        { name: 'Binaural Editor Project', extensions: ['bbproj', 'json'] }
      ]
    });

    if (result.canceled || !result.filePath) return null;
    await fs.writeFile(result.filePath, projectJson, 'utf-8');
    return result.filePath;
  });

  // Load project dialog
  ipcMain.handle('dialog:loadProject', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'プロジェクトを開く',
      filters: [
        { name: 'Binaural Editor Project', extensions: ['bbproj', 'json'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile']
    });

    if (result.canceled || result.filePaths.length === 0) return null;
    const filePath = result.filePaths[0];
    const content = await fs.readFile(filePath, 'utf-8');
    return { filePath, content };
  });

  // Save exported WAV
  ipcMain.handle('dialog:saveWav', async (_event, { wavBuffer, defaultName }: { wavBuffer: ArrayBuffer, defaultName?: string }) => {
    if (!mainWindow) return null;
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'バイノーラル音声 (WAV) を書き出し',
      defaultPath: defaultName || 'binaural_output.wav',
      filters: [
        { name: 'WAV Audio File', extensions: ['wav'] }
      ]
    });

    if (result.canceled || !result.filePath) return null;
    const nodeBuf = Buffer.from(wavBuffer);
    await fs.writeFile(result.filePath, nodeBuf);
    return result.filePath;
  });

  // Save exported CSV trajectory
  ipcMain.handle('dialog:saveCsv', async (_event, { csvContent, defaultPath }: { csvContent: string, defaultPath?: string }) => {
    if (!mainWindow) return null;
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'CSV軌跡データをエクスポート',
      defaultPath: defaultPath || 'trajectory.csv',
      filters: [
        { name: 'CSV File', extensions: ['csv'] }
      ]
    });

    if (result.canceled || !result.filePath) return null;
    await fs.writeFile(result.filePath, csvContent, 'utf-8');
    return result.filePath;
  });
}
