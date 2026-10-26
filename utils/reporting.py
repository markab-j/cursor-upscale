"""Print per-file details and a compact conversion summary."""

import os
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path


@dataclass
class ConversionResult:
    file: Path
    scale: int
    status: str
    sizes: tuple = ()
    output: Path | None = None
    reason: str = ""
    detail: str = ""


def format_sizes(sizes, scale=1):
    return ", ".join(f"{width * scale}x{height * scale}" for width, height in sizes) or "Unknown"


def print_file_result(result):
    dimensions = f"{format_sizes(result.sizes)} -> {format_sizes(result.sizes, result.scale)}"
    if result.status == "converted":
        print(f"OK: {result.file} -> {result.output} ({result.scale}x; {dimensions})")
    elif result.status == "skipped":
        print(f"SKIP: {result.file} ({result.scale}x; {dimensions}; {result.reason})")
    else:
        print(f"ERROR: {result.file} ({result.scale}x; {dimensions}): {result.detail}", file=sys.stderr)


def _print_table(headers, rows):
    widths = [max(len(str(row[index])) for row in [headers, *rows])
              for index in range(len(headers))]

    def format_row(row):
        return "  " + "  ".join(str(value).ljust(width) if index < 3 else str(value).rjust(width)
                                for index, (value, width) in enumerate(zip(row, widths)))

    print(format_row(headers))
    print("  " + "  ".join("-" * width for width in widths))
    for row in rows:
        print(format_row(row))


def _print_reasons(title, reasons):
    if reasons:
        print(f"\n{title}")
        for reason, count in reasons.items():
            print(f"  {count:>5}  {reason}")


def print_summary(results):
    grouped = defaultdict(Counter)
    for result in results:
        grouped[(result.scale, result.sizes)][result.status] += 1
    rows = []
    for (scale, sizes), counts in sorted(grouped.items()):
        rows.append((f"{scale}x", format_sizes(sizes), format_sizes(sizes, scale),
                     counts["converted"], counts["skipped"], counts["failed"]))
    totals = Counter(result.status for result in results)
    file_count = len({result.file for result in results})
    scales = ", ".join(f"{scale}x" for scale in sorted({result.scale for result in results}))
    print("\nCursor Upscale")
    print("==============")
    print(f"Files: {file_count}  |  Attempts: {len(results)}  |  Scales: {scales}\n")
    _print_table(("Scale", "Source size(s)", "Target size(s)", "Converted", "Skipped", "Failed"), rows)
    print(f"\nTotal: {totals['converted']} converted, {totals['skipped']} skipped, {totals['failed']} failed")
    written = {result.output for result in results if result.output is not None}
    enlarged = {result.output for result in results if result.status == "converted" and result.output is not None}
    print(f"Cursor files written: {len(written)} ({len(enlarged)} enlarged, {len(written - enlarged)} kept unchanged)")
    if written:
        print(f"Location: {os.path.commonpath([str(path.parent) for path in written])}")
    _print_reasons("Skipped by reason", Counter(result.reason for result in results if result.status == "skipped"))
    _print_reasons("Failed by reason", Counter(result.reason for result in results if result.status == "failed"))
    print("\nUse -v / --verbose for per-file details.")
