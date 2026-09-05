
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


## Ekran düzeni
- Dikey: kamera üstte %50, çeviri altta %50.
- Yatay: kamera solda %50, çeviri sağda %50.


## V11.3 kamera düzeltmesi
- Kamera yalnızca gerçek kullanıcı dokunuşuyla başlatılır.
- HTTPS/güvenli bağlam kontrolü eklenmiştir.
- iPhone Safari için arka kamera (`environment`) tercih edilir.
- Kamera görüntüsünün gerçekten hazır olduğu doğrulanır.
- Kamera izin hataları kullanıcıya anlaşılır şekilde gösterilir.
- Kamera hazır olmadan OCR başlatılmaz.


## V11.4 OCR kutu düzeltmesi
- object-fit: cover koordinat dönüşümü düzeltildi.
- Sarı kutunun seçtiği gerçek kamera alanı doğru crop ediliyor.
- Crop otomatik büyütülüyor ve kontrast artırılıyor.
- Tek satır altyazı OCR ayarları iyileştirildi.
