#!/usr/bin/env python3
"""Enlarge low-resolution Windows CUR and ANI cursors without changing originals."""

import sys

from utils.cli import (
    copy_mapping_files,
    find_cursor_files,
    parse_arguments,
    upscale_cursor_files,
)
from utils.reporting import print_summary


def main(argv=None):
    args = parse_arguments(argv)
    try:
        source = args.path.resolve(strict=True)
        files = find_cursor_files(source)
        copy_mapping_files(source)
    except (OSError, ValueError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1
    results = upscale_cursor_files(source, files, args.scales, args.verbose)
    print_summary(results)
    return 1 if any(result.status == "failed" for result in results) else 0


if __name__ == "__main__":
    sys.exit(main())
