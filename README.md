# Thymer Paste Plugin

A Thymer plugin that converts markdown content into native Thymer blocks.

## Features

### Working
- **Headings** - H1-H6 (content works, but all display as H1 - see Known Issues)
- **Bold/Italic/Inline Code** - Full inline formatting support
- **Bullet lists** - Unordered lists with formatting
- **Ordered lists** - Numbered lists with formatting
- **Blockquotes** - Quote blocks
- **Tasks** - Checkbox items (unchecked only - see Known Issues)
- **Code blocks** - Fenced code blocks with content (no syntax highlighting - see Known Issues)
- **Paragraphs** - Regular text

## Known Issues / Help Wanted

### `mp` (metadata/props) doesn't persist

The internal `_item.mp` property controls important features:
- **Heading levels**: `mp: { hsize: 1 }` for H1, `mp: { hsize: 2 }` for H2, etc.
- **Code block language**: `mp: { language: "javascript" }` for syntax highlighting
- **Task completion**: Unknown property for checked state

**What we've tried:**
1. Setting `newItem._item.mp = { hsize: 2 }` directly - doesn't persist
2. Setting `mp` before calling `setSegments()` - doesn't persist
3. Setting `mp` after calling `setSegments()` - doesn't persist
4. Calling `setSegments([])` to trigger a sync after setting `mp` - doesn't persist

**What we know:**
- `setSegments()` successfully persists the `ts` (text segments) array
- Manually created items in Thymer DO have `mp` values (verified via dump)
- There's no `setProps()` or `setMp()` method in the Plugin SDK
- The Plugin SDK exposes `_item` which is the internal data object

**If you know how to persist `mp` values, please open an issue or PR!**

### Horizontal rules (`---`) don't render
Creating a `br` type item doesn't produce a visible horizontal rule.

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
