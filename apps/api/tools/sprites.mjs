/**
 * Sprite decoding (js5 archive 8) and PNG encoding.
 *
 * The decoder is a port of zwyz/rs3-cache's SpriteUnpacker. Two formats exist:
 * a palette-indexed one whose geometry lives in a trailer at the end of the
 * container, and a flat 24-bit one. Alpha is kept rather than flattened, since
 * these are icons that have to sit on the site's own background.
 */
import zlib from 'node:zlib';

function reader(buffer) {
  let pos = 0;
  return {
    seek(to) {
      pos = to;
    },
    g1: () => buffer[pos++],
    g2: () => {
      const v = buffer.readUInt16BE(pos);
      pos += 2;
      return v;
    },
    g3: () => {
      const v = (buffer[pos] << 16) | (buffer[pos + 1] << 8) | buffer[pos + 2];
      pos += 3;
      return v;
    },
  };
}

/**
 * Decodes every frame in a sprite group.
 * Returns [{ width, height, rgba }] with rgba as a straight RGBA byte buffer.
 */
export function decodeSprites(data) {
  const p = reader(data);
  p.seek(data.length - 2);
  const trailer = p.g2();
  const format = trailer >> 15;
  const count = trailer & 0x7fff;
  const frames = [];

  if (format === 0) {
    p.seek(data.length - 7 - count * 8);
    const sizeX = p.g2();
    const sizeY = p.g2();
    const paletteSize = (p.g1() & 255) + 1;

    const subX = [];
    const subY = [];
    const subSizeX = [];
    const subSizeY = [];
    for (let i = 0; i < count; i++) subX.push(p.g2());
    for (let i = 0; i < count; i++) subY.push(p.g2());
    for (let i = 0; i < count; i++) subSizeX.push(p.g2());
    for (let i = 0; i < count; i++) subSizeY.push(p.g2());

    // Index 0 stays 0 and means transparent, so a colour that really is black
    // is stored as 1 to keep it distinguishable.
    p.seek(data.length - 7 - count * 8 - (paletteSize - 1) * 3);
    const palette = new Array(paletteSize).fill(0);
    for (let i = 1; i < paletteSize; i++) {
      palette[i] = p.g3() || 1;
    }

    p.seek(0);
    for (let i = 0; i < count; i++) {
      const pixels = new Int32Array(sizeX * sizeY);
      const flags = p.g1();
      const columnFirst = (flags & 1) !== 0;
      const hasAlpha = (flags & 2) !== 0;

      const walk = (visit) => {
        if (columnFirst) {
          for (let x = subX[i]; x < subX[i] + subSizeX[i]; x++) {
            for (let y = subY[i]; y < subY[i] + subSizeY[i]; y++) visit(x, y);
          }
        } else {
          for (let y = subY[i]; y < subY[i] + subSizeY[i]; y++) {
            for (let x = subX[i]; x < subX[i] + subSizeX[i]; x++) visit(x, y);
          }
        }
      };

      walk((x, y) => {
        pixels[sizeX * y + x] = palette[p.g1()];
      });
      if (hasAlpha) {
        walk((x, y) => {
          pixels[sizeX * y + x] =
            (pixels[sizeX * y + x] & 0xffffff) | (p.g1() << 24);
        });
      }

      frames.push(toRgba(pixels, sizeX, sizeY, hasAlpha));
    }
    return frames;
  }

  p.seek(0);
  const version = p.g1();
  if (version !== 0) {
    throw new Error(`unsupported flat sprite version ${version}`);
  }
  const hasAlpha = p.g1() === 1;
  const sizeX = p.g2();
  const sizeY = p.g2();

  for (let i = 0; i < count; i++) {
    const pixels = new Int32Array(sizeX * sizeY);
    for (let j = 0; j < sizeX * sizeY; j++) {
      const rgb = p.g3();
      // Magic pink is the colour key for "transparent here".
      pixels[j] = rgb === 0xff00ff ? 0 : (0xff << 24) | rgb;
    }
    if (hasAlpha) {
      for (let j = 0; j < sizeX * sizeY; j++) {
        pixels[j] = (pixels[j] & 0xffffff) | (p.g1() << 24);
      }
    }
    frames.push(toRgba(pixels, sizeX, sizeY, true));
  }
  return frames;
}

/**
 * Without an explicit alpha channel, a zero pixel is the palette's transparent
 * index rather than black, so it has to become a transparent pixel instead of
 * an opaque one.
 */
function toRgba(pixels, width, height, explicitAlpha) {
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < pixels.length; i++) {
    const v = pixels[i];
    const a = explicitAlpha ? (v >>> 24) & 0xff : v === 0 ? 0 : 255;
    rgba[i * 4] = (v >> 16) & 0xff;
    rgba[i * 4 + 1] = (v >> 8) & 0xff;
    rgba[i * 4 + 2] = v & 0xff;
    rgba[i * 4 + 3] = a;
  }
  return { width, height, rgba };
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, body) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
  return Buffer.concat([head, body, crc]);
}

/** Minimal 8-bit RGBA PNG; no filtering, which deflate handles well enough. */
export function encodePng({ width, height, rgba }) {
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(
      raw,
      y * (width * 4 + 1) + 1,
      y * width * 4,
      (y + 1) * width * 4,
    );
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
