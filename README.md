# MATView

MATLAB `.mat` dosyalarını okuyan, MATLAB benzeri grafik çizen; yakınlaştırma/uzaklaştırma, bozucu veriyi silme, FFT/PSD/spektrogram, süzgeç ve akustik temizleme sunan kurulumsuz masaüstü uygulaması. İnternet ve kurulum gerektirmez.

## Kullanım
- `dist/MATView.exe` (Windows 10+, Edge veya Chrome gerekir): çift tıklayın ya da `.mat` dosyasını exe'nin üzerine sürükleyin.
- `dist/matview.html`: aynı arayüz, tek dosya; tarayıcıda açılır.

## Özellikler
- MATLAB v5 (sıkıştırılmış) ve v7.3 (HDF5, klasik yapı) okuma; yalnızca seçilen değişken yüklenir.
- Zaman ekseni `cnt` paket sayacından türetilir (varsayılan 10 ms/paket, "Zaman ayarları"ndan değiştirilebilir); kayıp paketler boşluk olarak görünür.
- Büyük veri (14 M+ örnek) için min/max inceltme; kutu/tekerlek zoom, pan, veri imleci.
- Kutu/kement ile nokta silme, eşik ve Hampel sıçrama tespiti, geri al/yinele (orijinal dosya değişmez).
- Spektrum, spektrogram, Butterworth süzgeçler, MATLAB tarzı ifade satırı.
- Akustik: dinleme, tık/notch/HP/LP/spektral gürültü azaltma, WAV kaydı.
- Dışa aktarma: PNG, CSV, MAT (v5), oturum.

## Derleme
```
python3 build.py                      # src/* -> dist/matview.html (+ launcher/matview.html)
cd launcher
CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -trimpath -ldflags="-H=windowsgui -s -w" -o ../dist/MATView.exe .
```
Go yalnızca standart kütüphaneyi kullanır. `test/` altında Node ve Playwright testleri bulunur (gerçek veri dosyaları depoda yoktur).

## Yapı
`src/mat.js` (v5 okuyucu), `src/h5.js` (HDF5), `src/dsp.js`, `src/expr.js`, `src/plot.js` (grafik motoru), `src/store.js` (veri modeli), `src/app1.js`/`app2.js` (arayüz), `launcher/main.go` (yerel sunucu + tarayıcı başlatıcı).

## Testler hakkında
`test/` altındaki betikler gerçek ölçüm dosyalarına ihtiyaç duyar; bu dosyalar depoda yoktur. Dosyaları (`veri_A.mat`, `veri_B.mat`, `veri_C.mat`) bir klasöre koyup `MATVIEW_TEST_DATA` ortam değişkeniyle klasörü gösterin. Kanal adları kendi verinize göre uyarlanmalıdır.


## Binary dosya çözme

`Binary aç…` düğmesi (veya .bin dosyasını pencereye sürükleme) ile ham binary dosya, Excel'de tanımlanan çerçeve matrisiyle çözülür.

- **Çerçeve** sayfası: her hücre 1 bayttır, hücreye alt sistem adı yazılır. Çerçeve uzunluğu = hücre sayısıdır (ör. 125 × 100 = 12500 bayt). Aynı ad birden çok hücrede geçerse kanallar `AD_1`, `AD_2`… olur.
- **Senaryo** sayfası: okuma sırası (satır/sütun), senkron kelimesi (hex), kare hızı, atlanacak bayt, sayaç alanı (kayıp kareleri zaman boşluğu olarak gösterir).
- **Alanlar** sayfası: birleşik değer tanımı (başlangıç hücresi, tür, bayt sırası, bit aralığı, `x` ile dönüşüm formülü, birim). Formüller uygulamada da düzenlenir.
- Çözülmüş alanlar `.mat` olarak dışa aktarılabilir (isteğe bağlı olarak alt sistem başına ham bayt matrisleri).
- Örnek: `ornek/ornek_cerceve.xlsx` + `ornek/ornek_veri.bin` (sentetik; `python3 test/make_sample.py ornek` ile yeniden üretilir).

## UNV (dataset 58) ve profil karşılaştırma

- `.unv` dosyası `Dosya aç…` ile (veya sürükleyerek) açılır; kanal sayısı dosyadan okunur. Kompleks kanallar Genlik / Faz / Re / Im olarak gelir. Spektrum görünümünde çizilir, lejantta PSD kanalları için Grms gösterilir.
- `Kanal tablosu…` meta veriyi listeler; `Excel'e aktar` eski dönüştürücü betiklerdeki gibi `Kanal Bilgileri` + `Veri` sayfalarını yazar.
- `UNV / Profil` sekmesinde profil (frekans–seviye noktaları, log-log doğrusal, ± dB tolerans) girilir, spektrum grafiğine eklenir ve ölçümlerle karşılaştırılır (Grms farkı, en büyük sapma, tolerans dışı yüzde). Profiller tarayıcı deposunda saklanır.
- Örnek (sentetik): `ornek/ornek.unv`.

