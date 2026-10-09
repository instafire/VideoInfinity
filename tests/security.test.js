const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const { escapeHtml, isAllowedUpload, isLoopbackHost, resolveInside, safeJsonForHtml, validateMagicBytes } = require('../server-security');

const publicRoot = path.resolve('/tmp/video-infinity/public');

test('resolveInside accepts stored web paths beneath the public root', () => {
    assert.equal(
        resolveInside(publicRoot, '/videos/clip.mp4'),
        path.join(publicRoot, 'videos', 'clip.mp4')
    );
});

test('resolveInside rejects empty, root, traversal, and foreign-drive paths', () => {
    for (const candidate of ['', '.', '..', '../database.sqlite', '/../../database.sqlite', 'videos/../../database.sqlite', 'C:/private/file', '\\\\server\\share\\file']) {
        assert.equal(resolveInside(publicRoot, candidate), null, `expected rejection for ${candidate}`);
    }
});

test('uploads require an exact supported MIME type and filename extension pairing', () => {
    assert.equal(isAllowedUpload('video/mp4', 'movie.mp4'), true);
    assert.equal(isAllowedUpload('video/quicktime', 'movie.MOV'), true);
    assert.equal(isAllowedUpload('image/jpeg', 'cover.jpeg'), true);
    assert.equal(isAllowedUpload('video/mp4', 'payload.html'), false);
    assert.equal(isAllowedUpload('video/mp4', 'movie.mp4.exe'), false);
    assert.equal(isAllowedUpload('video/unknown', 'movie.mp4'), false);
    assert.equal(isAllowedUpload('image/svg+xml', 'payload.svg'), false);
});

test('MP4 validation accepts variable ftyp box sizes and rejects non-media bytes', () => {
    const header = Buffer.from([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
    assert.equal(validateMagicBytes(header, 'video/mp4'), true);
    assert.equal(validateMagicBytes(Buffer.from('<!doctype html>'), 'video/mp4'), false);
    assert.equal(validateMagicBytes(header.subarray(0, 7), 'video/mp4'), false);
});

test('audio and image formats use their actual container signatures', () => {
    assert.equal(validateMagicBytes(Buffer.from('ID3\x04\x00\x00\x00\x00\x00\x00'), 'audio/mpeg'), true);
    assert.equal(validateMagicBytes(Buffer.from([0xff, 0xf1, 0x50, 0x80]), 'audio/aac'), true);
    assert.equal(validateMagicBytes(Buffer.from('RIFF\x00\x00\x00\x00WAVE'), 'audio/wav'), true);
    assert.equal(validateMagicBytes(Buffer.from('GIF89a'), 'image/gif'), true);
    assert.equal(
        validateMagicBytes(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'image/png'),
        true
    );
    assert.equal(validateMagicBytes(Buffer.from('<svg/>'), 'image/svg+xml'), false);
});

test('generated HTML escapes text and prevents JSON values from ending a script element', () => {
    const hostile = "</script><script>alert('x')</script> & \u2028";
    const serialized = safeJsonForHtml({ title: hostile });
    assert.doesNotMatch(serialized, /<\/?script/i);
    assert.deepEqual(JSON.parse(serialized), { title: hostile });
    assert.equal(escapeHtml(hostile), '&lt;/script&gt;&lt;script&gt;alert(&#x27;x&#x27;)&lt;/script&gt; &amp; \u2028');
});

test('network binding only accepts explicit loopback hosts', () => {
    for (const host of ['127.0.0.1', '::1', 'localhost', 'LOCALHOST']) {
        assert.equal(isLoopbackHost(host), true);
    }
    for (const host of ['0.0.0.0', '::', '192.168.1.4', 'example.com', '', null]) {
        assert.equal(isLoopbackHost(host), false);
    }
});
