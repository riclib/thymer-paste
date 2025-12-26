/**
 * Thymer Paste Plugin
 *
 * Polls a Cloudflare Worker queue for content and inserts it into Thymer.
 * Supports: markdown paste, lifelog entries, record creation.
 *
 * Configure THYMER_QUEUE_URL and THYMER_QUEUE_TOKEN in plugin settings.
 */

// Default to localhost for development, override in plugin config
const DEFAULT_POLL_URL = 'http://localhost:3000/pending';
const POLL_INTERVAL = 2000; // 2 seconds
const MAX_FAILURES = 5; // Stop polling after this many consecutive failures

class Plugin extends AppPlugin {

    onLoad() {
        this.bridgeEnabled = false;
        this.connected = false;
        this.interval = null;
        this.failureCount = 0;

        // Get config from plugin settings (set in plugin.json or via API)
        const config = this.getExistingCodeAndConfig?.()?.json || {};
        this.queueUrl = config.queueUrl || DEFAULT_POLL_URL;
        this.queueToken = config.queueToken || '';

        // Status bar - click to toggle bridge
        this.statusBarItem = this.ui.addStatusBarItem({
            htmlLabel: '<span style="font-size: 14px;">🪄</span> paste',
            tooltip: 'Thymer Paste - Click to enable queue polling',
            onClick: () => this.toggleBridge()
        });

        // Command palette: Paste Markdown
        this.pasteCommand = this.ui.addCommandPaletteCommand({
            label: 'Paste Markdown',
            icon: 'clipboard-text',
            onSelected: () => this.pasteMarkdownFromClipboard()
        });

        // Command palette: Dump Line Items (for debugging)
        this.dumpCommand = this.ui.addCommandPaletteCommand({
            label: 'Dump Line Items',
            icon: 'bug',
            onSelected: () => this.dumpLineItems()
        });
    }

    onUnload() {
        if (this.statusBarItem) {
            this.statusBarItem.remove();
        }
        if (this.pasteCommand) {
            this.pasteCommand.remove();
        }
        if (this.dumpCommand) {
            this.dumpCommand.remove();
        }
        this.stopPolling();
    }

    toggleBridge() {
        if (this.bridgeEnabled) {
            this.stopPolling();
            this.bridgeEnabled = false;
            this.connected = false;
            this.statusBarItem.setHtmlLabel('<span style="font-size: 14px;">🪄</span> skill');
            this.statusBarItem.setTooltip('Skill Bridge - Click to enable CLI bridge');
            this.ui.addToaster({
                title: '🪄 Skill Bridge',
                message: 'Bridge disabled',
                dismissible: true,
                autoDestroyTime: 1500,
            });
        } else {
            this.bridgeEnabled = true;
            this.failureCount = 0;
            this.statusBarItem.setHtmlLabel('<span style="font-size: 14px;">🪄</span> <span style="opacity: 0.5;">connecting...</span>');
            this.statusBarItem.setTooltip('Skill Bridge - Connecting...');
            this.startPolling();
            this.ui.addToaster({
                title: '🪄 Skill Bridge',
                message: 'Bridge enabled - listening for CLI input',
                dismissible: true,
                autoDestroyTime: 1500,
            });
        }
    }

    startPolling() {
        this.poll();
        this.interval = setInterval(() => this.poll(), POLL_INTERVAL);
    }