## Test seviyesi ve akustik otomatik temizleme

- **Test seviyesi (Analiz sekmesi):** titreşim izinde −9/−6/−3/0 dB gibi seviye platolarını otomatik bulur (pencere RMS'i, adıma yuvarlama), zaman grafiğini boyar, "Seviye başına spektrum" her plato için PSD çizer. Referans (0 dB) en yüksek seviye ya da seçilen profilin Grms'idir. Profille karşılaştırmada seviye otomatik tespit edilip profil o seviyeye kaydırılır.
- **Akustik → Otomatik temizle:** DC/eğilim, 50/60 Hz uğultusu, düşük frekans gürültüsü, tık/pop ve gürültü profilini kendisi bulur; sessiz bölüm yoksa gürültü tabanını minimum istatistikle tahmin eder; temiz kanalı ekler, önce/sonra spektrumunu çizer ve ölçülen etkiyi (RMS, gürültü tabanı, uğultu tepesi) yazar.


## Arayüz (UX) güncellemesi
- **Grafik üstü kontroller:** her alt grafikte üzerine gelince çıkan düğmeler (kaldır, boşalt, yukarı/aşağı, yüksekliği büyüt, üsttekiyle birleştir); alt grafik ayırıcısını sürükleyerek yükseklik ayarı (çift tık: eşitle).
- **Etkileşimli lejant:** tık = göster/gizle, ✕ = kaldır, sağ tık = renk/kalınlık/taşı, sürükle = başka alt grafiğe taşı. Her kaldırma/taşıma sonrası “Geri al” düğmeli bildirim.
- **Aynı grafiğe ekleme:** ağaçta her satırda iki düğme (yeni alt grafik / aktif grafiğe), sürüklerken “Bu grafiğe ekle” ve “Yeni alt grafik” bölgeleri, Shift+çift tık, Ayarlar’dan çift tık tercihi.
- Ikon seti, Aç/Ayarlar menüleri, karşılama ekranı, tek satır sekmeler, katlanabilir kartlar, klavye gezinme, `?` kısayol listesi.

## Yeni: grafikten spektrum, SVG/PNG, formüller, tablo içe aktarma
- Alt grafik düğme şeridi ve lejant sağ tık menüsünden doğrudan **Spektrum** ve **Spektrogram** hesaplanır.
- **PNG ve SVG (vektör)** kaydı zaman, spektrum, spektrogram ve dağılım görünümleri için (görünüm çubuğundaki PNG/SVG düğmeleri ve Çıktı sekmesi).
- Sol panel sayfa boyunda kalır; her dosya açılır/kapanır menüdür ve kendi kaydırma alanına sahiptir. Tür süzgeçleri yalnız ikondur.
- **Formül** sekmesi (eski İfade): hızlı hesaplar (integral, ikinci integral, türev, kayan RMS/ort/std/maks/min/medyan, z-skoru, normalize, kırp, DC/doğrusal/polinom eğilim çıkar, süzgeçler, zarf, seyreltme…), iki kanal işlemleri (A±B, A·B, A/B, bileşke, açı, korelasyon, kovaryans) ve skaler ölçüler (RMS, ort, std, tepe faktörü, basıklık, çarpıklık, yüzdelik…).
- **CSV / Excel (.xlsx)** içe aktarma: sütun türü, birim ve zaman sütunu seçimi. Veri **zaman serisi** (Zaman grafiği) ya da **özellik / regresyon** (Dağılım görünümü: nokta/çizgi/histogram, doğrusal-polinom-üstel-güç-logaritmik uyum, R², artık grafiği, renk sütunu, korelasyon matrisi, sütun istatistikleri) olarak otomatik ayrılır; istenirse elle değiştirilir.

## Binary çerçeve şablonu
`sablon/MATView_Cerceve_Sablonu.xlsx` (üreten: `test/make_template.py`): Nasıl Kullanılır / Çerçeve (125×100 = 12.500 bayt) / Senaryo / Alanlar / Türler sayfaları. `sablon/sablon_deneme.bin` şablonla uyumlu sentetik deneme verisidir (gerçek veri değildir). Test: `test/pw_sablon.py`.
Ölçüm (sentetik, 12.500 bayt/kare, 700 sn): 10 Hz = 87,5 MB → çözme 0,2 sn; 50 Hz = 437,5 MB → 0,6 sn; çözülmüş alanların .mat çıktısı birkaç MB.

Şablon sütun akışlıdır (100 satır × 125 sütun; 1. sütun = bayt 1-100). Alanlardaki `Periyot (kare)` / `Faz` sütunları karışık hızlı (5 ms / 10 ms) akışı destekler: çerçeve en hızlı alt sisteme göre tanımlanır, yavaş alanlar kendi zaman eksenleriyle okunur. 200 Hz × 700 sn = 1,75 GB dosya da çözüldü (≈2 sn, ≈1,8 GB bellek); 2 GB üstü dosyalar henüz desteklenmez.
