"""Render the rig manual's HTML books to PDF with Playwright's Chromium.

Usage:
    python3 scripts/manual_pdf.py <htmlDir> <pdfDir>

Reads operator.html, reference.html and recovery.html from htmlDir (tools/manual.js writes
them) and writes "Rig Manual 1 - Operator Guide.pdf" and its two siblings to pdfDir, US Letter,
with a running header naming the book and a footer with the page number and the date the rig
was read. Chromium is the only renderer that draws the key grids and SVG drawings exactly as
the HTML says, which is why this is not a pure-Python PDF library.
"""

import re
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

BOOKS = [
    ("operator", "Rig Manual 1 - Operator Guide.pdf", "Operator Guide"),
    ("reference", "Rig Manual 2 - Reference.pdf", "Reference"),
    ("recovery", "Rig Manual 3 - Recovery Guide.pdf", "Recovery Guide"),
]

SMALL = "font-family:-apple-system,Helvetica Neue,Arial,sans-serif;font-size:7.5pt;color:#64748b;width:100%;padding:0 0.6in;"


def read_at(html: str) -> str:
    """The cover's 'Read from the rig' value, for the footer."""
    m = re.search(r"<dt>Read from the rig</dt><dd>([^<]*)</dd>", html)
    return m.group(1) if m else ""


def main(src: Path, dst: Path) -> None:
    dst.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        for kind, filename, title in BOOKS:
            html_path = src / f"{kind}.html"
            page.goto(html_path.resolve().as_uri(), wait_until="load")
            page.evaluate("document.fonts.ready")
            when = read_at(html_path.read_text())
            page.pdf(
                path=str(dst / filename),
                format="Letter",
                print_background=True,
                display_header_footer=True,
                header_template=f'<div style="{SMALL}display:flex;justify-content:space-between"><span>Triumph Church rig manual</span><span>{title}</span></div>',
                footer_template=f'<div style="{SMALL}display:flex;justify-content:space-between"><span>Read from the rig {when}</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>',
                margin={"top": "0.7in", "bottom": "0.75in", "left": "0.6in", "right": "0.6in"},
            )
            print(f"{filename}")
        browser.close()


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit("usage: python3 scripts/manual_pdf.py <htmlDir> <pdfDir>")
    main(Path(sys.argv[1]), Path(sys.argv[2]))
