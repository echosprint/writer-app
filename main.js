#!/usr/bin/env node
import { createServer } from 'http';
import { promises as fs, watchFile } from 'fs';
import { join, dirname } from 'path';
import { parse } from 'url';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = 3001;
const CHAPTERS_DIR = join(__dirname, '..', 'src', 'content', 'chapters');
const EDITOR_PATH = join(__dirname, 'editor.html');
const CSS_OUTPUT_PATH = join(__dirname, 'public', 'styles.css');

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

async function generateCSS() {
  try {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    log('info', 'Generating CSS...');
    const { stdout: css } = await execAsync('pnpm exec tailwindcss -i styles.css --content "editor.html" --stdout', {
      cwd: __dirname
    });

    await fs.writeFile(CSS_OUTPUT_PATH, css, 'utf8');
    const size = Buffer.byteLength(css, 'utf8');
    log('info', `CSS generated: ${(size / 1024).toFixed(1)}KB (saved to public/styles.css)`);
  } catch (error) {
    log('error', 'Failed to generate CSS:', error);
    throw error;
  }
}

function log(level, message, ...args) {
  const timestamp = new Date().toLocaleTimeString('en-GB', { hour12: false });
  const levelStr = level === 'error' ? '[error]' : level === 'update' ? '[update]' : level === 'append' ? '[append]' : '';
  console.log(`${timestamp} ${levelStr} ${message}`, ...args);
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function sendHtml(res, content) {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(content);
}

function sendError(res, statusCode, message, details = null) {
  const error = { error: message };
  if (details) error.details = details;
  sendJson(res, statusCode, error);
}

async function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
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
// ROUTE HANDLERS
// =============================================================================

async function handleEditor(req, res) {
  try {
    const editorContent = await fs.readFile(EDITOR_PATH, 'utf8');
    sendHtml(res, editorContent);
    log('load', `refresh editor`);
  } catch (error) {
    log('error', 'Error loading editor:', error);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Error loading editor');
  }
}

async function handleCss(req, res) {
  try {
    const cssContent = await fs.readFile(CSS_OUTPUT_PATH, 'utf8');
    const stats = await fs.stat(CSS_OUTPUT_PATH);
    const etag = `"${stats.mtime.getTime()}"`;

    res.writeHead(200, {
      'Content-Type': 'text/css',
      'Cache-Control': 'public, max-age=3600', // 1 hour cache
      'ETag': etag
    });
    res.end(cssContent);
  } catch (error) {
    log('error', 'Error serving CSS:', error);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Error loading CSS');
  }
}

async function handleGetFiles(req, res) {
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
    
    sendJson(res, 200, {
      files: filesWithStats.map(f => f.name),
      lastModified: filesWithStats.length > 0 ? filesWithStats[0].name : null
    });
  } catch (error) {
    log('error', 'Error reading chapters directory:', error);
    sendError(res, 500, 'Failed to read chapters directory', error.message);
  }
}

async function handleAppendContent(req, res) {
  try {
    const { filename, content } = await parseBody(req);
    
    if (!filename || !content) {
      return sendError(res, 400, 'Missing filename or content');
    }

    const safePath = await validateFile(filename);
    
    // Append content with newlines
    const appendContent = `\n\n${content}`;
    await fs.appendFile(safePath, appendContent, 'utf8');

    log('append', `src/content/chapters/${filename}`);
    sendJson(res, 200, { success: true, message: `Content appended to ${filename}` });
  } catch (error) {
    if (error.message === 'File not found') {
      return sendError(res, 404, 'File not found');
    }
    log('error', 'Error appending content:', error);
    sendError(res, 500, 'Failed to append content', error.message);
  }
}

async function handleGetNotes(req, res, filename) {
  try {
    const safePath = await validateFile(filename);
    const content = await fs.readFile(safePath, 'utf8');
    const notes = extractNotes(content);
    
    sendJson(res, 200, { success: true, filename, notes });
  } catch (error) {
    if (error.message === 'File not found') {
      return sendError(res, 404, 'File not found');
    }
    log('error', `Error loading notes from ${filename}:`, error);
    sendError(res, 500, 'Failed to load notes', error.message);
  }
}

async function handleGetNote(req, res, noteId) {
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
      sendJson(res, 200, {
        success: true,
        noteId,
        filename: foundFilename,
        content: foundNote.content,
        reference: foundNote.reference
      });
    } else {
      sendError(res, 404, `Note #${noteId} not found`);
    }
  } catch (error) {
    log('error', `Error loading note ${noteId}:`, error);
    sendError(res, 500, 'Failed to load note', error.message);
  }
}

