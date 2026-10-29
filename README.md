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
- **Kod** görünümü: MATLAB alt kümesini (matris, hücre, yapı, işlev, döngüler, fft/butter/filtfilt/pwelch…) kurulum olmadan çalıştırır; `ch('kanal')` ile açık kanalları okur, `addch` ile sonuç ekler; `figure/subplot/plot` ile **Figür** görünümüne çizer. `.m` dosyaları açılır/kaydedilir. GUIDE arayüzleri (`.m` + `.fig`) **Arayüz** görünümünde çalışır.

## Derleme
```
python3 build.py                      # src/* -> dist/matview.html (+ launcher/matview.html)
cd launcher
CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -trimpath -ldflags="-H=windowsgui -s -w" -o ../dist/MATView.exe .
```
Go yalnızca standart kütüphaneyi kullanır. `test/` altında Node ve Playwright testleri bulunur (gerçek veri dosyaları depoda yoktur).

## Yapı
`src/mat.js` (v5 okuyucu), `src/h5.js` (HDF5), `src/dsp.js`, `src/expr.js`, `src/plot.js` (grafik motoru), `src/store.js` (veri modeli), `src/app1.js`/`app2.js` (arayüz), `src/mlab1-3.js` (MATLAB alt kümesi: ayrıştırıcı, yorumlayıcı, işlev kütüphanesi), `src/app13.js` (Kod/Figür arayüzü), `launcher/main.go` (yerel sunucu + tarayıcı başlatıcı).

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

## Büyük binary dosyalar ve ek analizler
- 200 MB üstü binary dosyalar blok blok (File.slice) okunur; yalnız Alanlar sayfasında tanımlı alanlar çıkarılır (ham bayt kanalları yok). 2,65 GB dosya ≈3 sn, ≈70 MB bellek. Test: `test/pw_stream.py` (parçalı ve bütün okuma aynı sonucu verir).
- Analiz sekmesi: oktav/1/3 oktav bant seviyeleri (Z/A/C ağırlık, genel seviye), SRS (Smallwood, mutlak ivme, Q ve nokta/oktav ayarlı), iki kanallı FRF (H1/H2, faz, koherans). Çekirdek: `src/dsp.js`, arayüz: `src/app8.js`, testler: `test/t_an.js` (analitik doğrulamalar), `test/pw_an.py`.

