// Decode PNG samples directly: canvas would round partially transparent colors.
const text = new TextDecoder();

function paeth(a, b, c) {
  const p = a + b - c;
  const distances = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
  return distances[0] <= distances[1] && distances[0] <= distances[2] ? a
    : distances[1] <= distances[2] ? b : c;
}

export async function decodePng(raw, width, height) {
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  if (view.getUint32(16) !== width || view.getUint32(20) !== height) {
    throw new Error("PNG dimensions do not match the CUR directory");
  }
  const depth = raw[24], type = raw[25], interlaced = raw[28];
  const channels = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[type];
  if (!channels || ![1, 2, 4, 8, 16].includes(depth) || raw[26] || raw[27] || interlaced > 1) {
    throw new Error("Unsupported PNG format");
  }
  let palette, transparency;
  const compressed = [];
  for (let offset = 8; offset < raw.length;) {
    const size = view.getUint32(offset), tag = text.decode(raw.subarray(offset + 4, offset + 8));
    const payload = raw.slice(offset + 8, offset + 8 + size);
    if (tag === "PLTE") palette = payload;
    if (tag === "tRNS") transparency = payload;
    if (tag === "IDAT") compressed.push(payload);
    offset += 12 + size;
  }
  const stream = new Blob(compressed).stream().pipeThrough(new DecompressionStream("deflate"));
  const scanlines = new Uint8Array(await new Response(stream).arrayBuffer());
  const rgba = new Uint8Array(width * height * 4);
  const passes = interlaced
    ? [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]]
    : [[0, 0, 1, 1]];
  const pixelBytes = Math.max(1, Math.ceil(channels * depth / 8));
  const maximum = 2 ** depth - 1;
  let position = 0;
  for (const [startX, startY, stepX, stepY] of passes) {
    const columns = Math.ceil((width - startX) / stepX);
    const rows = Math.ceil((height - startY) / stepY);
    if (columns <= 0 || rows <= 0) continue;
    const stride = Math.ceil(columns * channels * depth / 8);
    let previous = new Uint8Array(stride);
    for (let y = 0; y < rows; y++) {
      const filter = scanlines[position++];
      const row = scanlines.slice(position, position + stride);
      position += stride;
      if (row.length !== stride || filter > 4) throw new Error("Invalid PNG scanline");
      for (let byte = 0; byte < stride; byte++) {
        const left = byte >= pixelBytes ? row[byte - pixelBytes] : 0;
        const above = previous[byte], corner = byte >= pixelBytes ? previous[byte - pixelBytes] : 0;
        const prediction = [0, left, above, Math.floor((left + above) / 2), paeth(left, above, corner)][filter];
        row[byte] += prediction;
      }
      for (let x = 0; x < columns; x++) {
        const samples = [];
        for (let channel = 0; channel < channels; channel++) {
          const bit = (x * channels + channel) * depth;
          samples.push(depth === 16 ? row[bit / 8] * 256 + row[bit / 8 + 1]
            : (row[bit >> 3] >> (8 - depth - bit % 8)) & maximum);
        }
        const values = samples.map(value => depth === 16 ? value >> 8 : Math.round(value * 255 / maximum));
        let color;
        if (type === 3) {
          const index = samples[0];
          color = [...palette.slice(index * 3, index * 3 + 3), transparency?.[index] ?? 255];
        } else if (type === 0 || type === 4) {
          // Pillow converts 16-bit grayscale through its integer image mode.
          const gray = depth === 16 && type === 0 ? Math.min(samples[0], 255) : values[0];
          color = [gray, gray, gray, type === 4 ? values[1] : 255];
        } else color = [...values.slice(0, 3), type === 6 ? values[3] : 255];
        if (transparency && (type === 0 || type === 2)) {
          const key = new DataView(transparency.buffer);
          if (samples.every((value, index) => value === key.getUint16(index * 2))) color[3] = 0;
        }
        const destination = ((startY + y * stepY) * width + startX + x * stepX) * 4;
        rgba.set(color, destination);
      }
      previous = row;
    }
  }
  return rgba;
}
