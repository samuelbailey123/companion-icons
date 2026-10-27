"""Print each book's HTML to PDF with headless Chromium (Playwright).

Usage: python3 -I tools/manual/render.py <htmlDir> <pdfDir> <readAt>

Chromium is the renderer because the books lean on CSS grid and inline SVG, which it prints
exactly as a browser shows them. The footer carries the book's name, when the rig was read and
the page number, so a loose printed page can still be placed.
"""
import pathlib
import sys

from playwright.sync_api import sync_playwright

html_dir, pdf_dir, read_at = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]), sys.argv[3]
pdf_dir.mkdir(parents=True, exist_ok=True)

FOOTER = (
    '<div style="width:100%;font:7pt -apple-system,Helvetica,Arial,sans-serif;color:#6b7280;'
    'padding:0 14mm;display:flex;justify-content:space-between">'
    '<span>{book} · read off the rig {read_at}</span>'
    '<span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>'
)

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    for html in sorted(html_dir.glob('*.html')):
        page.goto(html.resolve().as_uri(), wait_until='load')
        out = pdf_dir / f'{html.stem}.pdf'
        page.pdf(
            path=str(out),
            format='A4',
            print_background=True,
            prefer_css_page_size=True,
            display_header_footer=True,
            header_template='<span></span>',
            footer_template=FOOTER.format(book=html.stem, read_at=read_at),
        )
        print(f'  {out.name}: {out.stat().st_size // 1024} KB')
    browser.close()
