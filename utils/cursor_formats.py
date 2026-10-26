"""Decode and enlarge Windows CUR images and ANI animations."""

import io
import struct

from PIL import Image


MAX_CURSOR_DIMENSION = 256


class CursorSizeLimitError(ValueError):
    """The requested scale would exceed the CUR/ANI output size limit."""


def _validate_scaled_dimensions(width, height):
    if max(width, height) > MAX_CURSOR_DIMENSION:
        raise CursorSizeLimitError("Scaled CUR dimensions must fit within 256x256")


def iter_riff_chunks(data, start, end):
    """Read RIFF chunks, including their required even-byte padding."""
    pos = start
    while pos < end:
        tag, size = struct.unpack_from("<4sI", data, pos)
        finish = pos + 8 + size
        padded_end = finish + (size & 1)
        if padded_end > end:
            raise ValueError("Invalid RIFF chunk size or padding")
        yield tag, data[pos + 8:finish]
        pos = padded_end


def encode_riff_chunk(tag, payload):
    return tag + struct.pack("<I", len(payload)) + payload + (b"\0" if len(payload) & 1 else b"")


def decode_dib(raw, width, height):
    """Decode ordinary cursor bitmaps without losing legacy transparency."""
    header, dib_width, dib_height, planes, bits, compression = struct.unpack_from("<IiiHHI", raw)
    if header != 40 or compression != 0 or planes != 1 or bits not in (1, 4, 8, 24, 32):
        raise ValueError("Unsupported DIB: expected uncompressed 1/4/8/24/32-bit BITMAPINFOHEADER")
    if (dib_width, dib_height) != (width, height * 2):
        raise ValueError("DIB dimensions do not match the CUR directory")
    colors = struct.unpack_from("<I", raw, 32)[0]
    palette_count = (colors or (1 << bits)) if bits <= 8 else 0
    xor_start = 40 + palette_count * 4
    xor_stride = ((width * bits + 31) // 32) * 4
    mask_stride = ((width + 31) // 32) * 4
    mask_start = xor_start + xor_stride * height
    if mask_start > len(raw):
        raise ValueError("Truncated DIB pixels or palette")
    has_alpha = bits == 32 and any(raw[xor_start + 3:mask_start:4])
    if len(raw) < mask_start + mask_stride * height:
        if not (has_alpha and len(raw) == mask_start):
            raise ValueError("Truncated DIB transparency mask")

    pixels = bytearray()
    for y in range(height):
        row = xor_start + (height - 1 - y) * xor_stride
        mask_row = mask_start + (height - 1 - y) * mask_stride
        for x in range(width):
            alpha = 255
            if bits <= 8:
                packed = raw[row + x * bits // 8]
                index = (packed >> (8 - bits - (x * bits % 8))) & ((1 << bits) - 1)
                blue, green, red, _ = raw[40 + index * 4:44 + index * 4]
            else:
                offset = row + x * (bits // 8)
                blue, green, red = raw[offset:offset + 3]
                if has_alpha:
                    alpha = raw[offset + 3]
            # ARGB cursors use alpha; legacy cursors use AND/XOR compositing.
            if not has_alpha and raw[mask_row + x // 8] & (0x80 >> (x % 8)):
                if (red, green, blue) != (0, 0, 0):
                    raise ValueError("Screen-inverting XOR pixels cannot be represented as RGBA")
                alpha = 0
            pixels.extend((red, green, blue, alpha))
    return Image.frombytes("RGBA", (width, height), bytes(pixels))


def _decode_cur_image(raw, width, height):
    if raw.startswith(b"\x89PNG\r\n\x1a\n"):
        with Image.open(io.BytesIO(raw)) as png:
            if png.size != (width, height):
                raise ValueError("PNG dimensions do not match the CUR directory")
            return png.convert("RGBA")
    return decode_dib(raw, width, height)


def _read_cur_entries(data):
    if data[:4] != b"\0\0\x02\0":
        raise ValueError("Not a Windows CUR file (ANI frames must also contain CUR files)")
    count = struct.unpack_from("<H", data, 4)[0]
    for index in range(count):
        w, h, _, _, hx, hy, length, offset = struct.unpack_from("<BBBBHHII", data, 6 + 16 * index)
        width, height = w or 256, h or 256
        yield data[offset:offset + length], width, height, hx, hy


def decode_cur(data):
    return [(_decode_cur_image(raw, width, height), hx, hy)
            for raw, width, height, hx, hy in _read_cur_entries(data)]


def get_cursor_sizes(data, animated=False):
    """Read unique image sizes for reporting, without counting animation frames."""
    if animated:
        _, _, frames = _decode_ani(data)
        cursors = [payload for tag, payload in frames if tag == b"icon"]
    else:
        cursors = [data]
    return tuple(sorted({(width, height) for payload in cursors
                         for _, width, height, _, _ in _read_cur_entries(payload)}))


def _encode_transparency_mask(rgba):
    width, height = rgba.size
    mask_stride = ((width + 31) // 32) * 4
    rows = []
    alpha = rgba.getchannel("A")
    for y in range(height - 1, -1, -1):
        row = bytearray(mask_stride)
        for x in range(width):
            if alpha.getpixel((x, y)) == 0:
                row[x // 8] |= 0x80 >> (x % 8)
        rows.append(bytes(row))
    return b"".join(rows)


def _encode_dib_image(image):
    width, height = image.size
    rgba = image.convert("RGBA")
    # Entirely transparent images need zero RGB to avoid legacy XOR inversion.
    if rgba.getchannel("A").getbbox() is None:
        rgba = Image.new("RGBA", image.size)
    bgra = rgba.tobytes("raw", "BGRA")
    xor_rows = b"".join(bgra[y * width * 4:(y + 1) * width * 4]
                        for y in range(height - 1, -1, -1))
    mask = _encode_transparency_mask(rgba)
    header = struct.pack("<IiiHHIIiiII", 40, width, height * 2, 1, 32, 0,
                         len(xor_rows) + len(mask), 0, 0, 0, 0)
    return header + xor_rows + mask


def _encode_cur_entries(entries):
    directory, payloads = [], []
    offset = 6 + 16 * len(entries)
    for raw, width, height, hx, hy in entries:
        directory.append(struct.pack("<BBBBHHII", width % 256, height % 256, 0, 0,
                                     hx, hy, len(raw), offset))
        payloads.append(raw)
        offset += len(raw)
    return struct.pack("<HHH", 0, 2, len(entries)) + b"".join(directory) + b"".join(payloads)


def encode_cur(images):
    entries = [(_encode_dib_image(image), image.width, image.height, hx, hy)
               for image, hx, hy in images]
    return _encode_cur_entries(entries)


def merge_cur_variants(original, variants):
    """Keep original CUR payloads and append new image sizes once each."""
    entries = list(_read_cur_entries(original))
    sizes = {(width, height) for _, width, height, _, _ in entries}
    for variant in variants:
        for entry in _read_cur_entries(variant):
            _, width, height, _, _ = entry
            if (width, height) not in sizes:
                entries.append(entry)
                sizes.add((width, height))
    return _encode_cur_entries(entries)


def upscale_cur(data, scale):
    images = decode_cur(data)
    resized = []
    for image, hx, hy in images:
        size = (image.width * scale, image.height * scale)
        _validate_scaled_dimensions(*size)
        resized.append((image.resize(size, Image.Resampling.NEAREST), hx * scale, hy * scale))
    return encode_cur(resized)


def _decode_ani(data):
    if data[:4] != b"RIFF" or data[8:12] != b"ACON":
        raise ValueError("Not a Windows ANI/ACON file")
    parts = list(iter_riff_chunks(data, 12, len(data)))
    header = next((payload for tag, payload in parts if tag == b"anih"), None)
    frame_list = next((payload for tag, payload in parts if tag == b"LIST" and payload[:4] == b"fram"), None)
    if header is None or frame_list is None:
        raise ValueError("ANI requires an anih header and a fram list")
    frames = list(iter_riff_chunks(frame_list, 4, len(frame_list)))
    return parts, list(struct.unpack("<9I", header)), frames


def _upscale_ani_frames(frames, scale):
    return [(tag, upscale_cur(payload, scale) if tag == b"icon" else payload)
            for tag, payload in frames]


def _encode_ani(parts, header, frames):
    output = []
    for tag, payload in parts:
        if tag == b"anih":
            payload = struct.pack("<9I", *header)
        elif tag == b"LIST" and payload[:4] == b"fram":
            payload = b"fram" + b"".join(encode_riff_chunk(kind, frame) for kind, frame in frames)
        output.append(encode_riff_chunk(tag, payload))
    body = b"ACON" + b"".join(output)
    return b"RIFF" + struct.pack("<I", len(body)) + body


def merge_ani_variants(original, variants):
    """Add image sizes inside each ANI frame without changing its timeline."""
    parts, header, frames = _decode_ani(original)
    frames_by_variant = [_decode_ani(variant)[2] for variant in variants]
    merged = []
    for index, (tag, payload) in enumerate(frames):
        if tag == b"icon":
            variants_for_frame = [variant_frames[index][1] for variant_frames in frames_by_variant]
            payload = merge_cur_variants(payload, variants_for_frame)
        merged.append((tag, payload))
    # Embedded CUR images now carry multiple dimensions and pixel formats.
    header[3:7] = [0, 0, 0, 0]
    return _encode_ani(parts, header, merged)


def upscale_ani(data, scale):
    parts, header, frames = _decode_ani(data)
    scaled_frames = _upscale_ani_frames(frames, scale)
    width, height, bits, planes = header[3:7]
    if max(width * scale, height * scale) > MAX_CURSOR_DIMENSION:
        raise CursorSizeLimitError("Scaled ANI dimensions must fit within 256x256")
    header[3:7] = [width * scale, height * scale, 32 if bits else 0, 1 if planes else 0]
    return _encode_ani(parts, header, scaled_frames)
