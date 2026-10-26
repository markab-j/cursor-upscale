"""CLI options and the read, scale, merge, write workflow."""

import argparse
import struct
from pathlib import Path

from .cursor_formats import (
    CursorSizeLimitError,
    get_cursor_sizes,
    merge_ani_variants,
    merge_cur_variants,
    upscale_ani,
    upscale_cur,
)
from .reporting import ConversionResult, print_file_result


CURSOR_ERRORS = (OSError, ValueError, SyntaxError, EOFError, struct.error)


def parse_arguments(argv=None):
    parser = argparse.ArgumentParser(
        description="Enlarge low-resolution Windows CUR and ANI cursors without changing originals.",
    )
    parser.add_argument("path", type=Path, help="CUR/ANI file or folder (searched recursively)")
    scales = parser.add_mutually_exclusive_group()
    scales.add_argument("--scale", type=int, default=2,
                        help="integer enlargement factor, at least 2 (default: 2)")
    scales.add_argument("--all", action="store_true", help="add 2x, 5x, and 10x images to each output cursor")
    parser.add_argument("-v", "--verbose", action="store_true", help="show per-file conversion, skip, and error details")
    args = parser.parse_args(argv)
    if args.scale < 2:
        parser.error("--scale must be at least 2")
    args.scales = (2, 5, 10) if args.all else (args.scale,)
    return args


def find_cursor_files(source):
    candidates = source.rglob("*") if source.is_dir() else [source]
    files = sorted(path for path in candidates if path.is_file() and path.suffix.lower() in (".cur", ".ani"))
    if not files:
        raise ValueError(f"No CUR or ANI files found in {source}")
    return files


def build_output_path(source, file):
    if source.is_dir():
        return source.with_name(f"{source.name}_upscaled") / file.relative_to(source)
    return file.with_name(f"{file.stem}_upscaled{file.suffix}")


def write_cursor_file(output, data):
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("xb") as target:
        target.write(data)


def copy_mapping_files(source):
    """Keep the INF files that MaCursor uses to map cursor roles."""
    if not source.is_dir():
        return
    for file in sorted(source.rglob("*")):
        if file.is_file() and file.suffix.lower() == ".inf":
            data = file.read_bytes()
            output = build_output_path(source, file)
            if output.is_file() and output.read_bytes() == data:
                continue
            write_cursor_file(output, data)


def _failed_results(file, scales, reason, error, sizes=()):
    return [ConversionResult(file, scale, "failed", sizes, reason=reason, detail=str(error))
            for scale in scales]


def convert_scales(file, data, scales, sizes):
    animated = file.suffix.lower() == ".ani"
    convert = upscale_ani if animated else upscale_cur
    results, variants = [], []
    for scale in scales:
        result = ConversionResult(file, scale, "converted", sizes)
        try:
            variants.append(convert(data, scale))
        except CursorSizeLimitError as error:
            result.status, result.reason = "skipped", str(error)
        except CURSOR_ERRORS as error:
            result.status, result.reason, result.detail = "failed", "Invalid cursor data", str(error)
        results.append(result)
    return results, variants


def upscale_cursor_file(source, file, scales):
    try:
        data = file.read_bytes()
    except OSError as error:
        return _failed_results(file, scales, "Cannot read cursor data", error)

    try:
        sizes = get_cursor_sizes(data, file.suffix.lower() == ".ani")
    except CURSOR_ERRORS as error:
        results = _failed_results(file, scales, "Cannot read cursor data", error)
        variants = []
    else:
        oversized = next((size for size in sizes if max(size) * 2 > 256), None)
        if oversized:
            width, height = oversized
            detail = f"Source {width}x{height} becomes {width * 2}x{height * 2} at 2x; output limit is 256x256"
            return _failed_results(file, scales, "Source cursor cannot fit at 2x", detail, sizes)
        results, variants = convert_scales(file, data, scales, sizes)
    try:
        output = build_output_path(source, file)
        if variants:
            merge = merge_ani_variants if file.suffix.lower() == ".ani" else merge_cur_variants
            data = merge(data, variants)
        write_cursor_file(output, data)
    except FileExistsError as error:
        return _failed_results(file, scales, "Output file already exists", error, results[0].sizes)
    except CURSOR_ERRORS as error:
        return _failed_results(file, scales, "Cannot write cursor data", error, results[0].sizes)

    for result in results:
        result.output = output
    return results


def upscale_cursor_files(source, files, scales, verbose=False):
    results = []
    for file in files:
        for result in upscale_cursor_file(source, file, scales):
            results.append(result)
            if verbose:
                print_file_result(result)
    return results


