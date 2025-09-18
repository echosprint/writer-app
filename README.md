# Writer

A simple, elegant writing editor for managing book chapters and notes, built with Electron.

## Features

- **Chapter Management**: Organize your writing by chapters with automatic file detection
- **Note System**: Create structured notes with automatic ID generation and preview
- **Smart Source Detection**: Automatically detects and formats bibliography citations
- **Configurable Directory**: Point to any directory for your chapters
- **Keyboard Shortcuts**: Fast navigation and editing with intuitive shortcuts
- **Real-time Character Counting**: Track your writing progress
- **Modern UI**: Clean, distraction-free interface with subtle animations

## Installation

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd Writer
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure your chapters directory** (optional):
   Create a `CHAPTERS_DIR.txt` file in the root directory with the absolute path to your chapters folder:
   ```
   /Users/username/Documents/MyBook/chapters
   ```

   If no configuration file is provided, the app will use the current working directory.

4. **Run the application**:
   ```bash
   npm start
   ```

## Building for Distribution

To build the app for distribution:

```bash
npm run make
```

This will create platform-specific packages in the `out/` directory.

## Usage

### Basic Workflow

1. **Select a Chapter**: Choose from available `.md` or `.mdx` files in your chapters directory
2. **Write Notes**: Use the main text area for your notes and observations
3. **Add References**: Include quotes and sources in the reference area
4. **Save**: Use `Cmd/Ctrl + Enter` to save and clear, or `Cmd/Ctrl + S` to save without clearing

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `/` | Focus note content area |
| `]` | Focus quotes/reference area |
| `e` | Focus note ID field |
| `Esc` | Blur current field |
| `Cmd/Ctrl + Enter` | Save & clear |
| `Cmd/Ctrl + S` | Save & stay |
| `Cmd/Ctrl + L` | Clear all fields |
| `Cmd/Ctrl + R` | Load most recent note |
| `?` | Show keyboard shortcuts help |

### Note Structure

Notes are automatically formatted with the following structure:

```markdown
<Note id="unique-id">
Your note content here
///
Reference or quote content
///
Source: Author Name. Title. Publication, Year.
</Note>
```

The app automatically detects bibliography formats and separates content, references, and sources.

## Project Structure

```
Writer/
├── src/                    # Source files
│   ├── index.html         # Main application HTML
│   ├── main.js           # Electron main process
│   ├── preload.js        # Preload script for security
│   └── styles.css        # Tailwind input styles
├── assets/                # App assets
│   ├── icon.icns         # macOS app icon
│   └── icon.svg          # Source icon file
├── public/               # Generated files
│   └── styles.css       # Compiled Tailwind CSS
├── CHAPTERS_DIR.txt     # Configuration file (optional)
├── package.json         # Node.js dependencies and scripts
└── forge.config.js      # Electron Forge configuration
```

## Configuration

### Chapters Directory

The app reads from a configurable chapters directory. Create a `CHAPTERS_DIR.txt` file with your preferred path:

```
/absolute/path/to/your/chapters
```

### Supported File Types

- Markdown files (`.md`)
- MDX files (`.mdx`)

## Development

### Prerequisites

- Node.js 16 or higher
- npm or yarn

### Development Scripts

- `npm start` - Run the app in development mode
- `npm run build-css` - Build Tailwind CSS
- `npm run make` - Build for distribution
- `npm run package` - Package without creating installers

### CSS Development

The app uses Tailwind CSS. To rebuild styles:

```bash
npm run build-css
```

Styles are automatically built during the packaging process.

## Technical Details

- **Framework**: Electron with Node.js backend
- **UI**: HTML/CSS/JavaScript with Tailwind CSS
- **Security**: Context isolation enabled, no node integration in renderer
- **Platform**: Cross-platform (macOS, Windows, Linux)

## License

ISC License

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## Support

For issues and questions, please use the GitHub Issues page.