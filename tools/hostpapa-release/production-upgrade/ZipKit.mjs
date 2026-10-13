import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  return table;
})();

function computeCrc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  return { dosDate, dosTime };
}

/**
 * Creates a deterministic PKZIP archive from a list of files.
 * Uses only Node.js built-ins.
 *
 * @param {Array<{path: string, content: Buffer}>} entries
 * @param {string} destinationFile
 */
export function writeZipArchive(entries, destinationFile) {
  const localHeaders = [];
  const centralHeaders = [];
  let offset = 0;
  const { dosDate, dosTime } = dosDateTime(new Date(1760342400000)); // deterministic timestamp

  // Sort entries deterministically by forward-slash path
  const sorted = [...entries].sort((a, b) => a.path.localeCompare(b.path));

  for (const entry of sorted) {
    const filenameBuf = Buffer.from(entry.path.replace(/\\/g, '/'), 'utf8');
    const uncompressedBuf = entry.content;
    const crc = computeCrc32(uncompressedBuf);
    const uncompressedSize = uncompressedBuf.length;

    // Use deflate compression
    const compressedBuf = zlib.deflateRawSync(uncompressedBuf, { level: 9 });
    const useDeflate = compressedBuf.length < uncompressedSize;
    const finalData = useDeflate ? compressedBuf : uncompressedBuf;
    const method = useDeflate ? 8 : 0;
    const compressedSize = finalData.length;

    // Local file header (30 bytes + filename)
    const localHeader = Buffer.alloc(30 + filenameBuf.length);
    localHeader.writeUInt32LE(0x04034b50, 0); // signature
    localHeader.writeUInt16LE(20, 4);         // version needed (2.0)
    localHeader.writeUInt16LE(0, 6);          // flags
    localHeader.writeUInt16LE(method, 8);     // compression method
    localHeader.writeUInt16LE(dosTime, 10);   // mod time
    localHeader.writeUInt16LE(dosDate, 12);   // mod date
    localHeader.writeUInt32LE(crc, 14);       // crc32
    localHeader.writeUInt32LE(compressedSize, 18); // compressed size
    localHeader.writeUInt32LE(uncompressedSize, 22); // uncompressed size
    localHeader.writeUInt16LE(filenameBuf.length, 26); // filename length
    localHeader.writeUInt16LE(0, 28);         // extra field length
    filenameBuf.copy(localHeader, 30);

    localHeaders.push(localHeader, finalData);

    // Central directory header (46 bytes + filename)
    const centralHeader = Buffer.alloc(46 + filenameBuf.length);
    centralHeader.writeUInt32LE(0x02014b50, 0); // signature
    centralHeader.writeUInt16LE(20, 4);         // version made by
    centralHeader.writeUInt16LE(20, 6);         // version needed
    centralHeader.writeUInt16LE(0, 8);          // flags
    centralHeader.writeUInt16LE(method, 10);    // compression method
    centralHeader.writeUInt16LE(dosTime, 12);   // mod time
    centralHeader.writeUInt16LE(dosDate, 14);   // mod date
    centralHeader.writeUInt32LE(crc, 16);       // crc32
    centralHeader.writeUInt32LE(compressedSize, 20); // compressed size
    centralHeader.writeUInt32LE(uncompressedSize, 24); // uncompressed size
    centralHeader.writeUInt16LE(filenameBuf.length, 28); // filename length
    centralHeader.writeUInt16LE(0, 30);         // extra field length
    centralHeader.writeUInt16LE(0, 32);         // file comment length
    centralHeader.writeUInt16LE(0, 34);         // disk number start
    centralHeader.writeUInt16LE(0, 36);         // internal attributes
    centralHeader.writeUInt32LE((0o100644 << 16) >>> 0, 38); // external attributes (regular file rw-r--r--)
    centralHeader.writeUInt32LE(offset, 42);    // relative offset of local header
    filenameBuf.copy(centralHeader, 46);

    centralHeaders.push(centralHeader);

    offset += localHeader.length + finalData.length;
  }

  const centralDirOffset = offset;
  let centralDirSize = 0;
  for (const h of centralHeaders) centralDirSize += h.length;

  // End of central directory record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // signature
  eocd.writeUInt16LE(0, 4);          // disk number
  eocd.writeUInt16LE(0, 6);          // central dir disk
  eocd.writeUInt16LE(sorted.length, 8);  // entries on disk
  eocd.writeUInt16LE(sorted.length, 10); // total entries
  eocd.writeUInt32LE(centralDirSize, 12); // size of central dir
  eocd.writeUInt32LE(centralDirOffset, 16); // offset of central dir
  eocd.writeUInt16LE(0, 20);         // comment length

  const allBuffers = [...localHeaders, ...centralHeaders, eocd];
  fs.mkdirSync(path.dirname(destinationFile), { recursive: true });
  fs.writeFileSync(destinationFile, Buffer.concat(allBuffers));
}
