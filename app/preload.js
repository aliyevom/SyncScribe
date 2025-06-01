const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // App information
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
  
  // File operations
  showSaveDialog: (options) => ipcRenderer.invoke('show-save-dialog', options),
  showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),
  
  // App updates
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  
  // Menu event listeners
  onMenuAction: (callback) => {
    const wrappedCallback = (event, action) => callback(action);
    ipcRenderer.on('new-meeting', wrappedCallback);
    ipcRenderer.on('join-meeting', wrappedCallback);
    ipcRenderer.on('start-recording', wrappedCallback);
    ipcRenderer.on('stop-recording', wrappedCallback);
    ipcRenderer.on('open-settings', wrappedCallback);
    
    // Return cleanup function
    return () => {
      ipcRenderer.removeListener('new-meeting', wrappedCallback);
      ipcRenderer.removeListener('join-meeting', wrappedCallback);
      ipcRenderer.removeListener('start-recording', wrappedCallback);
      ipcRenderer.removeListener('stop-recording', wrappedCallback);
      ipcRenderer.removeListener('open-settings', wrappedCallback);
    };
  },
  
  // Platform detection
  platform: process.platform,
  
  // Version info
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron
  }
});

// Desktop-specific features
contextBridge.exposeInMainWorld('desktop', {
  // Check if running in Electron
  isElectron: true,
  
  // Platform-specific features
  isWindows: process.platform === 'win32',
  isMac: process.platform === 'darwin',
  isLinux: process.platform === 'linux',
  
  // Feature detection
  features: {
    fileSystem: true,
    notifications: true,
    menuBar: true,
    systemTray: false // Can be enabled later
  }
});

console.log('Preload script loaded successfully'); 