const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('fangs', {
  preview: () => ipcRenderer.invoke('fangs:preview'),
  judge: () => ipcRenderer.invoke('fangs:judge'),
  voice: (text) => ipcRenderer.invoke('fangs:voice', text),
  open: (id) => ipcRenderer.invoke('fangs:open', id),
  dismiss: () => ipcRenderer.invoke('fangs:dismiss'),
  interactive: (on) => ipcRenderer.invoke('fangs:interactive', !!on),
});
