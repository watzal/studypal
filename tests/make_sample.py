"""Build a small two-page textbook-style PDF for tests and demos."""
import sys

import pymupdf

PAGES = [
    ("Chapter 6: Photosynthesis",
     "All living organisms need energy to carry out their life processes. "
     "Photosynthesis is defined as the process by which green plants make their own food using sunlight. "
     "It takes place mainly in the leaves of the plant. "
     "The green pigment present in leaves is called chlorophyll. "
     "Chlorophyll absorbs light energy, mostly in the blue and red parts of the spectrum. "
     "The overall reaction can be written as 6CO2 + 6H2O = C6H12O6 + 6O2 in the presence of light. "
     "Oxygen is released as a by-product of this reaction. "
     "Tiny pores on the surface of the leaf allow gases to move in and out. "
     "These pores are known as stomata. "
     "Plants that grow in deserts often keep their stomata closed during the day."),
    ("6.2 Factors affecting photosynthesis",
     "Several conditions change how fast a plant can make food. "
     "Light intensity is the most important factor on a bright day. "
     "The rate of photosynthesis rises as temperature increases, up to about 35 °C. "
     "Above this temperature the enzymes involved begin to lose their shape. "
     "Carbon dioxide concentration in air is only about 0.04 %, so it often limits the rate. "
     "Jan Ingenhousz showed in 1779 that plants need light to purify air. "
     "For example, a pond plant gives off more bubbles when a lamp is moved closer. "
     "Therefore farmers in greenhouses sometimes add extra carbon dioxide to raise crop yields."),
]


def build(path: str) -> None:
    doc = pymupdf.open()
    for title, body in PAGES:
        page = doc.new_page(width=420, height=595)
        page.insert_text((40, 60), title, fontsize=15, fontname="helv")
        page.insert_textbox(pymupdf.Rect(40, 80, 380, 560), body, fontsize=11,
                            fontname="helv", lineheight=1.5)
        page.insert_text((200, 580), str(page.number + 1), fontsize=9)
    _exercise_page(doc)
    for page in doc:  # running footer, as in NCERT books
        page.insert_text((40, 570), "Science Class 7", fontsize=9, fontname="helv")
    doc.save(path)


def _exercise_page(doc) -> None:
    """NCERT-style layout traps: an image before the text, a running footer,
    numbered questions, and answer options in their own block."""
    page = doc.new_page(width=420, height=595)
    pix = pymupdf.Pixmap(pymupdf.csRGB, pymupdf.IRect(0, 0, 8, 8), False)
    page.insert_image(pymupdf.Rect(300, 20, 340, 60), pixmap=pix)
    page.insert_text((40, 60), "Exercises", fontsize=11, fontname="hebo")
    y = 90
    for i, (q, opts) in enumerate([
            ("Plants release oxygen during the day.", "true false"),
            ("Stomata are found mostly on the leaf surface.", "upper lower")], 1):
        page.insert_text((40, y), f"{i}.", fontsize=11)
        page.insert_text((60, y), q, fontsize=11)
        page.insert_text((60, y + 18), opts, fontsize=11)
        y += 50
    page.insert_text((360, 570), "3", fontsize=9)


if __name__ == "__main__":
    build(sys.argv[1] if len(sys.argv) > 1 else "sample.pdf")
