const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const fs = require('fs').promises;
const { join } = require('path');

// Function to get chapters directory from config file or default
async function getChaptersDir() {
  const configFiles = [
    join(__dirname, '..', 'CHAPTERS_DIR'),
    join(__dirname, '..', 'CHAPTERS_DIR.txt')
  ];

  for (const configFile of configFiles) {
    try {
      const content = await fs.readFile(configFile, 'utf8');
      const chaptersPath = content.split('\n')[0].trim();
      if (chaptersPath) {
        return chaptersPath;
      }
    } catch (error) {
      // File doesn't exist, continue to next
    }
  }

  // Default fallback to current working directory
  return process.cwd();
}

// Initialize CHAPTERS_DIR
let CHAPTERS_DIR = process.cwd();

let mainWindow = null;

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================


function log(level, message, ...args) {
  const timestamp = new Date().toLocaleTimeString('en-GB', { hour12: false });
  const levelStr = level === 'error' ? '[error]' : level === 'update' ? '[update]' : level === 'append' ? '[append]' : '';
  console.log(`${timestamp} ${levelStr} ${message}`, ...args);
}



async function validateFile(filename) {
  const safePath = join(CHAPTERS_DIR, filename);
  try {
    await fs.access(safePath);
    return safePath;
  } catch {
    throw new Error('File not found');
  }
}

function extractNotes(content) {
  const noteRegex = /<Note id="([^"]+)"[^>]*>([\s\S]*?)<\/Note>/g;
  const notes = [];
  let match;
  
  while ((match = noteRegex.exec(content)) !== null) {
    const noteId = match[1];
    const noteContent = match[2].trim();
    
    // Extract first line for preview (up to 10 chars)
    const lines = noteContent.split('\n').filter(line => line.trim().length > 0);
    const firstLine = lines.length > 0 ? lines[0].trim() : '';
    const preview = firstLine.length > 22 ? firstLine.substring(0, 22) + '..' : firstLine;
    
    notes.push({ id: noteId, preview });
  }
  
  return notes;
}

// =============================================================================
// IPC HANDLERS
// =============================================================================

async function handleGetFiles() {
  try {
    const files = await fs.readdir(CHAPTERS_DIR);
    const mdFiles = files.filter(file => file.endsWith('.md') || file.endsWith('.mdx'));

    // Get file stats and sort by modification time
    const filesWithStats = await Promise.all(
      mdFiles.map(async (file) => {
        const filePath = join(CHAPTERS_DIR, file);
        const stats = await fs.stat(filePath);
        return { name: file, mtime: stats.mtime.getTime() };
      })
    );

    filesWithStats.sort((a, b) => b.mtime - a.mtime);

    return {
      files: filesWithStats.map(f => f.name),
      lastModified: filesWithStats.length > 0 ? filesWithStats[0].name : null
    };
  } catch (error) {
    log('error', 'Error reading chapters directory:', error);
    throw new Error('Failed to read chapters directory: ' + error.message);
  }
}

async function handleAppendContent(event, filename, content) {
  try {
    if (!filename || !content) {
      throw new Error('Missing filename or content');
    }

    const safePath = await validateFile(filename);

    // Append content with newlines
    const appendContent = `\n\n${content}`;
    await fs.appendFile(safePath, appendContent, 'utf8');

    log('append', `src/content/chapters/${filename}`);
    return { success: true, message: `Content appended to ${filename}` };
  } catch (error) {
    log('error', 'Error appending content:', error);
    throw error;
  }
}

async function handleGetNotes(event, filename) {
  try {
    const safePath = await validateFile(filename);
    const content = await fs.readFile(safePath, 'utf8');
    const notes = extractNotes(content);

    return { success: true, filename, notes };
  } catch (error) {
    log('error', `Error loading notes from ${filename}:`, error);
    throw error;
  }
}

async function handleGetNote(event, noteId) {
  try {
    const files = await fs.readdir(CHAPTERS_DIR);
    const mdFiles = files.filter(file => file.endsWith('.md') || file.endsWith('.mdx'));

    let foundNote = null;
    let foundFilename = null;

    // Search for note ID in all files
    for (const file of mdFiles) {
      const filePath = join(CHAPTERS_DIR, file);
      const content = await fs.readFile(filePath, 'utf8');

      // Find note with matching ID
      const noteRegex = new RegExp(`<Note id="${noteId}"[^>]*>([\\s\\S]*?)<\\/Note>`, 'g');
      const match = noteRegex.exec(content);

      if (match) {
        const noteContent = match[1].trim();

        // Parse note content (content /// reference /// source)
        const parts = noteContent.split('///').map(part => part.trim());

        let reference = '';
        if (parts.length >= 2) {
          // Combine reference and source without /// separators for editing
          reference = parts.slice(1).join('\n\n').trim();
        }

        foundNote = {
          content: parts[0] || '',
          reference: reference
        };
        foundFilename = file;
        break;
      }
    }

    if (foundNote) {
      return {
        success: true,
        noteId,
        filename: foundFilename,
        content: foundNote.content,
        reference: foundNote.reference
      };
    } else {
      throw new Error(`Note #${noteId} not found`);
    }
  } catch (error) {
    log('error', `Error loading note ${noteId}:`, error);
    throw error;
  }
}

