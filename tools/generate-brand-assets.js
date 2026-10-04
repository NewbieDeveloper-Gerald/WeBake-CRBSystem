const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

function createPng(width, height, rgbaBuffer) {
  // Signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8); // 8-bit depth
  ihdr.writeUInt8(6, 9); // RGBA
  ihdr.writeUInt8(0, 10); // Deflate
  ihdr.writeUInt8(0, 11); // Filter 0
  ihdr.writeUInt8(0, 12); // No interlace

  const ihdrChunk = makeChunk('IHDR', ihdr);

  // Raw scanlines with filter byte 0 (None)
  const scanlines = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const scanlineStart = y * (1 + width * 4);
    scanlines[scanlineStart] = 0; // Filter 0
    rgbaBuffer.copy(scanlines, scanlineStart + 1, y * width * 4, (y + 1) * width * 4);
  }

  const compressed = zlib.deflateSync(scanlines, { level: 9 });
  const idatChunk = makeChunk('IDAT', compressed);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function makeChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(12 + len);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  const crc = crc32(chunk.slice(4, 8 + len));
  chunk.writeInt32BE(crc, 8 + len);
  return chunk;
}

// Standard CRC32 table
const crcTable = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) | 0;
}

function processLogo() {
  const srcPath = path.resolve(__dirname, '../frontend/customer/img/webake-logo.png');
  const buf = fs.readFileSync(srcPath);

  let pos = 8;
  const idatChunks = [];
  let width, height;

  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    if (type === 'IHDR') {
      width = buf.readUInt32BE(pos + 8);
      height = buf.readUInt32BE(pos + 12);
    } else if (type === 'IDAT') {
      idatChunks.push(buf.slice(pos + 8, pos + 8 + len));
    }
    pos += 12 + len;
  }

  const raw = zlib.inflateSync(Buffer.concat(idatChunks));
  const bpp = 4;
  const rowStride = 1 + width * bpp;
  const uncompressed = Buffer.alloc(width * height * bpp);

  // Unfilter scanlines
  for (let y = 0; y < height; y++) {
    const filter = raw[y * rowStride];
    const srcRow = y * rowStride + 1;
    const dstRow = y * width * bpp;
    const prevDstRow = (y - 1) * width * bpp;

    for (let x = 0; x < width * bpp; x++) {
      const rawByte = raw[srcRow + x];
      const a = (x >= bpp) ? uncompressed[dstRow + x - bpp] : 0;
      const b = (y > 0) ? uncompressed[prevDstRow + x] : 0;
      const c = (x >= bpp && y > 0) ? uncompressed[prevDstRow + x - bpp] : 0;

      let val = 0;
      if (filter === 0) val = rawByte;
      else if (filter === 1) val = (rawByte + a) & 0xff;
      else if (filter === 2) val = (rawByte + b) & 0xff;
      else if (filter === 3) val = (rawByte + Math.floor((a + b) / 2)) & 0xff;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        let pr = (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
        val = (rawByte + pr) & 0xff;
      }
      uncompressed[dstRow + x] = val;
    }
  }

  // Target background color: R: 247, G: 241, B: 229
  const bgR = 247, bgG = 241, bgB = 229;

  // Find tight bounding box
  let minX = width, maxX = 0, minY = height, maxY = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const r = uncompressed[idx];
      const g = uncompressed[idx + 1];
      const b = uncompressed[idx + 2];
      const dist = Math.sqrt((r - bgR)**2 + (g - bgG)**2 + (b - bgB)**2);
      if (dist > 30) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  // Add 12px padding around content
  const pad = 12;
  const cropX0 = Math.max(0, minX - pad);
  const cropY0 = Math.max(0, minY - pad);
  const cropX1 = Math.min(width - 1, maxX + pad);
  const cropY1 = Math.min(height - 1, maxY + pad);
  const cropW = cropX1 - cropX0 + 1;
  const cropH = cropY1 - cropY0 + 1;

  console.log(`Cropping logo to: ${cropW} x ${cropH}`);

  // Create transparent cropped buffer with smooth alpha transition
  const croppedRgba = Buffer.alloc(cropW * cropH * 4);

  for (let y = 0; y < cropH; y++) {
    for (let x = 0; x < cropW; x++) {
      const srcIdx = ((cropY0 + y) * width + (cropX0 + x)) * 4;
      const dstIdx = (y * cropW + x) * 4;

      const r = uncompressed[srcIdx];
      const g = uncompressed[srcIdx + 1];
      const b = uncompressed[srcIdx + 2];
      const dist = Math.sqrt((r - bgR)**2 + (g - bgG)**2 + (b - bgB)**2);

      croppedRgba[dstIdx] = r;
      croppedRgba[dstIdx + 1] = g;
      croppedRgba[dstIdx + 2] = b;

      if (dist < 18) {
        croppedRgba[dstIdx + 3] = 0; // Pure background -> fully transparent
      } else if (dist < 38) {
        // Anti-aliased feather
        const alpha = Math.round(((dist - 18) / 20) * 255);
        croppedRgba[dstIdx + 3] = alpha;
      } else {
        croppedRgba[dstIdx + 3] = 255; // Solid logo mark
      }
    }
  }

  // 1. Save transparent cropped logo
  const logoPngBuf = createPng(cropW, cropH, croppedRgba);
  fs.writeFileSync(path.resolve(__dirname, '../frontend/customer/img/webake-logo.png'), logoPngBuf);
  console.log('Saved transparent webake-logo.png');

  // 2. Create square favicon (around the "W" croissant mark or centered logo)
  // Let's create a square icon from the 'W' mark (minX to ~minX + 220, minY to maxY)
  const wWidth = 230;
  const iconPad = 15;
  const iconSize = Math.max(cropH, wWidth) + iconPad * 2;
  const faviconRgba = Buffer.alloc(iconSize * iconSize * 4); // default transparent

  const xOff = Math.floor((iconSize - wWidth) / 2);
  const yOff = Math.floor((iconSize - (maxY - minY)) / 2);

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= minX + wWidth; x++) {
      if (x >= width || y >= height) continue;
      const srcIdx = (y * width + x) * 4;
      const dstX = xOff + (x - minX);
      const dstY = yOff + (y - minY);
      if (dstX >= iconSize || dstY >= iconSize) continue;
      const dstIdx = (dstY * iconSize + dstX) * 4;

      const r = uncompressed[srcIdx];
      const g = uncompressed[srcIdx + 1];
      const b = uncompressed[srcIdx + 2];
      const dist = Math.sqrt((r - bgR)**2 + (g - bgG)**2 + (b - bgB)**2);

      faviconRgba[dstIdx] = r;
      faviconRgba[dstIdx + 1] = g;
      faviconRgba[dstIdx + 2] = b;
      if (dist < 18) {
        faviconRgba[dstIdx + 3] = 0;
      } else if (dist < 38) {
        faviconRgba[dstIdx + 3] = Math.round(((dist - 18) / 20) * 255);
      } else {
        faviconRgba[dstIdx + 3] = 255;
      }
    }
  }

  const faviconPngBuf = createPng(iconSize, iconSize, faviconRgba);
  fs.writeFileSync(path.resolve(__dirname, '../frontend/customer/img/favicon.png'), faviconPngBuf);
  console.log(`Saved square favicon.png (${iconSize}x${iconSize})`);
}

processLogo();
