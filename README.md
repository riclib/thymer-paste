# Thymer Paste Plugin

A Thymer plugin that converts markdown content into native Thymer blocks.

## Features

### Working
- **Headings** - H1-H6 (all display as H1 until mp API is available)
- **Bold/Italic/Inline Code** - Full inline formatting support
- **Bullet lists** - Unordered lists with formatting
- **Ordered lists** - Numbered lists with formatting
- **Blockquotes** - Quote blocks
- **Tasks** - Checkbox items (checked state pending mp API)
- **Code blocks** - Fenced code blocks with content (syntax highlighting pending mp API)
- **Paragraphs** - Regular text

## Pending Thymer API Features

### `mp` (metadata/props) API - Coming Soon

The Thymer team has confirmed the metaproperties API isn't exposed yet, but they're working on it.

The internal `_item.mp` property controls:
- **Heading levels**: `mp: { hsize: 1 }` for H1, `mp: { hsize: 2 }` for H2, etc.
- **Code block language**: `mp: { language: "javascript" }` for syntax highlighting
- **Task completion state**

Once the API is available, this plugin will support:
- Proper H1/H2/H3 heading sizes
- Syntax highlighting for code blocks
- Checked/unchecked task states

### Horizontal rules
Thymer doesn't have horizontal rules yet - it's been added to their roadmap.

## Installation

1. In the command pallete choose plugins and create a new plugin
2. add the plugin.js and plugin.json
3. click preview
4. click save

## Usage

### Command Palette
- **Paste Markdown** - Paste markdown from clipboard into current note
- **Dump Line Items** - Debug: log all line items to browser console

### CLI Bridge (Optional)
Click the status bar item to enable polling from a local server at `http://localhost:3000/pending`.

## CLI Server Setup

The `tm` CLI lets you pipe markdown directly to Thymer from the command line.

### Quick Usage
```bash
# One-shot: serves content and exits when Thymer picks it up
cat README.md | tm
echo "# Hello World" | tm

# Persistent server mode
tm server
```

### Install with Taskfile

```bash
# Build and install to ~/.local/bin
task install

# Set up systemd user service (auto-starts on login)
task service:install
task service:start
```

### Service Management
```bash
task service:status   # Check if running
task service:logs     # Tail the logs
task service:restart  # Restart server
task service:stop     # Stop server
task service:uninstall # Remove service
```

### Paths
- **Binary**: `~/.local/bin/tm`
- **Logs**: `~/.local/share/thymer-paste/logs/server.log`
- **Service**: `~/.config/systemd/user/thymer-paste.service`

## Internal Data Model

Key discoveries about Thymer's internal data model:

### Line Item Structure
```javascript
{
  guid: "...",
  type: "heading",      // text, heading, task, ulist, olist, quote, block, br
  ts: ["text", "Hello", "bold", "world"],  // flat array: [type, text, type, text, ...]
  mp: { hsize: 1 },     // metadata - DOESN'T PERSIST via plugin API
  pguid: "...",         // parent guid (for nested items like code block children)
  cguids: [...]         // child guids
}
```

### Code Blocks
Code blocks are `type: "block"` with child `type: "text"` items:
- Parent block: `ts: []`, `mp: { language: "javascript" }`, `cguids: [child1, child2, ...]`
- Children: `ts: ["text", "code line"]`, `pguid: parent_guid`

### Segment Types
Valid segment types in `ts` array: `text`, `bold`, `italic`, `code`, `link`

### Line Item Types
Valid types: `text`, `heading`, `task`, `ulist`, `olist`, `quote`, `block`, `br`, `table`, `image`, `file`, `ref`

## License

MIT
