const { app, BrowserWindow, Menu, shell, dialog, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const serve = require('electron-serve');
const Store = require('electron-store');

// Initialize electron store for app settings
const store = new Store();

// Set up file serving for production
const loadURL = serve({ directory: '../client/build' });

// Keep a global reference of the window object
let mainWindow;
let serverProcess;
let isDev = process.env.NODE_ENV === 'development';

// Check if we're in development mode
if (process.defaultApp || /[\\/]electron-prebuilt[\\/]/.test(process.execPath) || /[\\/]electron[\\/]/.test(process.execPath)) {
  isDev = true;
}

function createWindow() {
  // Get window state from store
  const windowState = store.get('windowState', {
    width: 1400,
    height: 900,
    x: undefined,
    y: undefined
  });

  // Create the browser window
  mainWindow = new BrowserWindow({
    width: windowState.width,
    height: windowState.height,
    x: windowState.x,
    y: windowState.y,
    minWidth: 1200,
    minHeight: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: true
    },
    icon: path.join(__dirname, 'assets', 'icon.png'),
    titleBarStyle: 'hiddenInset',
    show: false,
    frame: true
  });

  // Save window state on close
  mainWindow.on('close', () => {
    const bounds = mainWindow.getBounds();
    store.set('windowState', bounds);
  });

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    
    // Focus on window
    if (isDev) {
      mainWindow.webContents.openDevTools();
    }
  });

  // Load the app
  if (isDev) {
    // Development mode - load from localhost
    mainWindow.loadURL('http://localhost:3000');
  } else {
    // Production mode - load from build files
    loadURL(mainWindow);
  }

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Prevent navigation to external sites
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    
    if (parsedUrl.origin !== 'http://localhost:3000' && parsedUrl.origin !== 'file://') {
      event.preventDefault();
    }
  });

  // Handle crashes
  mainWindow.webContents.on('crashed', () => {
    const options = {
      type: 'error',
      title: 'SyncScribe Crashed',
      message: 'The application has crashed. Would you like to restart?',
      buttons: ['Restart', 'Close']
    };
    
    dialog.showMessageBox(mainWindow, options).then((result) => {
      if (result.response === 0) {
        app.relaunch();
        app.exit();
      } else {
        app.quit();
      }
    });
  });

  // Handle unresponsive window
  mainWindow.on('unresponsive', () => {
    const options = {
      type: 'warning',
      title: 'SyncScribe Not Responding',
      message: 'The application is not responding. Would you like to restart?',
      buttons: ['Restart', 'Keep Waiting', 'Close']
    };
    
    dialog.showMessageBox(mainWindow, options).then((result) => {
      if (result.response === 0) {
        app.relaunch();
        app.exit();
      } else if (result.response === 2) {
        app.quit();
      }
    });
  });
}

// Start the Node.js server
function startServer() {
  const serverPath = path.join(__dirname, '..', 'server', 'index.js');
  
  serverProcess = spawn('node', [serverPath], {
    cwd: path.join(__dirname, '..', 'server'),
    env: { ...process.env, NODE_ENV: isDev ? 'development' : 'production' }
  });

  serverProcess.stdout.on('data', (data) => {
    console.log(`Server: ${data}`);
  });

  serverProcess.stderr.on('data', (data) => {
    console.error(`Server Error: ${data}`);
  });

  serverProcess.on('close', (code) => {
    console.log(`Server process exited with code ${code}`);
  });

  serverProcess.on('error', (error) => {
    console.error('Failed to start server:', error);
    
    const options = {
      type: 'error',
      title: 'Server Error',
      message: 'Failed to start the SyncScribe server. Please check your configuration.',
      detail: error.message
    };
    
    dialog.showErrorBox(options.title, options.message);
  });
}

// Create application menu
function createMenu() {
  const template = [
    {
      label: 'SyncScribe',
      submenu: [
        {
          label: 'About SyncScribe',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About SyncScribe',
              message: 'SyncScribe v1.0.0',
              detail: 'Advanced Meeting Transcriber with AI Analysis\n\nBuilt with Electron, React, and Node.js'
            });
          }
        },
        { type: 'separator' },
        {
          label: 'Preferences...',
          accelerator: 'CmdOrCtrl+,',
          click: () => {
            // Open preferences window
            mainWindow.webContents.send('open-settings');
          }
        },
        { type: 'separator' },
        {
          label: 'Hide SyncScribe',
          accelerator: 'Command+H',
          role: 'hide'
        },
        {
          label: 'Hide Others',
          accelerator: 'Command+Shift+H',
          role: 'hideothers'
        },
        {
          label: 'Show All',
          role: 'unhide'
        },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: 'CmdOrCtrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'Meeting',
      submenu: [
        {
          label: 'New Meeting',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            mainWindow.webContents.send('new-meeting');
          }
        },
        {
          label: 'Join Meeting',
          accelerator: 'CmdOrCtrl+J',
          click: () => {
            mainWindow.webContents.send('join-meeting');
          }
        },
        { type: 'separator' },
        {
          label: 'Start Recording',
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            mainWindow.webContents.send('start-recording');
          }
        },
        {
          label: 'Stop Recording',
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            mainWindow.webContents.send('stop-recording');
          }
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectall' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'close' },
        { type: 'separator' },
        { role: 'front' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Quick Start Guide',
          click: () => {
            shell.openExternal('https://github.com/yourusername/syncscribe#quick-start');
          }
        },
        {
          label: 'Report Issue',
          click: () => {
            shell.openExternal('https://github.com/yourusername/syncscribe/issues');
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// App event listeners
app.whenReady().then(() => {
  createMenu();
  startServer();
  
  // Wait a moment for server to start, then create window
  setTimeout(() => {
    createWindow();
  }, 2000);

  app.on('activate', () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Cleanup on quit
app.on('before-quit', () => {
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
  }
});

// Handle protocol for deep linking (future feature)
app.setAsDefaultProtocolClient('syncscribe');

// IPC handlers for communication with renderer process
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('get-system-info', () => {
  return {
    platform: process.platform,
    arch: process.arch,
    version: process.getSystemVersion()
  };
});

ipcMain.handle('show-save-dialog', async (event, options) => {
  const result = await dialog.showSaveDialog(mainWindow, options);
  return result;
});

ipcMain.handle('show-open-dialog', async (event, options) => {
  const result = await dialog.showOpenDialog(mainWindow, options);
  return result;
});

// Handle app updates (for future implementation)
ipcMain.handle('check-for-updates', async () => {
  // Implement auto-updater logic here
  return { hasUpdate: false };
});

console.log('SyncScribe Electron app starting...'); 