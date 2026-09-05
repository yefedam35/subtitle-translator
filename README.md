# Subtitle Translator V11.8 — Online OCR

Bu sürümde Tesseract.js tamamen kaldırıldı.

Mimari:
iPhone kamera → seçili altyazı crop'u → OCR.space Engine 3 → MyMemory İngilizce/Türkçe çeviri → iPhone ekranı/seslendirme.

OCR.space dokümantasyonuna göre Engine 3 en yüksek doğruluğu hedefleyen motordur ve Engine 2'ye göre daha yavaştır; Engine 2 ise hız/kalite dengesi için önerilir. Bu sürüm özellikle önceki Tesseract hatalarını aşmak için Engine 3 kullanır.

## API anahtarı
Ayarlar içindeki OCR API anahtarı alanına OCR.space ücretsiz API anahtarını girebilirsin. Test için `helloworld` bırakılabilir; ücretsiz servis IP başına günlük istek limiti uygular.

## Kullanım
1. Dosyaları GitHub Pages'e yükle.
2. iPhone Safari'den siteyi aç.
3. Kamerayı Aç.
4. Sarı kutuyu altyazının tamamına getir.
5. Ayarlardan gerekiyorsa OCR API anahtarını gir.
6. Çeviri geldiğinde Seslendir'e bas.

Not: Online OCR kullanıldığı için bu sürüm internet gerektirir. Kamera görüntüsünün yalnızca sarı kutu içindeki crop'u OCR servisine gönderilir.