## Rapor, harmonik imleç, WAV, bit akışı
- **Rapor** (Çıktı sekmesi / "Rapora ekle"): görünümleri, istatistik/veri özeti tablolarını ve notları toplar; kapak, özet+revizyon geçmişi+içindekiler, her sayfada üstte logo–rapor adı–dok no/tarih/proje no/revizyon, altta gizlilik derecesi ve "Sayfa x / N" olan A4 rapor üretir. Bilgiler üretmeden önce sorulur (kaydedilir; logo isteğe bağlı). Önizlemeden "Yazdır / PDF" veya HTML. Kod: `src/app9.js`, test: `test/pw_rep.py`, örnek çıktı: `sablon/ornek_rapor.pdf` (sentetik).
- **Harmonik/yan-band imleçleri**: Analiz sekmesi; spektrum görünümünde k×f0 ve ±m×aralık çizgileri (PNG/SVG'ye de girer).
- **WAV** (PCM 8/16/24/32, float 32/64, çok kanallı) açılır.
- **TDMS** (NI LabVIEW/DAQ) açılır: grup/kanal ağacı, `wf_increment` ve `wf_start_offset` ile zaman ekseni, birim, çok segmentli / interleaved / big-endian dosyalar, string ve zaman damgası özellikleri. DAQmx ham veri biçimi desteklenmez. Test: `test/make_tdms.py`, `test/t_tdms.js`.
- **Bit akışı alanı** (`ub`/`sb`, Bit="a-b"): 12/14 bit paketli telemetre için; şablonda örnek var.

## MAT dışa aktarma ve Word raporu
- **MAT**: soldaki ağaçta binary dosya adına / alt sisteme / kanala sağ tıklayın ya da Çıktı sekmesindeki "MAT dışa aktarma" kartını kullanın. Seçenekler: tek alt sistem (ham bayt matrisi uint8 kare×bayt + o alt sisteme ait çözülmüş alanlar, isteğe bağlı bayt aralığı "1-100, 250"), tüm binary tek .mat, her alt sistem ayrı .mat (tek .zip), seçilen kanallar (Ctrl/Shift ile) tek .mat. Büyük dosyada ham bayt parça parça okunur. Açık grafiğin CSV/MAT çıktısı Çıktı sekmesinde durur. Kod: `src/app10.js`, test: `test/pw_mat.py`.
- **Word**: rapor önizlemesindeki "Word (.docx) kaydet" (kapak, üst/alt bilgi ve sayfa no alanları, içindekiler, şekil/tablo/not). İçindekiler sayfa numaraları Word'de F9 ile güncellenir. Kod: `src/app11.js`, test: `test/pw_docx.py`.

## Rezonans analizi (Re/Im)
UNV sekmesi → "Rezonans analizi": kompleks FRF kanalının Re/Im değerlerinden |H| tepelerini (parabolik ara değer), yarı-güç bant genişliğinden sönümü (ζ, Q), tepedeki fazı ve Im tepe frekansını bulur; |H|/Faz/Re-Im grafiklerini Spektrum görünümüne, Nyquist'i Dağılım görünümüne çizer; tablo rapora eklenebilir veya kopyalanır. Sentetik örnek: `ornek/ornek_frf.unv` (`test/make_frf_unv.py`), testler: `test/t_an.js`, `test/pw_rez.py`.

## Sürüm 2.0 — test mühendisliği güncellemesi
Sağ paneldeki **Kalite · Test · Araçlar** sekmeleri ve **Çıktı ▸ Yöntem / Silme geçmişi** kartları eklendi.

- **Kalite**: kırpılma, sıçrama, kopma, sabit kanal, DC kayması taraması; kanal başına karar tablosu.
- **Güvenilir spektrum**: Welch (periyodik Hann; scipy/MATLAB `pwelch` ile 1e-15 uyumlu), ENBW, etkin ortalama sayısı, serbestlik derecesi, ki-kare güven aralığı.
- **Şartname uygunluğu** (Test): profil + tolerans şablonu (MIL-STD-810H Yöntem 514 ortalama/tek kanal, ISO, özel), faz/seviye tespiti, Grms ve ASD toleransı, ihlal bölgeleri, serbestlik derecesi uyarısı. Şablon değerleri yayımlanmış karşılaştırma tablolarından alınmıştır; **resmî şartnameyle doğrulayın** (SMC-S-016 şablonu yoktur, "özel" ile girin).
- **Kontrol / cevap**: kanal adları değiştiği için rolleri (kontrol, cevap) siz atarsınız; kontrol ortalaması/zarfı, transmisibilite (H1/H2), koherans.
- **Akustik bant tablosu** (OASPL + şartname), **şok analizi** (tepe, süre, ΔV, SRS, şekil uyumu), **termal analiz** (rampa hızı, kararlılık, profil sapması, zarf).
- **Araçlar**: ortak ızgaraya yeniden örnekleme, kanallar arası korelasyon/gecikme, olay/anomali listesi, tonal bileşenler, notlar.
- **Şablonlar ve toplu özet**: ayarlar + rol kalıpları şablon olarak kaydedilir/.json olarak taşınır; toplu özet açık tüm dosyalarda aynı analizi yapıp tek tabloda toplar (CSV/rapor).
- **İzlenebilirlik**: her işlem günlüğe yazılır; rapordaki "Yöntem" metni ve MAT çıktısındaki `MATView_islem_gunlugu` buradan üretilir. Silme geçmişi ve ham veri görünümü.
- **Altyapı**: DSP hesapları Web Worker'da (olmazsa ana iş parçacığı); hata günlüğü ve "tanı paketi" (veri içermez); `F1` yardım/kılavuz/sürüm/değişiklik; kısayollar (Ctrl+S/O/E, Ctrl+Shift+R, N).

### Yeni dosya biçimleri ve doğrulama durumu
| Biçim | Durum | Nasıl doğrulandı |
|---|---|---|
| TDMS (normal, çok segmentli, big-endian, string/olay) | gerçek dosya + sentetik | nptdms |
| TDMS **DAQmx** ham veri (format değiştiren / sayısal hat ölçekleyici) + NI ölçekleme (Linear, Polynomial, Table, Add/Subtract) | **yalnız sentetik** | nptdms'in test üreticisi + nptdms okuması ile birebir. RTD/Strain/Thermistor/Thermocouple ölçekleri desteklenmez (ham değer + uyarı) |
| MAT v5 **struct / cell / struct dizisi** (`S.alan`, `C{1}`, `T(2).v`) | **yalnız sentetik** | scipy.io.savemat |
| MAT v7.3 iç içe grup / cell / struct dizisi (başvurular) | **yalnız sentetik** | hdf5storage + elle h5py |
| **İkili UNV 58b** | **yalnız sentetik** | pyuff'un ikili yazıcısı (başlıktaki bayt sayısı hatalıysa kayıt 7'den hesaplanır) |
| **MDF4** (.mf4/.mdf; DT/DZ/DL/HL, sıkıştırılmış/transpoze, sıralı ve sırasız, doğrusal/rasyonel/tablo dönüşümü) | **yalnız sentetik** | asammdf (4.00/4.10/4.20 × 3 sıkıştırma); sırasız kayıt-kimlikli dosya elle yazıldı. MDF3, VLSD/metin ve dizi/yapı kanalları desteklenmez |