    stopPolling() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }

    async pasteMarkdownFromClipboard() {
        try {
            const markdown = await navigator.clipboard.readText();
            if (!markdown || !markdown.trim()) {
                this.ui.addToaster({
                    title: '🪄 Paste Markdown',
                    message: 'Clipboard is empty',
                    dismissible: true,
                    autoDestroyTime: 2000,
                });
                return;
            }
            await this.insertMarkdown(markdown);
        } catch (error) {
            this.ui.addToaster({
                title: '🪄 Paste Markdown',
                message: `Failed to read clipboard: ${error.message}`,
                dismissible: true,
                autoDestroyTime: 3000,
            });
        }
    }

    async dumpLineItems() {
        const panel = this.ui.getActivePanel();
        const record = panel?.getActiveRecord();
        if (!record) {
            console.log('No active record');
            return;
        }

        const lineItems = await record.getLineItems();
        console.log('=== ALL LINE ITEMS ===');
        for (const item of lineItems) {
            console.log('---');
            console.log('type:', item.type);
            console.log('_item:', JSON.stringify(item._item, null, 2));
        }
        console.log('=== END ===');

        this.ui.addToaster({
            title: '🪄 Dump',
            message: `Logged ${lineItems.length} items to console`,
            dismissible: true,
            autoDestroyTime: 2000,
        });
    }

    async poll() {
        if (!this.bridgeEnabled) return;

        try {
            const headers = {};
            if (this.queueToken) {
                headers['Authorization'] = `Bearer ${this.queueToken}`;
            }

            const response = await fetch(this.queueUrl, { headers });

            if (!response.ok) {
                if (response.status === 204) {
                    // No content - queue empty, but connected
                    this.failureCount = 0;
                    this.setConnected(true);
                    return;
                }
                this.handleFailure();
                return;
            }

            this.failureCount = 0;
            this.setConnected(true);
            const data = await response.json();

            // Handle different formats (legacy: markdown, new: content+action)
            const content = data.content || data.markdown;
            if (content && content.trim()) {
                await this.handleQueueItem(data);
            }

        } catch (error) {
            this.handleFailure();
        }
    }

    handleFailure() {
        this.failureCount++;
        this.setConnected(false);

        if (this.failureCount >= MAX_FAILURES) {
            this.stopPolling();
            this.bridgeEnabled = false;
            this.statusBarItem.setHtmlLabel('<span style="font-size: 14px;">🪄</span> <span style="color: #f87171;">offline</span>');
            this.statusBarItem.setTooltip('Thymer Paste - Connection failed. Click to retry.');
        }
    }

    async handleQueueItem(data) {
        const content = data.content || data.markdown || '';
        const action = data.action || 'append';

        switch (action) {
            case 'lifelog':
                // Add timestamped entry to current record
                const time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                await this.insertMarkdown(`**${time}** ${content}`);
                break;

            case 'create':
                // TODO: Create new record in collection
                // For now, just insert as markdown
                await this.insertMarkdown(content);
                break;

            case 'append':
            default:
                await this.insertMarkdown(content);
                break;
        }

        this.ui.addToaster({
            title: '🪄 Received',
            message: `${action}: ${content.slice(0, 50)}${content.length > 50 ? '...' : ''}`,
            dismissible: true,
            autoDestroyTime: 2000,
        });
    }

    setConnected(connected) {
        if (!this.bridgeEnabled) return;

        if (this.connected !== connected) {
            this.connected = connected;

            if (connected) {
                this.statusBarItem.setHtmlLabel('<span style="font-size: 14px;">🪄</span> <span style="color: #4ade80;">●</span> skill');
                this.statusBarItem.setTooltip('Skill Bridge - Connected (click to disable)');
            } else {
                this.statusBarItem.setHtmlLabel('<span style="font-size: 14px;">🪄</span> <span style="color: #f87171;">●</span> skill');
                this.statusBarItem.setTooltip('Skill Bridge - Server not found (click to disable)');
            }
        }
    }

    async insertMarkdown(markdown) {
        const panel = this.ui.getActivePanel();
        const record = panel?.getActiveRecord();

        if (!record) {
            this.ui.addToaster({
                title: '🪄 Skill Bridge',
                message: 'No active record to insert into. Please open a note first.',
                dismissible: true,
                autoDestroyTime: 5000,
            });
            return;
        }

        // Parse markdown into blocks (handles multi-line code blocks)
        const blocks = this.parseMarkdown(markdown);
        let lastItem = null;

        for (const block of blocks) {
            try {
                const newItem = await record.createLineItem(null, lastItem, block.type);

                if (newItem) {
                    // Set mp BEFORE setSegments - maybe setSegments syncs everything
                    if (block.mp) {
                        newItem._item.mp = block.mp;
                    }

                    // For code blocks, create child text items for each line
                    if (block.type === 'block' && block.codeLines) {
                        // Call setSegments on block to sync mp
                        newItem.setSegments([]);

                        let lastChild = null;
                        for (const line of block.codeLines) {
                            const childItem = await record.createLineItem(newItem, lastChild, 'text');
                            if (childItem) {
                                // Use setSegments API
                                childItem.setSegments([{ type: 'text', text: line }]);
                                lastChild = childItem;
                            }
                        }
                    } else if (block.segments && block.segments.length > 0) {
                        // Regular items: use setSegments API
                        newItem.setSegments(block.segments);
                    } else if (block.mp) {
                        // Item has mp but no segments - call setSegments to sync
                        newItem.setSegments([]);
                    }

                    lastItem = newItem;
                }
            } catch (e) {
                console.error('Failed to create line item:', e);
            }
        }

        if (lastItem) {
            this.ui.addToaster({
                title: '🪄 Content inserted',
                message: `Added to "${record.getName()}"`,
                dismissible: true,
                autoDestroyTime: 2000,
            });
        }
    }

    parseMarkdown(markdown) {
        const lines = markdown.split('\n');
        const blocks = [];
        let inCodeBlock = false;
        let codeLines = [];
        let codeLanguage = '';

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // Check for code block start/end
            if (line.startsWith('```')) {
                if (!inCodeBlock) {
                    // Starting a code block
                    inCodeBlock = true;
                    codeLanguage = line.slice(3).trim();
                    codeLines = [];
                } else {
                    // Ending a code block - use 'block' type with child lines
                    inCodeBlock = false;
                    if (codeLines.length > 0) {
                        blocks.push({
                            type: 'block',
                            mp: { language: codeLanguage || 'plaintext' },
                            codeLines: codeLines
                        });
                    }
                    codeLines = [];
                    codeLanguage = '';
                }
                continue;
            }

            if (inCodeBlock) {
                codeLines.push(line);
                continue;
            }

            // Parse regular line
            const parsed = this.parseLine(line);
            if (parsed) {
                blocks.push(parsed);
            }
        }

        // Handle unclosed code block
        if (inCodeBlock && codeLines.length > 0) {
            blocks.push({
                type: 'block',
                mp: { language: codeLanguage || 'plaintext' },
                codeLines: codeLines
            });
        }

        return blocks;
    }

    parseLine(line) {
        // Skip empty lines for now
        if (!line.trim()) {
            return null;
        }

        // Horizontal rule (---, ***, ___, or with spaces)
        if (/^(\*\s*\*\s*\*|\-\s*\-\s*\-|_\s*_\s*_)[\s\*\-_]*$/.test(line.trim())) {
            return {
                type: 'br',
                segments: []
            };
        }

        // Headings
        const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
        if (headingMatch) {
            const level = headingMatch[1].length; // 1-6 based on # count
            return {
                type: 'heading',
                mp: { hsize: level },
                segments: this.parseInlineFormatting(headingMatch[2])
            };
        }

        // Task list (check before unordered list)
        const taskMatch = line.match(/^[\-\*]\s+\[([ xX])\]\s+(.+)$/);
        if (taskMatch) {
            return {
                type: 'task',
                segments: this.parseInlineFormatting(taskMatch[2])
            };
        }

        // Unordered list
        const ulMatch = line.match(/^[\-\*]\s+(.+)$/);
        if (ulMatch) {
            return {
                type: 'ulist',
                segments: this.parseInlineFormatting(ulMatch[1])
            };
        }

        // Ordered list
        const olMatch = line.match(/^\d+\.\s+(.+)$/);
        if (olMatch) {
            return {
                type: 'olist',
                segments: this.parseInlineFormatting(olMatch[1])
            };
        }

        // Quote
        if (line.startsWith('> ')) {
            return {
                type: 'quote',
                segments: this.parseInlineFormatting(line.slice(2))
            };
        }

        // Regular text
        return {
            type: 'text',
            segments: this.parseInlineFormatting(line)
        };
    }

    parseInlineFormatting(text) {
        const segments = [];

        // Regex patterns for inline formatting
        // Order matters: check longer/more specific patterns first
        const patterns = [
            // Inline code: `code`
            { regex: /`([^`]+)`/, type: 'code' },
            // Links: [text](url)
            { regex: /\[([^\]]+)\]\(([^)]+)\)/, type: 'link' },
            // Bold: **text** or __text__
            { regex: /\*\*([^*]+)\*\*/, type: 'bold' },
            { regex: /__([^_]+)__/, type: 'bold' },
            // Italic: *text* or _text_ (but not inside words for _)
            { regex: /\*([^*]+)\*/, type: 'italic' },
            { regex: /(?:^|[^a-zA-Z])_([^_]+)_(?:$|[^a-zA-Z])/, type: 'italic' },
        ];

        let remaining = text;

        while (remaining.length > 0) {
            let earliestMatch = null;
            let earliestIndex = remaining.length;
            let matchedPattern = null;

            // Find the earliest match among all patterns
            for (const pattern of patterns) {
                const match = remaining.match(pattern.regex);
                if (match && match.index < earliestIndex) {
                    earliestMatch = match;
                    earliestIndex = match.index;
                    matchedPattern = pattern;
                }
            }

            if (earliestMatch && matchedPattern) {
                // Add text before the match
                if (earliestIndex > 0) {
                    segments.push({ type: 'text', text: remaining.slice(0, earliestIndex) });
                }

                // Add the formatted segment
                if (matchedPattern.type === 'link') {
                    // For links, show display text (URL handling TBD)
                    segments.push({
                        type: 'text',
                        text: earliestMatch[1]
                    });
                } else {
                    segments.push({
                        type: matchedPattern.type,
                        text: earliestMatch[1]
                    });
                }

                // Continue with remaining text
                remaining = remaining.slice(earliestIndex + earliestMatch[0].length);
            } else {
                // No more matches, add remaining text
                segments.push({ type: 'text', text: remaining });
                break;
            }
        }

        return segments.length ? segments : [{ type: 'text', text }];
    }
}