async function handleUpdateNote(event, noteId, filename, content) {
  try {
    if (!filename || !content || !noteId) {
      throw new Error('Missing filename, content, or noteId');
    }

    const safePath = await validateFile(filename);

    // Read the file
    const fileContent = await fs.readFile(safePath, 'utf8');

    // Find and replace the specific note using manual position detection
    const noteStartPattern = `<Note id="${noteId}"`;
    const noteStart = fileContent.indexOf(noteStartPattern);

    if (noteStart === -1) {
      throw new Error(`Note #${noteId} not found in ${filename}`);
    }

    // Find the opening tag end
    const openTagEnd = fileContent.indexOf('>', noteStart);
    if (openTagEnd === -1) {
      throw new Error('Malformed Note tag');
    }

    // Find the closing tag
    const noteEnd = fileContent.indexOf('</Note>', openTagEnd);
    if (noteEnd === -1) {
      throw new Error('Note closing tag not found');
    }

    // Replace the note content
    const beforeNote = fileContent.substring(0, noteStart);
    const afterNote = fileContent.substring(noteEnd + 7); // +7 for '</Note>'
    const updatedContent = beforeNote + content + afterNote;

    // Write the updated content back
    await fs.writeFile(safePath, updatedContent, 'utf8');

    log('update', `Note #${noteId} in src/content/chapters/${filename}`);
    return { success: true, message: `Note #${noteId} updated in ${filename}` };
  } catch (error) {
    log('error', `Error updating note ${noteId}:`, error);
    throw error;
  }
}

async function handleSelectChaptersDirectory() {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Chapters Directory',
      defaultPath: CHAPTERS_DIR,
      properties: ['openDirectory']
    });

    if (!result.canceled && result.filePaths.length > 0) {
      const selectedPath = result.filePaths[0];

      // Save to CHAPTERS_DIR.txt
      const configPath = join(__dirname, '..', 'CHAPTERS_DIR.txt');
      await fs.writeFile(configPath, selectedPath, 'utf8');

      // Update current CHAPTERS_DIR
      CHAPTERS_DIR = selectedPath;

      log('info', `Chapters directory updated to: ${selectedPath}`);
      return { success: true, path: selectedPath };
    }

    return { success: false, canceled: true };
  } catch (error) {
    log('error', 'Error selecting chapters directory:', error);
    throw error;
  }
}

// =============================================================================
// ELECTRON APP SETUP
// =============================================================================

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 450,
    height: 750,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: join(__dirname, 'preload.js')
    },
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    show: false // Don't show until ready
  });

  // Load the index.html file
  mainWindow.loadFile('src/index.html');

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
}

// =============================================================================
// IPC MAIN HANDLERS
// =============================================================================

// Register IPC handlers
ipcMain.handle('get-files', handleGetFiles);
ipcMain.handle('append-content', handleAppendContent);
ipcMain.handle('get-notes', handleGetNotes);
ipcMain.handle('get-note', handleGetNote);
ipcMain.handle('update-note', handleUpdateNote);
ipcMain.handle('select-chapters-directory', handleSelectChaptersDirectory);

// File system operations
ipcMain.handle('read-file', async (event, filepath) => {
  try {
    return await fs.readFile(filepath, 'utf8');
  } catch (error) {
    throw error;
  }
});

ipcMain.handle('write-file', async (event, filepath, content) => {
  try {
    await fs.writeFile(filepath, content, 'utf8');
    return { success: true };
  } catch (error) {
    throw error;
  }
});

// Path utilities
ipcMain.handle('join-path', async (event, ...paths) => {
  return join(...paths);
});

// App controls
ipcMain.handle('close-app', () => {
  app.quit();
});

ipcMain.handle('minimize-app', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('maximize-app', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.handle('open-dev-tools', () => {
  if (mainWindow) mainWindow.webContents.openDevTools();
});

// Logging
ipcMain.handle('log', async (event, level, message, ...args) => {
  log(level, message, ...args);
});

// =============================================================================
// APP EVENT HANDLERS
// =============================================================================

// This method will be called when Electron has finished initialization
app.whenReady().then(async () => {
  // Load chapters directory from config file
  CHAPTERS_DIR = await getChaptersDir();
  log('info', `Using chapters directory: ${CHAPTERS_DIR}`);

  createWindow();
  log('info', 'Writer app started successfully');
});

// Quit when all windows are closed
app.on('window-all-closed', () => {
  // On macOS, keep app running even when all windows are closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Re-create window when dock icon is clicked (macOS)
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Security: Prevent new window creation
app.on('web-contents-created', (event, contents) => {
  contents.on('new-window', (navigationEvent, navigationURL, frameName, disposition, options) => {
    navigationEvent.preventDefault();
  });
});