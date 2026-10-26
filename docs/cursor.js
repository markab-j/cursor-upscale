// Browser counterpart of utils/cursor_formats.py. Original payloads stay intact.
import {decodePng} from "./png.js";

const decoder = new TextDecoder();
const encoder = new TextEncoder();
const viewOf = data => new DataView(data.buffer, data.byteOffset, data.byteLength);
const tagAt = (data, offset) => decoder.decode(data.subarray(offset, offset + 4));

export function concat(parts) {
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; }
  return output;
}

class SizeLimitError extends Error {}

function checkSize(width, height, kind = "CUR") {
  if (Math.max(width, height) > 256) throw new SizeLimitError(`Scaled ${kind} dimensions must fit within 256x256`);
}

function readCur(data) {
  const view = viewOf(data);
  if (view.getUint32(0, true) !== 0x00020000) {
    throw new Error("Not a Windows CUR file (ANI frames must also contain CUR files)");
  }
  const entries = [];
  for (let index = 0; index < view.getUint16(4, true); index++) {
    const offset = 6 + index * 16;
    const size = view.getUint32(offset + 8, true), start = view.getUint32(offset + 12, true);
    entries.push({raw: data.slice(start, start + size), width: data[offset] || 256, height: data[offset + 1] || 256,
      hx: view.getUint16(offset + 4, true), hy: view.getUint16(offset + 6, true)});
  }
  return entries;
}

function encodeCur(entries) {
  const directory = new Uint8Array(6 + 16 * entries.length), view = viewOf(directory);
  view.setUint16(2, 2, true);
  view.setUint16(4, entries.length, true);
  let start = directory.length;
  entries.forEach(({raw, width, height, hx, hy}, index) => {
    const offset = 6 + index * 16;
    directory[offset] = width % 256;
    directory[offset + 1] = height % 256;
    view.setUint16(offset + 4, hx, true);
    view.setUint16(offset + 6, hy, true);
    view.setUint32(offset + 8, raw.length, true);
    view.setUint32(offset + 12, start, true);
    start += raw.length;
  });
  return concat([directory, ...entries.map(entry => entry.raw)]);
}

function decodeDib(raw, width, height) {
  const view = viewOf(raw), bits = view.getUint16(14, true);
  if (view.getUint32(0, true) !== 40 || view.getUint32(16, true) || view.getUint16(12, true) !== 1 || ![1, 4, 8, 24, 32].includes(bits)) {
    throw new Error("Unsupported DIB: expected uncompressed 1/4/8/24/32-bit BITMAPINFOHEADER");
  }
  if (view.getInt32(4, true) !== width || view.getInt32(8, true) !== height * 2) {
    throw new Error("DIB dimensions do not match the CUR directory");
  }
  const colors = bits <= 8 ? view.getUint32(32, true) || 2 ** bits : 0;
  const start = 40 + colors * 4, stride = Math.ceil(width * bits / 32) * 4;
  const maskStride = Math.ceil(width / 32) * 4, maskStart = start + stride * height;
  if (maskStart > raw.length) throw new Error("Truncated DIB pixels or palette");
  let hasAlpha = false;
  if (bits === 32) for (let byte = start + 3; byte < maskStart; byte += 4) hasAlpha ||= raw[byte] !== 0;
  if (raw.length < maskStart + maskStride * height && !(hasAlpha && raw.length === maskStart)) {
    throw new Error("Truncated DIB transparency mask");
  }
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const row = start + (height - 1 - y) * stride, maskRow = maskStart + (height - 1 - y) * maskStride;
    for (let x = 0; x < width; x++) {
      let offset, alpha = 255;
      if (bits <= 8) {
        const packed = raw[row + Math.floor(x * bits / 8)];
        const index = (packed >> (8 - bits - x * bits % 8)) & (2 ** bits - 1);
        offset = 40 + index * 4;
      } else {
        offset = row + x * bits / 8;
        if (hasAlpha) alpha = raw[offset + 3];
      }
      const [blue, green, red] = raw.subarray(offset, offset + 3);
      if (!hasAlpha && raw[maskRow + (x >> 3)] & (0x80 >> (x % 8))) {
        if (red || green || blue) throw new Error("Screen-inverting XOR pixels cannot be represented as RGBA");
        alpha = 0;
      }
      rgba.set([red, green, blue, alpha], (y * width + x) * 4);
    }
  }
  return rgba;
}

function encodeScaledDib(pixels, width, height, scale) {
  const targetWidth = width * scale, targetHeight = height * scale;
  const maskStride = Math.ceil(targetWidth / 32) * 4, maskStart = 40 + targetWidth * targetHeight * 4;
  const raw = new Uint8Array(maskStart + maskStride * targetHeight), view = viewOf(raw);
  view.setUint32(0, 40, true);
  view.setInt32(4, targetWidth, true);
  view.setInt32(8, targetHeight * 2, true);
  view.setUint16(12, 1, true);
  view.setUint16(14, 32, true);
  view.setUint32(20, raw.length - 40, true);
  const transparent = !pixels.some((value, index) => index % 4 === 3 && value !== 0);
  for (let y = 0; y < targetHeight; y++) {
    for (let x = 0; x < targetWidth; x++) {
      const source = (Math.floor(y / scale) * width + Math.floor(x / scale)) * 4;
      const offset = 40 + ((targetHeight - 1 - y) * targetWidth + x) * 4;
      if (!transparent) raw.set([pixels[source + 2], pixels[source + 1], pixels[source], pixels[source + 3]], offset);
      if (!pixels[source + 3]) raw[maskStart + (targetHeight - 1 - y) * maskStride + (x >> 3)] |= 0x80 >> (x % 8);
    }
  }
  return raw;
}