async function handleUpdateNote(req, res, noteId) {
  try {
    const { filename, content } = await parseBody(req);
    
    if (!filename || !content || !noteId) {
      return sendError(res, 400, 'Missing filename, content, or noteId');
    }

    const safePath = await validateFile(filename);
    
    // Read the file
    const fileContent = await fs.readFile(safePath, 'utf8');

    // Find and replace the specific note using manual position detection
    const noteStartPattern = `<Note id="${noteId}"`;
    const noteStart = fileContent.indexOf(noteStartPattern);
    
    if (noteStart === -1) {
      return sendError(res, 404, `Note #${noteId} not found in ${filename}`);
    }
    
    // Find the opening tag end
    const openTagEnd = fileContent.indexOf('>', noteStart);
    if (openTagEnd === -1) {
      return sendError(res, 500, 'Malformed Note tag');
    }
    
    // Find the closing tag
    const noteEnd = fileContent.indexOf('</Note>', openTagEnd);
    if (noteEnd === -1) {
      return sendError(res, 500, 'Note closing tag not found');
    }
    
    // Replace the note content
    const beforeNote = fileContent.substring(0, noteStart);
    const afterNote = fileContent.substring(noteEnd + 7); // +7 for '</Note>'
    const updatedContent = beforeNote + content + afterNote;

    // Write the updated content back
    await fs.writeFile(safePath, updatedContent, 'utf8');

    log('update', `Note #${noteId} in src/content/chapters/${filename}`);
    sendJson(res, 200, { success: true, message: `Note #${noteId} updated in ${filename}` });
  } catch (error) {
    if (error.message === 'File not found') {
      return sendError(res, 404, 'File not found');
    }
    log('error', `Error updating note ${noteId}:`, error);
    sendError(res, 500, 'Failed to update note', error.message);
  }
}

// =============================================================================
// ROUTING
// =============================================================================

const routes = [
  { method: 'GET', pattern: '/editor', handler: handleEditor },
  { method: 'GET', pattern: '/styles.css', handler: handleCss },
  { method: 'GET', pattern: '/api/files', handler: handleGetFiles },
  { method: 'POST', pattern: '/api/append', handler: handleAppendContent },
  {
    method: 'GET',
    pattern: '/api/notes/',
    handler: (req, res, pathname) => {
      const filename = decodeURIComponent(pathname.split('/api/notes/')[1]);
      return handleGetNotes(req, res, filename);
    }
  },
  {
    method: 'GET',
    pattern: '/api/note/',
    handler: (req, res, pathname) => {
      const noteId = decodeURIComponent(pathname.split('/api/note/')[1]);
      return handleGetNote(req, res, noteId);
    }
  },
  {
    method: 'PUT',
    pattern: '/api/note/',
    handler: (req, res, pathname) => {
      const noteId = decodeURIComponent(pathname.split('/api/note/')[1]);
      return handleUpdateNote(req, res, noteId);
    }
  }
];

async function handleRequest(req, res) {
  const { pathname } = parse(req.url, true);
  const method = req.method;
  
  // Log non-GET requests
  if (method !== 'GET') {
    log('info', `${method} ${pathname}`);
  }
  
  // Find matching route
  for (const route of routes) {
    if (route.method === method) {
      if (route.pattern === pathname || pathname.startsWith(route.pattern)) {
        try {
          await route.handler(req, res, pathname);
          return;
        } catch (error) {
          log('error', 'Route handler error:', error);
          sendError(res, 500, 'Internal server error');
          return;
        }
      }
    }
  }
  
  // 404 for unmatched routes
  sendError(res, 404, 'Not found');
}

// =============================================================================
// SERVER SETUP
// =============================================================================

const server = createServer(handleRequest);

server.listen(PORT, async () => {
  console.log(`Writer running on http://localhost:${PORT}`);
  console.log(`Serving chapters from: ${CHAPTERS_DIR}`);

  // Generate CSS on startup
  try {
    await generateCSS();
  } catch (error) {
    console.error('Failed to generate CSS on startup:', error);
    process.exit(1);
  }

  // Watch for changes to editor.html and styles.css
  const filesToWatch = [EDITOR_PATH, join(__dirname, 'styles.css')];

  filesToWatch.forEach(file => {
    watchFile(file, { interval: 1000 }, async (curr, prev) => {
      if (curr.mtime > prev.mtime) {
        log('info', `File changed: ${file}, regenerating CSS...`);
        try {
          await generateCSS();
        } catch (error) {
          log('error', 'Failed to regenerate CSS:', error);
        }
      }
    });
  });

  log('info', 'Watching for changes to editor.html and styles.css');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down writer...');
  server.close(() => {
    process.exit(0);
  });
});