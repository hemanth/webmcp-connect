import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { parseSSEorJSON } from '../src/parser.js';

function mockResponse(body, contentType = 'application/json') {
    return {
        headers: { get: (name) => name === 'content-type' ? contentType : null },
        text: async () => typeof body === 'string' ? body : JSON.stringify(body),
    };
}

describe('parseSSEorJSON', () => {
    it('parses JSON response', async () => {
        const result = await parseSSEorJSON(mockResponse({ foo: 'bar' }));
        assert.deepEqual(result, { foo: 'bar' });
    });

    it('parses SSE response', async () => {
        const sse = 'event: message\ndata: {"result":"ok"}\n\n';
        const result = await parseSSEorJSON(mockResponse(sse, 'text/event-stream'));
        assert.deepEqual(result, { result: 'ok' });
    });

    it('parses SSE with multiple events (returns last)', async () => {
        const sse = 'event: message\ndata: {"id":1}\n\nevent: message\ndata: {"id":2}\n\n';
        const result = await parseSSEorJSON(mockResponse(sse, 'text/event-stream'));
        assert.deepEqual(result, { id: 2 });
    });

    it('falls back to JSON parse for unknown content type', async () => {
        const result = await parseSSEorJSON(mockResponse('{"x":1}', 'text/plain'));
        assert.deepEqual(result, { x: 1 });
    });

    it('throws on unparseable response', async () => {
        await assert.rejects(
            () => parseSSEorJSON(mockResponse('not json', 'text/plain')),
            /Unexpected response format/
        );
    });

    it('detects SSE by content prefix even without content-type', async () => {
        const sse = 'event: message\ndata: {"auto":true}\n\n';
        const result = await parseSSEorJSON(mockResponse(sse, ''));
        assert.deepEqual(result, { auto: true });
    });
});
