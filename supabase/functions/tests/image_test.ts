import { assert, assertEquals, assertThrows } from 'jsr:@std/assert@1';
import { detectImageMime, stripImageMetadata } from '../_shared/image.ts';
import { makeJpegWithExif, makePngWithText } from './test_harness.ts';

function text(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

Deno.test('image: detects JPEG, PNG, and WebP magic bytes', () => {
  assertEquals(detectImageMime(makeJpegWithExif()), 'image/jpeg');
  assertEquals(detectImageMime(makePngWithText()), 'image/png');
  assertEquals(detectImageMime(makeWebpWithExif()), 'image/webp');
  assertEquals(
    detectImageMime(new TextEncoder().encode('definitely not an image')),
    null,
  );
});

Deno.test('image: JPEG metadata stripping removes EXIF while keeping image data', () => {
  const original = makeJpegWithExif();
  assert(text(original).includes('secret-metadata'));

  const stripped = stripImageMetadata(original, 'image/jpeg');
  assert(stripped.length < original.length);
  assert(!text(stripped).includes('secret-metadata'));
  assert(!text(stripped).includes('Exif'));
  assertEquals([...stripped.subarray(0, 2)], [0xff, 0xd8]);
  assert(
    stripped.includes(0xff) &&
      stripped.some((byte, index) => byte === 0xda && stripped[index - 1] === 0xff),
  );
});

Deno.test('image: PNG metadata stripping removes tEXt and keeps IEND', () => {
  const original = makePngWithText();
  assert(text(original).includes('secret-metadata'));

  const stripped = stripImageMetadata(original, 'image/png');
  assert(stripped.length < original.length);
  assert(!text(stripped).includes('secret-metadata'));
  assert(text(stripped).includes('IEND'));
  assertEquals([...stripped.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
});

Deno.test('image: WebP metadata stripping removes EXIF and updates the RIFF size', () => {
  const original = makeWebpWithExif();
  assert(text(original).includes('EXIF'));
  assert(text(original).includes('secret-metadata'));

  const stripped = stripImageMetadata(original, 'image/webp');
  assert(stripped.length < original.length);
  assert(!text(stripped).includes('EXIF'));
  assert(!text(stripped).includes('secret-metadata'));
  assert(text(stripped).includes('VP8 '));
  assertEquals(text(stripped.subarray(0, 4)), 'RIFF');
  assertEquals(text(stripped.subarray(8, 12)), 'WEBP');
  const declared = readLe32(stripped, 4);
  assertEquals(declared, stripped.length - 8);
});

Deno.test('image: malformed input is rejected', () => {
  assertThrows(
    () => stripImageMetadata(new Uint8Array([0xff, 0xd8, 0x00, 0x00]), 'image/jpeg'),
    'incomplete',
  );
  assertThrows(
    () =>
      stripImageMetadata(
        new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        'image/png',
      ),
    'incomplete',
  );
});

function makeWebpWithExif(): Uint8Array {
  const exif = new TextEncoder().encode('secret-metadata');
  const vp8 = new Uint8Array([1, 2, 3, 4]);
  const chunks = [
    ...webpChunk('EXIF', exif),
    ...webpChunk('VP8 ', vp8),
  ];
  const out = new Uint8Array(12 + chunks.length);
  out.set(new TextEncoder().encode('RIFF'), 0);
  writeLe32(out, 4, out.length - 8);
  out.set(new TextEncoder().encode('WEBP'), 8);
  out.set(chunks, 12);
  return out;
}

function webpChunk(type: string, data: Uint8Array): number[] {
  const out = new Uint8Array(8 + data.length + (data.length % 2));
  out.set(new TextEncoder().encode(type), 0);
  writeLe32(out, 4, data.length);
  out.set(data, 8);
  return [...out];
}

function writeLe32(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >> 8) & 0xff;
  bytes[offset + 2] = (value >> 16) & 0xff;
  bytes[offset + 3] = (value >> 24) & 0xff;
}

function readLe32(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset]! |
    (bytes[offset + 1]! << 8) |
    (bytes[offset + 2]! << 16) |
    (bytes[offset + 3]! << 24)
  ) >>> 0;
}
