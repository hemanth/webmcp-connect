import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { MCPAuth } from '../src/auth.js';

describe('MCPAuth', () => {
    let auth;

    beforeEach(() => {
        auth = new MCPAuth('https://mcp.example.com/rpc');
    });

    it('initializes with defaults', () => {
        assert.equal(auth.serverUrl, 'https://mcp.example.com/rpc');
        assert.equal(auth.token, null);
        assert.equal(auth.tokenType, 'Bearer');
        assert.equal(auth.isAuthenticated(), false);
    });

    it('sets bearer token', () => {
        auth.setBearerToken('tok_123');
        assert.equal(auth.token, 'tok_123');
        assert.equal(auth.tokenType, 'Bearer');
        assert.equal(auth.isAuthenticated(), true);

        const headers = auth.getHeaders();
        assert.equal(headers['Authorization'], 'Bearer tok_123');
    });

    it('sets API key', () => {
        auth.setApiKey('key_abc');
        const headers = auth.getHeaders();
        assert.equal(headers['X-API-Key'], 'key_abc');
        assert.equal(headers['Authorization'], undefined);
    });

    it('sets basic auth', () => {
        auth.setBasicAuth('user', 'pass');
        const headers = auth.getHeaders();
        const expected = btoa('user:pass');
        assert.equal(headers['Authorization'], `Basic ${expected}`);
    });

    it('includes session ID when set', () => {
        auth.setSessionId('sess_xyz');
        const headers = auth.getHeaders();
        assert.equal(headers['Mcp-Session-Id'], 'sess_xyz');
    });

    it('excludes session ID when includeSession is false', () => {
        auth.setSessionId('sess_xyz');
        const headers = auth.getHeaders(false);
        assert.equal(headers['Mcp-Session-Id'], undefined);
    });

    it('always includes content-type and accept', () => {
        const headers = auth.getHeaders();
        assert.equal(headers['Content-Type'], 'application/json');
        assert.equal(headers['Accept'], 'application/json, text/event-stream');
    });

    it('logout clears everything', () => {
        auth.setBearerToken('tok');
        auth.setSessionId('sess');
        auth.clientId = 'client_1';
        auth.logout();

        assert.equal(auth.token, null);
        assert.equal(auth.clientId, null);
        assert.equal(auth.sessionId, null);
        assert.equal(auth.isAuthenticated(), false);
    });

    it('generatePKCE returns verifier and challenge', async () => {
        const { verifier, challenge } = await auth.generatePKCE();
        assert.equal(typeof verifier, 'string');
        assert.equal(verifier.length, 64); // 32 bytes hex
        assert.equal(typeof challenge, 'string');
        assert.ok(challenge.length > 0);
        // Challenge should be base64url (no +, /, =)
        assert.ok(!/[+/=]/.test(challenge));
    });
});
