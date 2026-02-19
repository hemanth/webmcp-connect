# webmcp-connect

Connect any MCP server to the browser via the [WebMCP API](https://webmachinelearning.github.io/webmcp/).

Three lines. That's it.

```javascript
import { WebMCP } from 'webmcp-connect';

const mcp = new WebMCP('https://mcp.example.com/sse');
await mcp.connect();
mcp.register();
// Every tool on that server is now available to the browser's AI
```

```bash
npm install webmcp-connect
```

## Why?

MCP servers are everywhere — GitHub, Slack, databases, you name it. But they're trapped behind desktop clients and CLI tools.

Why should using an MCP tool require Cursor or Claude Desktop?

`webmcp-connect` gives any webpage access to any MCP server. The browser becomes the agent surface.

## Examples

### Connect to a GitHub MCP server

```javascript
import { WebMCP } from 'webmcp-connect';

const github = new WebMCP('https://mcp-github.example.com/sse');
github.setAuth({ type: 'bearer', token: 'ghp_...' });

const { tools } = await github.connect();
console.log(tools.map(t => t.name));
// ['create_issue', 'search_repos', 'get_file_contents', ...]

github.register();
// The AI can now create issues, search repos, read files
```

### Enrich every tool call with page context

```javascript
const mcp = new WebMCP('https://mcp.example.com/sse', {
  enrichContext: (toolName, args) => ({
    ...args,
    page_url: location.href,
    page_title: document.title,
    selected_text: window.getSelection().toString(),
  }),
});

await mcp.connect();
mcp.register();
// Every tool call now carries page context — the AI knows what you're looking at
```

### Audit every tool call

```javascript
const mcp = new WebMCP('https://mcp.example.com/sse', {
  onToolCall: (name, args) => {
    analytics.track('mcp_tool_call', { tool: name, args });
  },
  onResponse: (name, result) => {
    console.log(`[${name}]`, result);
    return result;
  },
  onError: (name, err) => {
    Sentry.captureException(err, { extra: { tool: name } });
  },
});
```

### Mix remote + local tools

```javascript
await mcp.connect();

mcp.register([
  {
    name: 'get_selection',
    description: 'Get the currently selected text on the page',
    inputSchema: { type: 'object', properties: {} },
    execute: async () => ({
      content: [{ type: 'text', text: window.getSelection().toString() }],
    }),
  },
  {
    name: 'get_page_html',
    description: 'Get the full HTML of the current page',
    inputSchema: { type: 'object', properties: {} },
    execute: async () => ({
      content: [{ type: 'text', text: document.documentElement.outerHTML }],
    }),
  },
]);
// Remote MCP tools + page-local tools, all registered together
```

### Call tools directly (no WebMCP needed)

```javascript
const mcp = new WebMCP('https://mcp.example.com/sse');
await mcp.connect();

// Use tools programmatically — works without navigator.modelContext
const result = await mcp.callTool('search', { query: 'webmcp' });
console.log(result.content[0].text);
```

### Custom headers

```javascript
const mcp = new WebMCP('https://mcp.example.com/sse', {
  headers: {
    'X-Tenant-ID': 'acme-corp',
    'Authorization': 'Bearer sk-...',
  },
});
```

Headers are merged into every request. `setAuth()` headers go first, custom headers override.

## API

### `new WebMCP(serverUrl, options?)`

| Option | Type | Description |
|--------|------|-------------|
| `headers` | `object` | Custom headers merged into every request |
| `enrichContext` | `(name, args) => args` | Enrich tool args before proxying |
| `onToolCall` | `(name, args) => void` | Called before each tool call |
| `onResponse` | `(name, result) => result` | Transform responses |
| `onError` | `(name, error) => void` | Error handler |
| `logger` | `object` | Custom logger (default: `console`) |

### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `connect()` | `{ tools, prompts, resources }` | Initialize + discover |
| `register(extraTools?)` | `tool[]` | Register with WebMCP |
| `callTool(name, args)` | `result` | Call a tool |
| `getPrompt(name, args)` | `result` | Get a prompt |
| `readResource(uri)` | `result` | Read a resource |
| `setAuth({ type, token })` | — | Set auth (`bearer`, `apikey`, `basic`) |
| `disconnect()` | — | Clear context + logout |

## CORS

This module runs in the browser, so the MCP server must allow cross-origin requests. If you control the server, add `Access-Control-Allow-Origin` headers. Most MCP SDKs support this out of the box.

No CORS = the browser blocks the request before it reaches your code. That's a browser security feature, not a bug.

## Requirements

- A browser with [WebMCP](https://webmachinelearning.github.io/webmcp/) support
- `connect()` and `callTool()` work without WebMCP — you just can't `register()`

## License

MIT
