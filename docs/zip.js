// Store files without compression; no dependency or change to cursor bytes.
import {concat} from "./cursor.js";

const crcTable = Uint32Array.from({length: 256}, (_, byte) => {
  for (let bit = 0; bit < 8; bit++) byte = (byte >>> 1) ^ (byte & 1 ? 0xedb88320 : 0);
  return byte;
});

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function createZip(files) {
  const local = [], central = [];
  let offset = 0;
  for (const {name, data} of files) {
    const filename = new TextEncoder().encode(name), crc = crc32(data);
    const header = new Uint8Array(30), entry = new Uint8Array(46);
    const h = new DataView(header.buffer), e = new DataView(entry.buffer);
    h.setUint32(0, 0x04034b50, true);
    h.setUint16(4, 20, true);
    h.setUint16(6, 0x800, true); // UTF-8 filenames.
    h.setUint16(12, 0x21, true); // January 1, 1980.
    h.setUint32(14, crc, true);
    h.setUint32(18, data.length, true);
    h.setUint32(22, data.length, true);
    h.setUint16(26, filename.length, true);
    e.setUint32(0, 0x02014b50, true);
    e.setUint16(4, 20, true);
    entry.set(header.subarray(4, 28), 6);
    e.setUint32(42, offset, true);
    local.push(header, filename, data);
    central.push(entry, filename);
    offset += header.length + filename.length + data.length;
  }
  const directory = concat(central), end = new Uint8Array(22), view = new DataView(end.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(8, files.length, true);
  view.setUint16(10, files.length, true);
  view.setUint32(12, directory.length, true);
  view.setUint32(16, offset, true);
  return concat([...local, directory, end]);
}
