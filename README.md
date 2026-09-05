
# Subtitle Translator V11.1 — PC'siz Hızlı PWA

V11.1 is the faster PC-free iPhone web/PWA version.

## Layout
- Portrait: camera top 50%, translation bottom 50%.
- Landscape: camera left 50%, translation right 50%.
- OCR box is movable and resizable inside the camera pane.

## Speed changes
- OCR interval reduced to 750 ms.
- Tesseract uses single-line page segmentation (PSM 7), suited to subtitles.
- OCR crop is capped to 1100 px wide to reduce CPU work.
- High-confidence readable text can translate after one OCR frame.
- Google Translate web endpoint is attempted before MyMemory, with fallback.
- Speech rate default increased to 0.95.

## Important
This remains a PWA and does not require the PC to run the application.
Camera access requires HTTPS.
The OCR engine is Tesseract.js running on the iPhone browser.