async function upscaleCur(data, scale) {
  const entries = [];
  // Decode before checking the scale, matching the CLI's invalid-data handling.
  const decoded = await Promise.all(readCur(data).map(async entry => ({...entry,
    pixels: tagAt(entry.raw, 1) === "PNG\r"
      ? await decodePng(entry.raw, entry.width, entry.height) : decodeDib(entry.raw, entry.width, entry.height)})));
  for (const {pixels, width, height, hx, hy} of decoded) {
    checkSize(width * scale, height * scale);
    entries.push({raw: encodeScaledDib(pixels, width, height, scale), width: width * scale,
      height: height * scale, hx: hx * scale, hy: hy * scale});
  }
  return encodeCur(entries);
}

function mergeCur(original, variants) {
  const entries = readCur(original), sizes = new Set(entries.map(entry => `${entry.width},${entry.height}`));
  for (const variant of variants) for (const entry of readCur(variant)) {
    const key = `${entry.width},${entry.height}`;
    if (!sizes.has(key)) { entries.push(entry); sizes.add(key); }
  }
  return encodeCur(entries);
}

function readChunks(data, start) {
  const chunks = [], view = viewOf(data);
  while (start < data.length) {
    const tag = tagAt(data, start), size = view.getUint32(start + 4, true), end = start + 8 + size;
    if (end + (size & 1) > data.length) throw new Error("Invalid RIFF chunk size or padding");
    chunks.push([tag, data.slice(start + 8, end)]);
    start = end + (size & 1);
  }
  return chunks;
}

function encodeChunk([tag, payload]) {
  const header = new Uint8Array(8);
  header.set(encoder.encode(tag));
  viewOf(header).setUint32(4, payload.length, true);
  return concat([header, payload, new Uint8Array(payload.length & 1)]);
}

function readAni(data) {
  if (tagAt(data, 0) !== "RIFF" || tagAt(data, 8) !== "ACON") throw new Error("Not a Windows ANI/ACON file");
  const parts = readChunks(data, 12);
  const header = parts.find(([tag]) => tag === "anih")?.[1];
  const frameList = parts.find(([tag, payload]) => tag === "LIST" && tagAt(payload, 0) === "fram")?.[1];
  if (!header || !frameList) throw new Error("ANI requires an anih header and a fram list");
  const view = viewOf(header);
  return {parts, header: Array.from({length: 9}, (_, i) => view.getUint32(i * 4, true)), frames: readChunks(frameList, 4)};
}

function encodeAni({parts, header, frames}) {
  const headerBytes = new Uint8Array(36);
  header.forEach((value, index) => viewOf(headerBytes).setUint32(index * 4, value, true));
  const chunks = parts.map(([tag, payload]) => {
    if (tag === "anih") payload = headerBytes;
    else if (tag === "LIST" && tagAt(payload, 0) === "fram") payload = concat([encoder.encode("fram"), ...frames.map(encodeChunk)]);
    return encodeChunk([tag, payload]);
  });
  return encodeChunk(["RIFF", concat([encoder.encode("ACON"), ...chunks])]);
}

async function upscaleAni(data, scale) {
  const ani = readAni(data);
  ani.frames = await Promise.all(ani.frames.map(async ([tag, payload]) => [tag, tag === "icon" ? await upscaleCur(payload, scale) : payload]));
  const [width, height, bits, planes] = ani.header.slice(3, 7);
  checkSize(width * scale, height * scale, "ANI");
  ani.header.splice(3, 4, width * scale, height * scale, bits ? 32 : 0, planes ? 1 : 0);
  return encodeAni(ani);
}

function mergeAni(original, variants) {
  const ani = readAni(original), frames = variants.map(variant => readAni(variant).frames);
  ani.frames = ani.frames.map(([tag, payload], index) => [tag,
    tag === "icon" ? mergeCur(payload, frames.map(items => items[index][1])) : payload]);
  ani.header.splice(3, 4, 0, 0, 0, 0);
  return encodeAni(ani);
}

export function getCursorSizes(data, animated = false) {
  const cursors = animated ? readAni(data).frames.filter(([tag]) => tag === "icon").map(([, payload]) => payload) : [data];
  const sizes = new Map();
  for (const cursor of cursors) for (const {width, height} of readCur(cursor)) sizes.set(`${width},${height}`, [width, height]);
  return [...sizes.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

export async function convertCursor(data, animated, scales) {
  let sizes;
  try { sizes = getCursorSizes(data, animated); }
  catch (error) { return {data, results: scales.map(scale => ({scale, sizes: [], status: "failed", reason: error.message}))}; }
  const oversized = sizes.find(([width, height]) => Math.max(width, height) * 2 > 256);
  if (oversized) {
    const [width, height] = oversized;
    const reason = `Source ${width}x${height} becomes ${width * 2}x${height * 2} at 2x; output limit is 256x256`;
    return {data: null, results: scales.map(scale => ({scale, sizes, status: "failed", reason}))};
  }
  const results = [], variants = [];
  for (const scale of scales) {
    const result = {scale, sizes, status: "converted", reason: ""};
    try { variants.push(await (animated ? upscaleAni : upscaleCur)(data, scale)); }
    catch (error) { result.status = error instanceof SizeLimitError ? "skipped" : "failed"; result.reason = error.message; }
    results.push(result);
  }
  try { if (variants.length) data = (animated ? mergeAni : mergeCur)(data, variants); }
  catch (error) { return {data: null, results: scales.map(scale => ({scale, sizes, status: "failed", reason: error.message}))}; }
  return {data, results};
}
