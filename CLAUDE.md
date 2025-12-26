# Thymer Paste Plugin

A Thymer plugin that converts markdown into native Thymer blocks.

## Project Structure

- `plugin.js` - Main plugin code (AppPlugin class)
- `plugin.json` - Plugin configuration
- `README.md` - Documentation and known issues

## Key Concepts

### Thymer Plugin SDK
- Extends `AppPlugin` for global functionality
- Uses `this.ui` for UI elements (status bar, command palette, toasters)
- Uses `record.createLineItem(parent, after, type)` to create content
- Uses `lineItem.setSegments([{type, text}])` to set text content

### Line Item Types
- `text`, `heading`, `task`, `ulist`, `olist`, `quote`, `block`, `br`

### Segment Types (inline formatting)
- `text`, `bold`, `italic`, `code`, `link`

### Internal Data Model
```javascript
{
  type: "heading",
  ts: ["text", "Hello", "bold", "world"],  // flat array [type, text, type, text...]
  mp: { hsize: 1 },  // metadata - NOT YET EXPOSED IN API
  pguid: "...",      // parent guid
  cguids: [...]      // child guids
}
```

### Code Blocks
Code blocks use parent-child structure:
- Parent: `type: "block"`, `ts: []`, children contain the code lines
- Children: `type: "text"`, `ts: ["text", "code line"]`, `pguid` points to parent

## Pending API Features

The `mp` (metaproperties) API is not yet exposed. Once available:
- Heading levels: `mp: { hsize: 1|2|3 }`
- Code block language: `mp: { language: "javascript" }`
- Task completion state

## Testing

1. Build: `task build` or copy plugin.js content
2. In Thymer: Command Palette → Plugins → Create/Edit plugin
3. Paste code, click Preview, then Save
4. Test: Command Palette → "Paste Markdown"

## Debug

Use "Dump Line Items" command to log all line items to browser console.
