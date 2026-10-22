import { badRequest } from './errors.ts';

export type ImageMime = 'image/jpeg' | 'image/png' | 'image/webp';

export function detectImageMime(bytes: Uint8Array): ImageMime | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (
    bytes.length >= 12 &&
    ascii(bytes, 0, 4) === 'RIFF' &&
    ascii(bytes, 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

/**
 * Removes EXIF/XMP/IPTC/comment metadata without re-encoding the image.
 * The image bytes are never persisted by the gateway.
 */
export function stripImageMetadata(bytes: Uint8Array, mime: ImageMime): Uint8Array {
  switch (mime) {
    case 'image/jpeg':
      return stripJpeg(bytes);
    case 'image/png':
      return stripPng(bytes);
    case 'image/webp':
      return stripWebp(bytes);
  }
}

function stripJpeg(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 4) throw badRequest('The JPEG image is incomplete.');
  const parts: Uint8Array[] = [bytes.subarray(0, 2)];
  let offset = 2;

  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) throw badRequest('The JPEG image is malformed.');
    let marker = bytes[offset + 1]!;
    // Skip fill bytes.
    while (marker === 0xff && offset + 2 < bytes.length) {
      offset += 1;
      marker = bytes[offset + 1]!;
    }
    if (marker === 0xd9) {
      parts.push(bytes.subarray(offset, offset + 2));
      return concat(parts);
    }
    if (marker === 0xda) {
      parts.push(bytes.subarray(offset));
      return concat(parts);
    }
    if (offset + 4 > bytes.length) break;
    const length = (bytes[offset + 2]! << 8) | bytes[offset + 3]!;
    if (length < 2 || offset + 2 + length > bytes.length) {
      throw badRequest('The JPEG image is malformed.');
    }
    const end = offset + 2 + length;
    // APP1 = EXIF/XMP, APP13 = IPTC/Photoshop, COM = comment.
    const drop = marker === 0xe1 || marker === 0xed || marker === 0xfe;
    if (!drop) parts.push(bytes.subarray(offset, end));
    offset = end;
  }

  throw badRequest('The JPEG image is incomplete.');
}

function stripPng(bytes: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [bytes.subarray(0, 8)];
  let offset = 8;
  const drop = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME']);
  let foundIend = false;
  while (offset + 12 <= bytes.length) {
    const length =
      (bytes[offset]! << 24) |
      (bytes[offset + 1]! << 16) |
      (bytes[offset + 2]! << 8) |
      bytes[offset + 3]!;
    const type = ascii(bytes, offset + 4, offset + 8);
    const end = offset + 12 + length;
    if (end > bytes.length) throw badRequest('The PNG image is malformed.');
    if (!drop.has(type)) parts.push(bytes.subarray(offset, end));
    offset = end;
    if (type === 'IEND') {
      foundIend = true;
      break;
    }
  }
  if (!foundIend) throw badRequest('The PNG image is incomplete.');
  return concat(parts);
}

function stripWebp(bytes: Uint8Array): Uint8Array {
  const chunks: Uint8Array[] = [];
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const type = ascii(bytes, offset, offset + 4);
    const length =
      bytes[offset + 4]! |
      (bytes[offset + 5]! << 8) |
      (bytes[offset + 6]! << 16) |
      (bytes[offset + 7]! << 24);
    const end = offset + 8 + length + (length % 2);
    if (length < 0 || end > bytes.length) throw badRequest('The WebP image is malformed.');
    if (type !== 'EXIF' && type !== 'XMP ') chunks.push(bytes.subarray(offset, end));
    offset = end;
  }
  const payload = concat(chunks);
  const out = new Uint8Array(12 + payload.length);
  out.set(bytes.subarray(0, 12), 0);
  out.set(payload, 12);
  writeLe32(out, 4, out.length - 8);
  return out;
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end));
}

function writeLe32(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >> 8) & 0xff;
  bytes[offset + 2] = (value >> 16) & 0xff;
  bytes[offset + 3] = (value >> 24) & 0xff;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
