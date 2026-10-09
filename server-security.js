const path = require('node:path');

const UPLOAD_EXTENSIONS = new Map([
    ['video/mp4', new Set(['.mp4', '.m4v'])],
    ['video/x-m4v', new Set(['.m4v'])],
    ['video/quicktime', new Set(['.mov'])],
    ['video/x-msvideo', new Set(['.avi'])],
    ['video/avi', new Set(['.avi'])],
    ['video/x-matroska', new Set(['.mkv'])],
    ['video/webm', new Set(['.webm'])],
    ['audio/mpeg', new Set(['.mp3'])],
    ['audio/mp3', new Set(['.mp3'])],
    ['audio/wav', new Set(['.wav'])],
    ['audio/x-wav', new Set(['.wav'])],
    ['audio/ogg', new Set(['.ogg'])],
    ['audio/mp4', new Set(['.m4a'])],
    ['audio/x-m4a', new Set(['.m4a'])],
    ['audio/aac', new Set(['.aac'])],
    ['image/jpeg', new Set(['.jpg', '.jpeg'])],
    ['image/png', new Set(['.png'])],
    ['image/gif', new Set(['.gif'])],
    ['image/webp', new Set(['.webp'])]
]);

function resolveInside(baseDir, userPath) {
    if (typeof userPath !== 'string') return null;
    const normalized = userPath.trim().replace(/\\/g, '/');
    if (!normalized || /^[a-z]:/i.test(normalized) || normalized.startsWith('//')) {
        return null;
    }

    // Stored web paths (for example, /videos/clip.mp4) are relative to public/.
    const relativePath = normalized.replace(/^\/+/, '');
    if (!relativePath) return null;

    const base = path.resolve(baseDir);
    const resolved = path.resolve(base, relativePath);
    const relative = path.relative(base, resolved);
    if (
        !relative ||
        relative === '.' ||
        relative === '..' ||
        relative.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relative)
    ) {
        return null;
    }
    return resolved;
}

function isAllowedUpload(mimetype, originalname) {
    if (typeof mimetype !== 'string' || typeof originalname !== 'string') return false;
    const normalizedMime = mimetype.split(';', 1)[0].trim().toLowerCase();
    const extensions = UPLOAD_EXTENSIONS.get(normalizedMime);
    if (!extensions) return false;
    return extensions.has(path.extname(originalname).toLowerCase());
}

function validateMagicBytes(buffer, mimetype) {
    if (!Buffer.isBuffer(buffer) || typeof mimetype !== 'string') return false;
    const mime = mimetype.split(';', 1)[0].trim().toLowerCase();
    const starts = (signature) =>
        buffer.length >= signature.length && buffer.subarray(0, signature.length).equals(signature);
    const isRiff = buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF';
    const isFtyp = buffer.length >= 12 && buffer.toString('ascii', 4, 8) === 'ftyp';

    switch (mime) {
        case 'video/mp4':
        case 'video/x-m4v':
        case 'video/quicktime':
        case 'audio/mp4':
        case 'audio/x-m4a':
            return isFtyp;
        case 'video/x-msvideo':
        case 'video/avi':
            return isRiff && buffer.toString('ascii', 8, 12) === 'AVI ';
        case 'video/x-matroska':
        case 'video/webm':
            return starts(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
        case 'audio/mpeg':
        case 'audio/mp3':
            return (
                starts(Buffer.from('ID3')) ||
                (buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)
            );
        case 'audio/wav':
        case 'audio/x-wav':
            return isRiff && buffer.toString('ascii', 8, 12) === 'WAVE';
        case 'audio/ogg':
            return starts(Buffer.from('OggS'));
        case 'audio/aac':
            return buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xf6) === 0xf0;
        case 'image/jpeg':
            return starts(Buffer.from([0xff, 0xd8, 0xff]));
        case 'image/png':
            return starts(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
        case 'image/gif':
            return buffer.length >= 6 && ['GIF87a', 'GIF89a'].includes(buffer.toString('ascii', 0, 6));
        case 'image/webp':
            return isRiff && buffer.toString('ascii', 8, 12) === 'WEBP';
        default:
            return false;
    }
}

function escapeHtml(value) {
    const text = String(value ?? '');
    return text.replace(/[&<>"']/g, (character) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#x27;'
    })[character]);
}

function safeJsonForHtml(value) {
    return JSON.stringify(value)
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e')
        .replace(/&/g, '\\u0026')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');
}

function isLoopbackHost(host) {
    return typeof host === 'string' && ['127.0.0.1', '::1', 'localhost'].includes(host.trim().toLowerCase());
}

module.exports = { resolveInside, isAllowedUpload, validateMagicBytes, escapeHtml, safeJsonForHtml, isLoopbackHost };
