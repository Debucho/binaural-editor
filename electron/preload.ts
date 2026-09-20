import { contextBridge, ipcRenderer } from 'electron';

export interface ElectronAPI {
  openAudioFile: () => Promise<{ filePath: string; name: string; buffer: ArrayBuffer } | null>;
  openHrirFile: () => Promise<{ filePath: string; name: string; buffer: ArrayBuffer } | null>;
  readAudioFile: (filePath: string) => Promise<ArrayBuffer | null>;
  saveProject: (projectJson: string, defaultPath?: string) => Promise<string | null>;
  loadProject: () => Promise<{ filePath: string; content: string } | null>;
  saveWav: (wavBuffer: ArrayBuffer, defaultName?: string) => Promise<string | null>;
  saveCsv: (csvContent: string, defaultPath?: string) => Promise<string | null>;
}

const electronAPI: ElectronAPI = {
  openAudioFile: () => ipcRenderer.invoke('dialog:openAudioFile'),
  openHrirFile: () => ipcRenderer.invoke('dialog:openHrirFile'),
  readAudioFile: (filePath: string) => ipcRenderer.invoke('audio:readFile', filePath),
  saveProject: (projectJson: string, defaultPath?: string) =>
    ipcRenderer.invoke('dialog:saveProject', { projectJson, defaultPath }),
  loadProject: () => ipcRenderer.invoke('dialog:loadProject'),
  saveWav: (wavBuffer: ArrayBuffer, defaultName?: string) =>
    ipcRenderer.invoke('dialog:saveWav', { wavBuffer, defaultName }),
  saveCsv: (csvContent: string, defaultPath?: string) =>
    ipcRenderer.invoke('dialog:saveCsv', { csvContent, defaultPath }),
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