Gerçek dosyada sorun görürseniz `F1 ▸ Sorun bildir` ile veri içermeyen tanı paketini kaydedebilirsiniz.

### Test
`bash test/run_tests.sh` — Node birim testleri (DSP, scipy doğrulaması, MAT/HDF5/UNV/TDMS/MDF ayrıştırıcıları) ve Playwright arayüz testleri. Sentetik dosyaları üretmek için `numpy scipy h5py hdf5storage nptdms pyuff asammdf pytest` gerekir (yalnız test için).

## Sürüm 2.1 — Telemetre çerçevesi (alt sistem sayfalı Excel)

Sol menüde **Binary dosya (Excel çerçeve)…** (ya da çerçeve `.xlsx` ile binary'yi birlikte sürükleyip bırakma). Her alt sistem ayrı bir sayfadır; ilk satır başlık: `Birim · Index · Değişken · Tip · Eleman Sayısı · Formül · Byte Endian · Bit Endian · Örnek Sayısı · Undersample Header · isUndersample` (başlık yazımı, tip büyük/küçük harfi, boşluklar önemsenmez). Anlamlar telemetryParser ile uyumludur.

| Alan | Anlamı |
|---|---|
| Index | Çerçevede bayt sırası (**Index tabanı** ayarı: 0 tabanlı varsayılan — telemetryParser ile aynı — 1 tabanlı seçilebilir). `auto` = önceki değişkenin bittiği yer. `11.3` = bayt 11, bit 3. `i=1:35, (i-1)*24+26` = tekrar: her tekrar ayrı değişken (`ad_1…ad_35`, adda `{i}` kullanılabilir; aralık `a:b`, `a:adım:b`, `[1 4 9]`). |
| Tip | UInt/Int 8–64 (uint12, int24 gibi herhangi bir bit genişliği, bit akışı olarak), BitN, bool, Single/Double, stream, bayt dizisi (kanal olmaz) |
| Eleman Sayısı | 2–8: ayrı kanallar (`ad_1…ad_N`); 8'den büyük: tek dalga kanalı |
| Örnek Sayısı | Sayı N: değişken N örnek tutar, yan yana. `B2`: **blok** — birimin satırları bir kez dizilir, blok B kez tekrarlanır (önce tüm değişkenlerin 1. örneği, sonra 2. örneği). "B örnekleme düzeni" ayarıyla "değişken ardışık" da seçilebilir. Zaman ekseni kare periyodu / örnek sayısı. |
| Formül | `X`/`x`; `^`, `sqrt`, `&`, `>>`, `if(L3%8 == 2) …` (koşulu sağlamayan örnekler atlanır, zaman ekseni boşluklu kalır). |
| Byte/Bit Endian | `big` = büyük uçlu (varsayılan küçük); bit akışı için MSB (varsayılan) / LSB |
| stream | Her karedeki Index'ten başlayan *Eleman Sayısı* baytlık yuvalar kareler boyunca art arda eklenir, *Undersample Header* (hex) aranır; paket (header + isUndersample=1 satırları) birkaç kareye yayılabilir. Paket içi indexler paketin başına göredir. Paketin zamanı, başladığı karedir. |

**Kalıcı işaretleme:** *Bu çerçeveyi kalıcı işaretle* kutusu çerçeveyi tarayıcıda saklar, sonraki açılışlarda otomatik yüklenir. **Çözme:** binary seçilir (kare periyodu varsayılan 10 ms, çerçeve 12.500 bayt), sonuç ana ekranda *alt sistem → değişken* ağacıdır. Tanımsız baytlar, okunamayan satırlar (geçersiz tip, bozuk formül, çerçeve dışı Index, bulunamayan akış başlığı) uyarı/hata olarak raporlanır; aynı baytları iki sayfa tanımlıyorsa (üst/alt sistem, reserved) bilgi olarak. `reserved/rezerve` adlı satırlar kanal olmaz. 700 MB üstü dosyalarda kanallar seçildikçe dosyadan okunur.

**Çerçeve düzeni (2.2):** *3. Çerçeve düzeni* bölümü: sütun × satır (varsayılan 125×100), *sütun öncelikli (transpoze)*, header (hex; başta/sonda; sıkı sync) ya da sabit boyut + *kayma*, kayıttaki toplam sütun ve atılacak sütunlar (1'den başlar). **Düzeni otomatik bul**, Excel'deki akış başlıklarının beklenen yuvalara oturduğu transpoze + kaymayı bulur (ilk 8 MB, oylama + doğrulama). Doğrulanmış örnek: 5 bağımsız akışın hepsi şablon Index'lerine birebir oturdu.

**Henüz yok (telemetryParser'da var):** çerçeve belirteci/tipleri (birden çok şablon), çerçeve sayacı ve kayıp çerçeve tespiti, birim başına .mat çıktısı, `Birim.değişken` / `ad[3]` formül başvuruları, devasa dosya için disk önbelleği.
