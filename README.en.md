# Cursor Upscale

[한국어](README.md) | English

Enlarge `.cur` and `.ani` pixel-art cursors while keeping pixel edges crisp.

## Setup

Install Python 3.10 or newer and [uv](https://docs.astral.sh/uv/getting-started/installation/), then run this from the project folder:

```sh
uv sync
```

## Usage

Pass a folder to enlarge its cursors by 2x, including cursors in subfolders.

```sh
uv run python cursor_upscale.py ./cursors
```

Use `--scale` for an integer factor of 2 or greater.
Use `--all` to add every size that fits from the 2x, 5x, and 10x factors.

```sh
uv run python cursor_upscale.py ./pointer.cur --scale 4
uv run python cursor_upscale.py ./cursors --all
```

By default, only a summary is shown. Add `-v` or `--verbose` to see individual file results.

## Output

- Folder input is saved to `cursors_upscaled/`.
- File input gets an `_upscaled` suffix, such as `pointer_upscaled.cur`.

Each cursor file contains its different sizes together. Folder inputs keep their file names and subfolder structure, and `.inf` files are copied too.

Original and existing output files are never overwritten. Move or rename previous output before running again.

The maximum size is **256×256px**. Scales that exceed it are skipped. Files that cannot fit even at 2x are reported as errors.
