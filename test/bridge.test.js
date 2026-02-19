import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { WebMCP } from '../src/index.js';

// Mock fetch globally
function mockFetch(responses) {
    let callIndex = 0;
    return mock.fn(async (url, opts) => {
        const body = JSON.parse(opts.body);
        const resp = responses[callIndex++] || responses[responses.length - 1];
        return {
            status: resp.status || 200,
            statusText: resp.statusText || 'OK',
            ok: (resp.status || 200) < 400,
            headers: {
                get: (name) => {
                    if (name === 'content-type') return 'application/json';
                    if (name === 'Mcp-Session-Id') return resp.sessionId || null;
                    return null;
                },
            },
            text: async () => JSON.stringify(resp.body),
        };
    });
}

describe('WebMCP', () => {
    let originalFetch;

    beforeEach(() => {
        originalFetch = globalThis.fetch;
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    it('constructs with defaults', () => {
        const bridge = new WebMCP('https://mcp.example.com');
        assert.equal(bridge.serverUrl, 'https://mcp.example.com');
        assert.deepEqual(bridge.tools, []);
        assert.deepEqual(bridge.prompts, []);
        assert.deepEqual(bridge.resources, []);
    });

    it('connect() initializes and discovers tools', async () => {
        globalThis.fetch = mockFetch([
            // initialize
            {
                body: {
                    jsonrpc: '2.0', id: 1,
                    result: {
                        serverInfo: { name: 'test-server', version: '1.0' },
                        capabilities: { tools: {} },
                    },
                },
                sessionId: 'sess_123',
            },
            // tools/list
            {
                body: {
                    jsonrpc: '2.0', id: 2,
                    result: {
                        tools: [
                            { name: 'search', description: 'Search things', inputSchema: { type: 'object', properties: { q: { type: 'string' } } } },
                            { name: 'fetch', description: 'Fetch URL', inputSchema: { type: 'object', properties: { url: { type: 'string' } } } },
                        ],
                    },
                },
            },
            // prompts/list
            { body: { jsonrpc: '2.0', id: 3, result: { prompts: [] } } },
            // resources/list
            { body: { jsonrpc: '2.0', id: 4, result: { resources: [] } } },
        ]);

        const bridge = new WebMCP('https://mcp.example.com', { logger: { log: () => { } } });
        const result = await bridge.connect();

        assert.equal(result.tools.length, 2);
        assert.equal(result.tools[0].name, 'search');
        assert.equal(result.serverInfo.name, 'test-server');
        assert.equal(bridge.auth.sessionId, 'sess_123');
    });

    it('connect() throws on auth error', async () => {
        globalThis.fetch = mockFetch([{ status: 401 }]);

        const bridge = new WebMCP('https://mcp.example.com', { logger: { log: () => { } } });
        await assert.rejects(() => bridge.connect(), /Authentication required/);
    });

    it('connect() throws on JSON-RPC error', async () => {
        globalThis.fetch = mockFetch([{
            body: { jsonrpc: '2.0', id: 1, error: { code: -32600, message: 'Bad request' } },
        }]);

        const bridge = new WebMCP('https://mcp.example.com', { logger: { log: () => { } } });
        await assert.rejects(() => bridge.connect(), /Bad request/);
    });

    it('callTool() proxies to MCP server', async () => {
        globalThis.fetch = mockFetch([
            // initialize
            { body: { jsonrpc: '2.0', id: 1, result: { serverInfo: {}, capabilities: {} } } },
            // tools/list
            { body: { jsonrpc: '2.0', id: 2, result: { tools: [{ name: 'echo', description: 'Echo', inputSchema: { type: 'object', properties: {} } }] } } },
            // prompts/list
            { body: { jsonrpc: '2.0', id: 3, result: { prompts: [] } } },
            // resources/list
            { body: { jsonrpc: '2.0', id: 4, result: { resources: [] } } },
            // tools/call
            { body: { jsonrpc: '2.0', id: 5, result: { content: [{ type: 'text', text: 'hello back' }] } } },
        ]);

        const bridge = new WebMCP('https://mcp.example.com', { logger: { log: () => { } } });
        await bridge.connect();

        const result = await bridge.callTool('echo', { msg: 'hello' });
        assert.deepEqual(result, { content: [{ type: 'text', text: 'hello back' }] });
    });

    it('enrichContext hook enriches args', async () => {
        const calls = [];
        globalThis.fetch = mockFetch([
            { body: { jsonrpc: '2.0', id: 1, result: { serverInfo: {}, capabilities: {} } } },
            { body: { jsonrpc: '2.0', id: 2, result: { tools: [] } } },
            { body: { jsonrpc: '2.0', id: 3, result: { prompts: [] } } },
            { body: { jsonrpc: '2.0', id: 4, result: { resources: [] } } },
            { body: { jsonrpc: '2.0', id: 5, result: { content: [{ type: 'text', text: 'ok' }] } } },
        ]);

        const bridge = new WebMCP('https://mcp.example.com', {
            logger: { log: () => { } },
            enrichContext: (name, args) => {
                calls.push({ name, args });
                return { ...args, extra: 'injected' };
            },
        });

        await bridge.connect();
        await bridge.callTool('test', { q: 'hello' });

        assert.equal(calls.length, 1);
        assert.equal(calls[0].name, 'test');

        // Verify the enriched args were sent
        const lastCall = globalThis.fetch.mock.calls[4];
        const sentBody = JSON.parse(lastCall.arguments[1].body);
        assert.equal(sentBody.params.arguments.extra, 'injected');
        assert.equal(sentBody.params.arguments.q, 'hello');
    });

    it('onToolCall hook is called', async () => {
        const hookCalls = [];
        globalThis.fetch = mockFetch([
            { body: { jsonrpc: '2.0', id: 1, result: { serverInfo: {}, capabilities: {} } } },
            { body: { jsonrpc: '2.0', id: 2, result: { tools: [] } } },
            { body: { jsonrpc: '2.0', id: 3, result: { prompts: [] } } },
            { body: { jsonrpc: '2.0', id: 4, result: { resources: [] } } },
            { body: { jsonrpc: '2.0', id: 5, result: { content: [{ type: 'text', text: 'ok' }] } } },
        ]);

        const bridge = new WebMCP('https://mcp.example.com', {
            logger: { log: () => { } },
            onToolCall: (name, args) => hookCalls.push({ name, args }),
        });

        await bridge.connect();
        await bridge.callTool('search', { q: 'test' });

        assert.equal(hookCalls.length, 1);
        assert.equal(hookCalls[0].name, 'search');
    });

    it('onResponse hook transforms result', async () => {
        globalThis.fetch = mockFetch([
            { body: { jsonrpc: '2.0', id: 1, result: { serverInfo: {}, capabilities: {} } } },
            { body: { jsonrpc: '2.0', id: 2, result: { tools: [] } } },
            { body: { jsonrpc: '2.0', id: 3, result: { prompts: [] } } },
            { body: { jsonrpc: '2.0', id: 4, result: { resources: [] } } },
            { body: { jsonrpc: '2.0', id: 5, result: { content: [{ type: 'text', text: 'raw' }] } } },
        ]);

        const bridge = new WebMCP('https://mcp.example.com', {
            logger: { log: () => { } },
            onResponse: (name, result) => ({
                content: [{ type: 'text', text: 'transformed' }],
            }),
        });

        await bridge.connect();
        const result = await bridge.callTool('test', {});

        assert.equal(result.content[0].text, 'transformed');
    });

    it('custom headers are merged into requests', async () => {
        globalThis.fetch = mockFetch([
            { body: { jsonrpc: '2.0', id: 1, result: { serverInfo: {}, capabilities: {} } } },
            { body: { jsonrpc: '2.0', id: 2, result: { tools: [] } } },
            { body: { jsonrpc: '2.0', id: 3, result: { prompts: [] } } },
            { body: { jsonrpc: '2.0', id: 4, result: { resources: [] } } },
        ]);

        const bridge = new WebMCP('https://mcp.example.com', {
            logger: { log: () => { } },
            headers: { 'X-Custom': 'value' },
        });

        await bridge.connect();

        const firstCall = globalThis.fetch.mock.calls[0];
        assert.equal(firstCall.arguments[1].headers['X-Custom'], 'value');
    });

    it('setAuth() sets bearer token', async () => {
        globalThis.fetch = mockFetch([
            { body: { jsonrpc: '2.0', id: 1, result: { serverInfo: {}, capabilities: {} } } },
            { body: { jsonrpc: '2.0', id: 2, result: { tools: [] } } },
            { body: { jsonrpc: '2.0', id: 3, result: { prompts: [] } } },
            { body: { jsonrpc: '2.0', id: 4, result: { resources: [] } } },
        ]);

        const bridge = new WebMCP('https://mcp.example.com', { logger: { log: () => { } } });
        bridge.setAuth({ type: 'bearer', token: 'sk-test' });
        await bridge.connect();

        const firstCall = globalThis.fetch.mock.calls[0];
        assert.equal(firstCall.arguments[1].headers['Authorization'], 'Bearer sk-test');
    });

    it('callTool() handles errors gracefully', async () => {
        const errors = [];
        globalThis.fetch = mockFetch([
            { body: { jsonrpc: '2.0', id: 1, result: { serverInfo: {}, capabilities: {} } } },
            { body: { jsonrpc: '2.0', id: 2, result: { tools: [] } } },
            { body: { jsonrpc: '2.0', id: 3, result: { prompts: [] } } },
            { body: { jsonrpc: '2.0', id: 4, result: { resources: [] } } },
            { body: { jsonrpc: '2.0', id: 5, error: { code: -1, message: 'Tool broke' } } },
        ]);

        const bridge = new WebMCP('https://mcp.example.com', {
            logger: { log: () => { } },
            onError: (name, err) => errors.push({ name, message: err.message }),
        });

        await bridge.connect();
        const result = await bridge.callTool('broken', {});

        assert.ok(result.content[0].text.includes('Tool broke'));
        assert.equal(errors.length, 1);
        assert.equal(errors[0].name, 'broken');
    });

    it('getPrompt() fetches prompt', async () => {
        globalThis.fetch = mockFetch([
            { body: { jsonrpc: '2.0', id: 1, result: { serverInfo: {}, capabilities: {} } } },
            { body: { jsonrpc: '2.0', id: 2, result: { tools: [] } } },
            { body: { jsonrpc: '2.0', id: 3, result: { prompts: [] } } },
            { body: { jsonrpc: '2.0', id: 4, result: { resources: [] } } },
            { body: { jsonrpc: '2.0', id: 5, result: { messages: [{ role: 'user', content: { type: 'text', text: 'hello' } }] } } },
        ]);

        const bridge = new WebMCP('https://mcp.example.com', { logger: { log: () => { } } });
        await bridge.connect();
        const result = await bridge.getPrompt('greeting', { name: 'World' });

        assert.equal(result.messages[0].content.text, 'hello');
    });

    it('readResource() reads resource', async () => {
        globalThis.fetch = mockFetch([
            { body: { jsonrpc: '2.0', id: 1, result: { serverInfo: {}, capabilities: {} } } },
            { body: { jsonrpc: '2.0', id: 2, result: { tools: [] } } },
            { body: { jsonrpc: '2.0', id: 3, result: { prompts: [] } } },
            { body: { jsonrpc: '2.0', id: 4, result: { resources: [] } } },
            { body: { jsonrpc: '2.0', id: 5, result: { contents: [{ text: 'file content' }] } } },
        ]);

        const bridge = new WebMCP('https://mcp.example.com', { logger: { log: () => { } } });
        await bridge.connect();
        const result = await bridge.readResource('file:///test.txt');

        assert.equal(result.contents[0].text, 'file content');
    });
});
