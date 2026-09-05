
# Subtitle Translator V11 — PC'siz iPhone sürümü

Bu sürüm native iOS değil; iPhone Safari üzerinde çalışan standalone PWA prototipidir.
PC'de OCR/çeviri sunucusu çalıştırmaz.

Mimari:
- iPhone kamera: Safari
- OCR: Tesseract.js/WebAssembly, cihaz üzerinde
- Çeviri: MyMemory internet API
- Ses: iPhone Speech Synthesis
- PWA: Ana Ekrana Ekle / standalone

Tesseract.js browser ve Node üzerinde WebAssembly tabanlı OCR sağlar.
MyMemory API, `q` ve `langpair=en|tr` ile REST çevirisi sağlar.

## Kullanım
HTTPS altında yayınlanmalıdır; kamera için güvenli bağlam gerekir.
GitHub Pages, Cloudflare Pages veya benzeri bir HTTPS statik hosting kullanılabilir.

1. Dosyaları bir HTTPS statik siteye yükle.
2. iPhone Safari ile siteyi aç.
3. Kamerayı Aç.
4. Sarı kutuyu altyazıya getir.
5. Safari menüsünden Ana Ekrana Ekle.
6. Uygulama gibi aç.

## Önemli
Bu ilk PC'siz prototiptir. Tesseract.js, EasyOCR kadar güçlü olmayabilir ve ilk OCR model yüklemesi internetten yapılır. Gerçek cihaz testinden sonra performans/accuracy optimizasyonu yapılmalıdır.
