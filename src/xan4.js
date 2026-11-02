/* ===== Faz 5: Arka plan işçisi (D1), hata günlüğü / sürüm / yardım (D3, D4), analiz şablonları (C3), toplu özet (C4) ===== */

/*DSPSRC*/
/* ---------- D1: DSP için Web Worker (yoksa ana iş parçacığına düşer) ---------- */
const DSPW = (() => {
  let w = null, dead = false, seq = 0; const pend = new Map();
  function fallback(fn, args) { return DSP[fn](...args); }
  function start() {
    if (w || dead) return !!w;
    try {
      if (typeof Worker === 'undefined' || typeof __DSP_SRC !== 'string') throw new Error('worker yok');
      // sonuçtaki tamponlar kopyalanmadan geri aktarılır (Transferable)
      const src = __DSP_SRC + '\nconst bufs = (r, s) => { if (r && ArrayBuffer.isView(r)) { if (!(typeof SharedArrayBuffer !== \'undefined\' && r.buffer instanceof SharedArrayBuffer)) s.add(r.buffer); } else if (r && typeof r === \'object\') for (const k in r) { const v = r[k]; if (v && (ArrayBuffer.isView(v) || typeof v === \'object\')) bufs(v, s); } return s; };\nonmessage = e => { const {id, fn, args} = e.data; try { const r = DSP[fn](...args); postMessage({id, r}, [...bufs(r, new Set())]); } catch (err) { postMessage({id, err: String(err && err.message || err)}); } };';
      w = new Worker(URL.createObjectURL(new Blob([src], {type: 'text/javascript'})));
      w.onmessage = e => { const p = pend.get(e.data.id); if (!p) return; pend.delete(e.data.id); if (e.data.err) p.rej(new Error(e.data.err)); else p.res(e.data.r); };
      w.onerror = e => { dead = true; try { w.terminate(); } catch (_) {} w = null; if (typeof logErr === 'function') logErr('worker', e && e.message || 'worker hatası'); for (const [, p] of pend) { try { p.res(fallback(p.fn, p.args)); } catch (er) { p.rej(er); } } pend.clear(); };
    } catch (_) { dead = true; w = null; }
    return !!w;
  }
  // büyük bir tamponun küçük bir görünümü klonlanırken tüm tampon kopyalanmasın
  const slim = a => (ArrayBuffer.isView(a) && a.buffer.byteLength > a.byteLength * 1.5) ? a.slice() : a;
  // own: çağıranın bir daha kullanmayacağı geçici diziler (ör. DSP.segment çıktısı) — kopyalanmadan işçiye aktarılır
  function run(fn, args, own) {
    if (!start()) return Promise.resolve().then(() => fallback(fn, args));
    return new Promise((res, rej) => {
      const id = ++seq; pend.set(id, {res, rej, fn, args});
      try {
        const sent = args.map(a => own && own.includes(a) ? a : slim(a)), tr = [];
        if (own) for (const a of own) if (a && ArrayBuffer.isView(a) && a.byteOffset === 0 && a.byteLength === a.buffer.byteLength && !tr.includes(a.buffer)) tr.push(a.buffer);
        w.postMessage({id, fn, args: sent}, tr);
      } catch (e) { pend.delete(id); try { res(fallback(fn, args)); } catch (er) { rej(er); } }
    });
  }
  // işçi ölmüşse/yoksa ana iş parçacığında: hata durumunda veri (aktarıldıysa) kaybolmasın diye fallback args ile çalışır
  return {run, get active() { return !!w; }, get dead() { return dead; }, start};
})();

/* ---------- D3: hata günlüğü ---------- */
S.errLog = (() => { try { return JSON.parse(sessionStorage.getItem('mv.errlog') || '[]'); } catch (_) { return []; } })();
function logErr(kind, msg, stack) {
  S.errLog.push({t: Date.now(), kind, msg: String(msg == null ? '' : msg).slice(0, 400), stack: String(stack || '').slice(0, 1200)}); if (S.errLog.length > 100) S.errLog.shift();
  try { sessionStorage.setItem('mv.errlog', JSON.stringify(S.errLog)); } catch (_) {}
}
window.addEventListener('error', e => logErr('hata', e.message, e.error && e.error.stack));
window.addEventListener('unhandledrejection', e => logErr('söz', e.reason && e.reason.message || e.reason, e.reason && e.reason.stack));

const CHANGELOG = [
  {v: '2.22', d: 'Akustik oynatma ve çözümleme ilerlemesi düzeltmeleri', items: [
    'Akustik oynatma: ses çıkışı düğmeye tıklandığı anda açılır. Uzun hazırlık / temizleme sonrasında açılan ses çıkışı tarayıcı ya da MATView.exe tarafından askıda bırakıldığı için ses çalmıyordu; askıda kalırsa uyarı gösterilir ve ▶ ile yeniden başlatılabilir.',
    'MATView.exe: yerel pencerede ses kullanıcı etkileşimi beklenmeden çalabilir.',
    'Telemetri: “Çöz ve MATView\'de aç” / “Çöz ve dosyalara yaz” sürerken ilerleme çubuğu, durum ve Durdur düğmesi ⋯ menüsüne gizlenmez, üst çubukta görünür kalır.']},
  {v: '2.21', d: 'Dışa aktar menüsü, tablo sıralama, değer listesi süzgeci, klasördeki .m dosyaları', items: [
    'Görünüm çubuğundaki aynı görünen Rapora ekle / PNG / SVG düğmeleri tek “Dışa aktar” düğmesinde toplandı; seçeneklerin her birinin kendi simgesi var.',
    'Tablolarda sütun başlığına tıklayınca sıralanır (artan → azalan → ilk sıra); sıralanan sütunda ▲ / ▼ işareti görünür.',
    'Telemetri “Çözülen Veriler” tablosu: başlığa tıklayarak sıralama; ▾ süzgecinde o sütundaki değerlerden seçim yapılan açılır liste (metin araması ve artan / azalan düğmeleri de var).',
    'Kod sekmesinde sekme kapatma seçenekleri ve kapatma onayındaki düğmeler simgesiz, yalnız metin olarak gösterilir.',
    'Bir .m dosyasından başka bir .m dosyası çağrılırken Klasör panelinde açık klasör ve alt klasörleri (4 düzeye kadar) taranır; ad farklı büyük/küçük harfle yazılsa da bulunur. Bulunan işlevler için “tanımsız” uyarısı verilmez.']},
  {v: '2.20', d: 'Kod: doğrusal cebir, optimizasyon, eğri uydurma, tablo, tarih/süre, CSV ve string', items: [
    'Doğrusal cebir: eig (karmaşık özdeğer ve özvektörler dahil), svd, rank, pinv, cond, lu, qr, chol, expm, null, orth, toeplitz, hankel, vander; norm artık matrislerde 1, 2 ve Inf normlarını, magic çift boyutları da destekliyor.',
    'roots artık MATLAB gibi eşlik matrisinin özdeğerleriyle hesaplanıyor (çoklu köklerde daha doğru).',
    'Polinom ve ara değer: polyder, polyint, residue, mkpp, ppval, unmkpp; spline(x,y) / pchip(x,y) parçalı polinom döndürür; interp2 (linear, nearest, spline), griddata (linear, nearest, v4), delaunay.',
    'Optimizasyon: fminbnd, fminsearch, lsqnonneg, lsqcurvefit, lsqnonlin, optimset / optimoptions.',
    'Eğri uydurma: fit (poly1–poly9, exp1, exp2, power1, power2, gauss1, sin1 ve \'a*exp(-b*x)+c\' gibi katsayılı ifadeler), [f, gof] istatistikleri, f(x) ile değerlendirme, coeffvalues.',
    'Tarih ve süre: datetime (metin, InputFormat, Format, ConvertFrom), duration, seconds/minutes/hours/days/years, year/month/day/hour/minute/second, datetime − datetime = süre, sıralama, diff, karşılaştırma, grafikte zaman ekseni.',
    'Tablo: table (değişken adları argüman adlarından), T.ad, T(satır, değişken), T{…}, yeni sütun ekleme, height/width, array2table, table2array, table2struct, struct2table, sortrows, head/tail.',
    'Dosyalar: readmatrix, readtable, csvread, dlmread, writematrix, writetable, csvwrite, dlmwrite (ayırıcı ve ondalık virgül otomatik tanınır; yazılan dosya indirilir ve aynı oturumda yeniden okunabilir).',
    'String: "çift tırnaklı" metinler string olarak tanınır (+ ile birleştirme, == ile karşılaştırma); string, strings, isstring, strlength, extractBetween, extractBefore, extractAfter.']},
  {v: '2.19', d: 'Kod: yeni MATLAB işlevleri (sinyal işleme, veri temizleme, grafik)', items: [
    'Süzgeç: lowpass, highpass, bandpass, bandstop (gecikmesiz, MATLAB gibi), sgolayfilt, smoothdata (movmean / movmedian / gaussian / lowess / loess / sgolay), sosfilt, iirnotch, fir2, kaiserord, filtic, upfirdn; butter artık \'stop\' tipini de destekliyor.',
    'Spektral: periodogram, pspectrum, bandpower, cpsd, mscohere, tfestimate, snr, thd, sinad, goertzel, dct, idct, xcov.',
    'Dönüşüm: tf2sos, sos2tf, zp2sos, tf2zp, zp2tf, impz, grpdelay, freqs.',
    'Pencere ve sinyal üretimi: kaiser, tukeywin, gausswin, flattopwin, rectwin, bartlett, triang, chirp, sawtooth, square, rectpuls, tripuls, pulstran, buffer.',
    'Veri temizleme ve istatistik: isoutlier, rmoutliers, filloutliers, fillmissing, normalize, rescale, zscore, bounds, islocalmax, islocalmin, findchangepts, discretize, peak2peak, peak2rms, gradient, findgroups, splitapply, groupsummary.',
    'Grafik: stairs, area (altı dolu) ve errorbar (hata çubukları).',
    'Tüm yeni işlevler "İşlevler" listesinde; sonuçlar MATLAB ile aynı formüller kullanılarak sentetik verilerle doğrulandı.']},
  {v: '2.18', d: 'Kod düzenleyicide yazarken hata denetimi', items: [
    'Kod yazarken (durunca ~300 ms) denetlenir: sözdizimi hataları (kapanmayan parantez / tırnak, beklenmeyen simge, eksik end — kapanmayan bloğun satırı gösterilir) kırmızı dalgalı çizgi ve satır işaretiyle.',
    'Uyarılar (sarı): tanımsız değişken / işlev (çalışma alanı, açık sekmelerdeki işlevler ve yerleşik işlevler dikkate alınır), yerleşik işlevi gölgeleyen değişken, işlevde kullanılmayan değişken; bilgi: işlevde ";" olmadığı için ekrana yazdırma.',
    'Editör altında Sorunlar listesi (tıklayınca satıra gider), satır numarasında işaret ve ipucu, konum satırında imlecin bulunduğu satırın iletisi; bulunulan satır vurgusu. Çalışma sırasındaki hata da aynı biçimde işaretlenir.']},
  {v: '2.17', d: 'Listelerde başlığa göre süzme', items: [
    'Tüm tablolarda (çalışma alanı değişkenleri, kalite / test / öznitelik / rainflow sonuçları, tablo verisi sütunları, telemetri ayar tabloları …) sütun başlığındaki ▾: metin araması, sayı aralığı, değer listesi (onay kutuları), artan / azalan sıralama, temizle. Etkin süzgeç başlıkta işaretli; tablo yeniden çizilince korunur.',
    'Telemetri › Çözülen Veriler: template sütunlarının başlığında ▾ ile o sütunda içeren metne göre süzme (birim, etiket, değişken, tip, formül …).',
    'Akustik › konuşma / olay listesi türe göre süzülür.']},
  {v: '2.16', d: 'Akustik ve kanallar', items: [
    'Akustik › Parazit temizleme: "Temizle ve grafiğe ekle" — karttaki ayarlarla temizleyip temiz kanalı ekler ve çizer.',
    'Lejant / iz renkleri: birbirinden kolay ayırt edilen 12 renk; aynı alt grafikte renk tekrarlanmaz, renkler bitince kesikli / noktalı çizgi kullanılır (lejantta da görünür). Elle seçilen renk korunur.',
    'Türetilmiş kanallar: sağ tık › "Türetilmiş kanalı sil" (birden çok seçim, grafikteki izleriyle; Geri al) ve "Formülü düzenle / güncelle" (kanal ve grafikteki izleri yeniden hesaplanır). Türetilmiş grup menüsünde tümünü silme.',
    'Formül: "Kanal ekle" artık kanalı [birim/parametre] biçiminde ekler (/ boşluk . - içeren telemetri adları hata vermez), seçilen kanal aynı adlı başka kanallarla karışmaz; listede grafikteki ve açık dosyalardaki kanallar dosya adıyla görünür.']},
  {v: '2.15', d: 'Arayüz kararlılığı', items: [
    'Sayfa yakınlaştırması (Ctrl+tekerlek, Ctrl + / − / 0, sıkıştırma) kapatıldı; grafiklerin kendi yakınlaştırması aynen çalışır.',
    'Araç satırları (Zaman/Spektrum sekmeleri, grafik araçları, Kod, Telemetri üst çubuğu, Çözülen Veriler başlığı) tek satırda kalır, seçenekler iki yana yaslıdır; yer daralınca önce yazılar gizlenir, sonra sığmayanlar "⋯" menüsüne geçer — alt satıra kayma ve yer oynaması yok.',
    'Uzunluğu değişen yazılar (çerçeve, durum, dosya adı, istatistik satırı, kod konum satırı, kamera bilgisi) sabit genişlikte; sığmazsa kayan yazı olarak gösterilir, çevresindeki seçenekler kımıldamaz.',
    'Akustik: oynatma çubuğu tıklanınca / imleç gezerken grafik boyutunun değişmesi ve titreme giderildi (yuvarlama artığı kaydırma çubuğu açtırmıyor, yazı değişimleri yerleşimi yeniden hesaplatmıyor).',
    'Akustik: grafikteki oynatma çizgisi tutulup sürüklenerek konuma gidilir (sürüklerken ses duraklar, bırakınca sürer).']},
  {v: '2.14', d: 'Telemetri: zaman ekseni düzeltmeleri, yerel çıktı klasörü', items: [
    'Çöz ve MATView\'de aç: tek bir çerçevede bozulan çerçeve sayacı artık zaman eksenini binlerce çerçeve kaydırmıyor (önce 65 bin çerçevelik sahte boşluk oluşabiliyordu). Makul olmayan sıçramada (varsayılan > 10 s) zaman 1 çerçeve ilerler, kayıp sayılmaz; sonraki çerçeve beklenenle sürerse boşluk oluşmaz, yeni değerden sürerse sayaç sıfırlaması kabul edilir.',
    'Çöz ve MATView\'de aç: bir birimin yalnız bazı çerçeve tiplerinde bulunan parametreleri artık diğer çerçevelerde 0 ile doldurulmuyor (veri kesintili görünüyordu); kendi zaman ekseniyle yalnız gerçek örnekler gelir. Çerçeve tipleri arasında farklı bağlamda tanımlı parametreler de doğru zamanı alır. Dosyaya yazılan CSV / .mat değişmez.',
    'Çöz ve dosyalara yaz (yerel uygulama): çıktı klasörü Windows klasör seçicisiyle seçilir ve dosyalar yerel yazıcıyla yazılır — tarayıcının "bu klasör sistem dosyası içeriyor" engeli (sürücü kökü, kullanıcı klasörü vb.) artık çıkmaz; seçim hatırlanır.']},
  {v: '2.13', d: 'Konuşma ve olay odaklı akustik iyileştirme, kamera sarma ve video kurtarma', items: [
    'Akustik gürültü azaltma: OM-LSA + MCRA — gürültü kayıt boyunca izlenir (değişen gürültüde de aynı bastırma), her zaman-frekans hücresi için konuşma olasılığı; sessiz bölüm varsa alt sınır olarak kullanılır. Wiener (sabit profil) seçenek olarak kalır.',
    'Olay koruma (varsayılan açık): darbe, kopma (ör. cıvata), çarpma gibi geniş bantlı ani olaylarda kazanç anlık açılır ve gürültü tahmini dondurulur; tık temizleme sönümü olan olaylara dokunmaz.',
    'Çıtırtı bastırma: sık, kısa geniş bant patlamalar (iletim / elektronik çıtırtısı) yalnız arka planda ve 300 Hz üstünde arka plan seviyesine indirilir; perdeli konuşma, uzun ya da güçlü olaylar korunur. Otomatik temizleme saniyede ≥ 5 patlamada açar.',
    'Konuşma ve olaylar kartı: konuşma bulucu (bant SNR, spektral düzlük, hece dalgalanması) ve darbe olay bulucu; bölümler grafikte yeşil / kırmızı işaretlenir, listeden gidilir, oynatma çubuğunda ⇤ ⇥ ile atlanır.',
    'Ön ayarlar (Temiz dinleme / Konuşma odaklı), konuşma bandı (100–5000 Hz), ünsüz vurgusu (3 kHz), dinlemeye özel seviye dengeleme, perdeyi koruyarak yavaşlatma (WSOLA) ve bölüm dışını kısma.',
    'Kamera penceresi: kayıttan oynatmada geri / ileri sarma (1–30 s), oynat / duraklat ve konum çubuğu.',
    'Video: kayıp paketli (bozuk) kareler çözücüye verilmez; kayıptan sonra bir sonraki IDR ya da I kareden devam edilir (yoksa ~3 s sonra kareler yine verilir), çözücü hata verirse ya da takılırsa kendiliğinden yeniden kurulur. MP4 kaydı bozuk karede kesilmez: bozuk kare ve sonraki bozuk görüntü atlanır, kayıt sonuna kadar sürer, süre korunur.']},
  {v: '2.12', d: 'Kaba kuantalı akustik kanallar', items: [
    'Akustik otomatik temizleme: az sayıda ayrık seviyeden oluşan (ADC çözünürlüğü sınırındaki) kanallar tanınır ve uyarılır; kuantalama adımı "Kuantalama adımı" alanına yazılır, gürültü tabanı en az adım²/12 alınır (dijital sessiz bölümden sıfır gürültü profili çıkmaz), 1 adımlık geçişler tık ya da kırpılma sayılmaz, yavaş kayma yüksek geçirenle alınır.',
    'Silinen / NaN örnekler ortalama yerine komşular arasında doğrusal doldurulur (eğilimli kayıtlarda basamak ve tık oluşmaz).',
    'Akustik oynatma çubuğu: süre etiketi ve düğmeler sabit genişlikte; süre akarken çubuk titremez.']},
  {v: '2.11', d: 'Akustik temizlemede tonal parazit ve dip gürültü, grafikte oynatma çubuğu', items: [
    'Akustik otomatik temizleme: yalnız 50/60 Hz değil, arka planda sürekli duran herhangi bir tonal parazit (ör. 22 Hz ve harmonikleri) ince çözünürlüklü spektrumla bulunur ve harmonikleriyle birlikte notch ile çıkarılır; şebeke harmoniklerinin yanlış eşleşmesi giderildi.',
    'Akustik: sessiz bölüm kısa olaylı kayıtlarda da doğru ölçülür (dinamik fark en yüksek pencerelere göre), gürültü profili tek pencere yerine en uzun sessiz bölümden alınır, azaltma 25 dB\'e kadar; spektral azaltma karar yönlendirmeli Wiener kazancıyla çalışır — arka planda kalan dip gürültü ve müzikal kalıntı belirgin biçimde azalır.',
    'Akustik: oynatma sırasında çalan kanalın alt grafiğinin hemen altında geri/ileri sarma, duraklatma, konum çubuğu ve durdur düğmeli şerit.',
    'Telemetri: Çözülen Veriler başlığındaki seçenekler panelin sağ kenarına sabitlendi (sığmazsa alt satıra geçer, taşmaz); tablo panelden darsa işlem düğmeleri yine sağ kenarda kalır.']},
  {v: '2.10', d: 'Akustik oynatmada sarma ve kalibre WAV', items: [
    'Akustik: oynatma sırasında ⏪/⏩ ile seçilebilir adımla (1/5/10/30 s) geri/ileri sarma, ❚❚/▶ duraklat-devam, konum çubuğu ve "geçen / toplam s" göstergesi; Shift+← / Shift+→ / Shift+Boşluk kısayolları. Duraklatılmışken sarınca konum değişir, ses kapalı kalır.',
    'Akustik: "WAV kaydet (kalibre, 32-bit float)" — örnekler ölçeklenmeden (ör. Pa) yazılır; dosya yeniden açıldığında mutlak seviye ve dB SPL korunur.']},
  {v: '2.9', d: 'Telemetri tek panel, canlı grafik Zaman sekmesinde, ızgara düzeni', items: [
    'Telemetri: dosya çözümleme ve canlı oynatma tek panelde; üst çubukta oynatma + Çöz ve MATView\'de aç / Çöz ve dosyalara yaz. Oynatma paneli Oynat ile katlanır, canlı durum aç/kapa kutusu, işlem kaydı ayrı pencerede.',
    'Telemetri: "Çözülen Veriler" tablosu — kompakt başlık, sağda sabit işlem düğmeleri, kalıcı sütun görünümü; grafik düğmesi MATView Zaman sekmesinde canlı kanal açar; kamera açılır penceresi (ekran alıntısı, MP4).',
    'Grafik: Düzen ▾ (1–4 sütun ızgara, tüm alt grafiklere genişlik/yükseklik, eşzamanlı köşe boyutlandırma), Lejant ▾ (göster, katla, boyut, konum), 5+ alt grafikte kaydırma.']},
  {v: '2.8', d: 'Yerel Windows penceresi, çift Y, çoklu imleç, sanal ağaç, yeni süzgeçler, kod düzenleyici, oturum v2', items: [
    'Windows: MATView.exe kendi uygulama penceresinde (WebView2, kurulumsuz) ve ilk açılışta ekranı kaplayarak açılır; F11 tam ekran.',
    'Performans: SRS, spektrogram, FRF, filtfilt, Hampel ve spektral gürültü azaltma arka plan işçisinde; DSP / MATLAB kaynakları tek kez gömülü; olay güdümlü arayüz yenileme.',
    'Grafik: çift Y ekseni (farklı birimler), çoklu imleç + tepe/çukur yakalama + ölçüm paneli (Δ, eğim, alan, RMS, harmonik oranı), senkron dikey izleme (X), görünüm geçmişi (Alt+← / Alt+→); spektrogram imleci, kesit grafikleri, log frekans, inferno/magma/jet.',
    'Arayüz: sanal kaydırmalı kanal ağacı (10 000+ kanal), düzenli ifade / birim / fs / ★ arama, yeniden boyutlanan ve gizlenebilen paneller (Ctrl+B, Ctrl+Shift+B).',
    'DSP: Chebyshev I, Bessel, FIR (pencereli sinc) + canlı Bode; rainflow çevrim sayımı ve hasar özeti; kayan basıklık / tepe faktörü; tam Δf (keyfi pencere uzunluğu).',
    'Kod: Bul/Değiştir (Ctrl+F/H), Satıra git (Ctrl+G), ayraç eşleme, otomatik tamamlama (işlev, değişken, kanal adı); varsayılan parametreler, spline/pchip, trapz matris, polyfit [p,S,mu].',
    'Oturum v2: türetilmiş kanallar (formülüyle), test fazları, profiller, roller, rapor öğeleri. Rapor: sürükle-bırak, açıklamalar, yan yana şekiller. MAT v7.3 hücre/yapı/char/seyrek, MAT v5 seyrek, MDF 3.x; XLSX/DOCX deflate sıkıştırmalı.']},
  {v: '2.7', d: 'Telemetri: çerçeve tipleri, canlı oynatma, kamera, tek .mat', items: [
    'Yeni: Telemetri görünümü — Telemetri Çözümleyici (telemetryParser v4.6) MATView içinde. Çerçeve tipleri ve template\'ler (belirteç index\'i ile seçim), sütun öncelikli düzen, header, sayaç, dikkate alınmayacak sütunlar, undersample paketler, multiplex formüller, tekrar index\'leri; ayar JSON\'u içe/dışa aktarma. Seri port / UDP canlı telemetri yoktur.',
    'Yeni: “Çöz ve MATView\'de aç” — tüm parametreler kanal olur; zaman ekseni sayaçtan (kayıp çerçeveler boşluk), oversample ve koşullu / undersample örnekler doğru zamanda. Veri kanal seçildikçe okunur.',
    'Yeni: tüm binary tek .mat dosyası (etiket başına MATLAB yapısı, t / frame_counter / ad_t alanları).',
    'Yeni: dosyadan canlı oynatma (tablo, template çalışma kopyası, grafikler, çerçeveye git, kayıt) ve kamera videosu (RTP / H.264 → MP4 oynatıcı; canlı oynatmada anlık kamera penceresi).',
    'Yeni: Windows simgesi (exe ve uygulama penceresi).']},
  {v: '2.6', d: 'MATLAB arayüzleri (GUIDE) çalışır, komut penceresi', items: [
    'Yeni: GUIDE arayüzleri açılır ve kullanılır — .m ile aynı adlı .fig birlikte açılıp .m sekmesinde F5 (ya da .fig önizlemesindeki “Arayüzü çalıştır”) ile arayüz “Arayüz” görünümünde açılır. Düğme, açılır menü, liste, metin kutusu, onay kutusu, kaydırıcı, panel, tablo ve eksenler çalışır; Tag_Callback işlevleri, guidata, get/set, handles.x.String gibi nokta erişimi, findobj, gcbo desteklenir. “Geniş görünüm” yan panelleri gizler.',
    'Yeni: uigetfile, uiputfile, questdlg, inputdlg, listdlg, msgbox/errordlg/warndlg, waitbar; fopen/fread/fwrite/fseek/ftell/feof/fgetl/fclose, fullfile, fileparts, dir, exist; eval, evalin, assignin; containers.Map; typecast. MATView.exe ile açıldığında dosya seçme ve soru pencereleri kod içinden açılır; matview.html doğrudan tarayıcıda açılırsa dosyalar arayüz çubuğundaki “Dosya ekle” ile önceden eklenir.',
    'Yeni: işlev dosyaları F5 ile argümansız çağrılır (MATLAB gibi); [varargout{1:nargout}] = ... çoklu atama.',
    'Düzeltme: komut penceresinin herhangi bir yerine tıklayınca imleç komut satırına gelir; komut satırı çıktının hemen altında durur.']},
  {v: '2.5', d: 'Kod sekmesi: gerçek MATLAB ortamı gibi editör', items: [
    'Düzeltme: veri dosyası açık değilken Kod sekmesine geçildiğinde karşılama ekranı editörü örtüyordu.',
    'Yeni: çok sekmeli editör — sözdizimi renklendirme, satır numarası, %% bölümleri, otomatik girinti, Ctrl+R/Ctrl+T yorum, Ctrl+S kaydet; sekmeler tarayıcıda saklanır. F5 betik, Ctrl+Enter bölüm, F9 seçim çalıştırır. Alt kısımda komut penceresi (>>, ↑/↓ geçmiş) ve çalışma alanı.',
    'Yeni: birden çok .m dosyası birlikte açılır (Aç ▸ MATLAB kodu, sürükle-bırak). Açık işlev dosyaları (funcint16.m gibi) ve betikler otomatik kullanılır; hata başka dosyadaysa o sekme açılıp satır işaretlenir. Türkçe Windows (1254) kodlamalı .m dosyaları doğru okunur.',
    'Yeni: .mat yükle — değişkenler (uint8 dahil tüm sayısal sınıflar, 3 ve daha fazla boyut, karakter, hücre, yapı) çalışma alanına alınır; load(\'dosya.mat\') de çalışır. save(\'ad.mat\', ...) MATLAB\'ın açabileceği .mat dosyası indirir; whos çıktısı yapı dizisi olarak kullanılabilir.',
    'Yeni: N boyutlu diziler — reshape(x,[a 1 b]), squeeze, permute, x(i,:,:) okuma/yazma, size/length/ndims/numel.',
    'Yeni: .fig (GUIDE arayüzü) önizlemesi — düğme/menü/eksen yerleşimi ve her düğmenin geri çağırma işlevi adı gösterilir; arayüzün kendisi çalıştırılamaz.']},
  {v: '2.4', d: 'Kod sekmesi (MATLAB alt kümesi), figür/subplot, hızlı yakınlaştırma', items: [
    'Yeni: Kod görünümü — MATLAB alt kümesini çalıştırır (matris/karmaşık sayı, hücre, yapı, işlev tutamacı, if/for/while/switch/try, yerel işlevler). MATLAB kurulumu gerekmez; kod arka plan işçisinde çalışır, Durdur düğmesi vardır. Betikler .m olarak açılıp kaydedilir (sürükle-bırak da olur), tarayıcıda kitaplığa kaydedilir, örnek betikler hazırdır.',
    'Yeni: kanal köprüsü — ch(ad) kanalı sütun vektörü olarak alır, chfs(ad) örnekleme frekansı, cht(ad) zaman, chlist kanal listesi; addch(ad, y, fs) sonucu Türetilmiş kanallar altına ekler. load(\'dosya.mat\') açık .mat dosyalarından değişken okur.',
    'Yeni: DSP — fft/ifft, filter, filtfilt, butter (alçak/yüksek/bant), pwelch, interp1, polyfit/polyval, detrend, xcorr, conv, hampel, medfilt1, mov* işlevleri, findpeaks, hilbert, trapz, cumtrapz ve ~300 temel işlev. butter/filter/fft/pwelch/polyfit sonuçları scipy/numpy ile 1e-9 düzeyinde karşılaştırılarak doğrulandı (filtfilt MATLAB gibi 3*(n-1) kenar uzatması kullanır).',
    'Yeni: Figür görünümü — figure, subplot, plot, hold, xlabel/ylabel/title, legend, grid, xlim/ylim, semilogx/semilogy/loglog, bar, hist, stem, scatter. Her alt grafik yakınlaştırılıp gezilebilir; PNG kaydedilir.',
    'Hız: büyük veride yakınlaştırma/kaydırma sırasındaki takılmalar giderildi — iki düzeyli min/max piramidi, istatistik ve Grms hesaplarının parça parça (eşzamansız) yapılması, daha hızlı Hampel.',
    'Desteklenmeyenler (açık hata verir): toolbox işlevleri (spectrogram, designfilt, wavelet…), sınıflar/containers.Map, Simulink, arayüz işlevleri.']},
  {v: '2.3', d: 'Hampel, grafik değiştir, txt', items: [
    'Düzeltme: Hampel ile bulunan noktalar silinince çizgi kesik görünüyordu; silinen kısa boşluklar (20 örneğe kadar) artık çizgiyle köprülenir, NaN ve uzun silinmiş aralıklar çizgiyi keser. Hampel penceresi silinmiş/NaN örnekleri medyana katmaz.',
    'Yeni: kanal satırında ve sağ tık menüsünde Mevcut grafiği kaldırıp bunu çiz düğmesi (grup satırında tüm kanallar tek grafikte).',
    'Telemetre kanalları artık türüne göre tanınır: önek olsa da as (akustik), ts (titreşim), ss/hs (sıcaklık), bs/pbs (basınç), gs (gerinim) kısaltmaları.',
    'Metin (.txt) içe aktarma: boşluk, sekme, noktalı virgül ayraçları, # % // açıklama satırları, veri bloğundan önceki giriş satırları, ondalık virgül, UTF-16.',
  ]},
  {v: '2.2', d: 'Telemetre çerçeve düzeni', items: [
    'Düzeltme: akış alt sistemlerinin başlıkları bulunamıyordu — kayıt sütun öncelikli dizilmiş ve çerçeve başı satır sayacına denk geliyordu. Çerçeve düzeni bölümü eklendi: sütun x satır, sütun öncelikli (transpoze), kayma veya header (sync) ile çerçeve yakalama, sıkı sync, kayıttan sütun atma.',
    'Düzeni otomatik bul: Excel deki akış başlıklarından transpoze ve kaymayı oylama ile bulur, hangi akışta kaç paket çıktığını gösterir.',
    'Index artık varsayılan olarak 0 tabanlı (referans çözücü gibi); 1 tabanlı seçenek duruyor.',
  ]},
  {v: '2.1', d: 'Telemetre çerçevesi', items: [
    'Yeni: alt sistem başına bir sayfalı Excel çerçeve tanımı (Birim, Index, Değişken, Tip, Eleman/Örnek Sayısı, Formül, Endian, Undersample Header). Çerçeve kalıcı işaretlenebilir; 12.500 baytlık karelerden oluşan binary çözülür ve ana ağaçta alt sistem → değişken olarak listelenir.',
    'Referans çözücüyle uyumlu anlamlar: B2 blok örnekleme, bit akışı tipleri (uint12…), byte.bit index, tekrar indeksi ayrı değişken, kareler boyunca birleşen stream paketleri; Index tabanı ve B düzeni ayarlanabilir.',
    'Tanımlı olmayan baytlar, çakışmalar, okunamayan satırlar ve bulunamayan akış başlıkları rapor olarak gösterilir.',
  ]},
  {v: '2.0', d: 'Kapsamlı güncelleme', items: [
    'Güvenilirlik: Welch (periyodik pencere, scipy/MATLAB ile 1e-15 uyumlu), etkin ortalama sayısı, serbestlik derecesi ve güven aralığı; Kalite sekmesi (kırpılma, sıçrama, kopma, sabit kanal, DC kayması).',
    'Test mühendisliği: şartname uygunluk (MIL-STD-810 / ISO / özel tolerans şablonları), faz/seviye tespiti, kontrol kanalı rolleri, transmisibilite/FRF, akustik bant tablosu (OASPL), şok analizi (SRS, süre, ΔV, şekil), termal analiz.',
    'Araçlar: yeniden örnekleme / ortak ızgara, kanallar arası korelasyon ve gecikme, olay/anomali listesi, tonal bileşen, notlar.',
    'İzlenebilirlik: işlem günlüğü (rapor "Yöntem" metni, MAT çıktısına eklenir), silme geçmişi, ham veri görünümü.',
    'İş akışı: analiz şablonları, toplu (çoklu dosya) özet, arka plan işçisi, hata günlüğü ve kılavuz.',
    'Yeni biçimler: TDMS (DAQmx ham veri + NI ölçekleme dahil), MAT struct/cell (v5 ve v7.3 iç içe), ikili UNV 58b, MDF4 (.mf4/.mdf). Gerçek dosyayla sınanmadı — sorun olursa Sorun bildir sekmesinden tanı paketi kaydedin.']},
  {v: '1.x', d: 'Önceki sürümler', items: ['MAT / HDF5 / UNV (58) / ikili telemetri (Excel çerçeve tanımı) / CSV-Excel / WAV okuma; zaman, spektrum, spektrogram, oktav, SRS, filtre, Hampel, temizleme; profil karşılaştırma; rapor ve PNG/SVG çıktısı.']}];

/* ---------- D4: kılavuz / sürüm / sorun bildir ---------- */
function diagBundle(withNames) {
  const files = allFiles().map(f => ({ext: (f.name.match(/\.[^.]+$/) || [''])[0].toLowerCase(), name: withNames ? f.name : undefined, channels: f.channels.length, maxN: Math.max(0, ...f.channels.map(c => c.n || 0))}));
  return {app: 'MATView', ver: APP_VER, time: new Date().toISOString(), ua: navigator.userAgent, worker: DSPW.active ? 'etkin' : (DSPW.dead ? 'yok (ana iş parçacığı)' : 'başlamadı'), files, errors: S.errLog, methodLog: (S.methodLog || []).slice(-100), note: 'Bu pakette ölçüm verisi yoktur.'};
}
function helpDialog(start) {
  const pages = {};
  const sec = (t, ...c) => [h('h4', {style: 'margin:12px 0 4px'}, t), ...c];
  pages['Genel'] = helpBody();
  pages['İş akışı'] = h('div', {style: 'line-height:1.65'}, ...sec('1 · Aç ve doğrula', h('div', null, 'Dosyaları açın (sürükle-bırak). Kalite sekmesi kırpılma, sıçrama, kopma ve sabit kanalları otomatik tarar; bulguları inceleyin, gerekirse Temizle sekmesiyle düzeltin (silme geçmişi tutulur).')),
    ...sec('2 · Seviye ve fazlar', h('div', null, 'UNV/Profil sekmesinde şartname profilini girin; Test sekmesinde “Seviye algıla” ile fazlar çıkar. Uygunluk kartı her faz için ASD, Grms, tolerans dışı bant payı ve serbestlik derecesini hesaplar.')),
    ...sec('3 · Kontrol ve cevap', h('div', null, 'Kanal adları testten teste değişir: soldan seçip “Seçili → Kontrol / Cevap” ile rol atayın. Kontrol ortalaması/zarfı, transmisibilite ve koherans rollere göre hesaplanır.')),
    ...sec('4 · Şablon ve toplu çalışma', h('div', null, 'Ayarlarınızı Araçlar ▸ Analiz şablonları ile kaydedin (profil, tolerans, parametreler, rol kalıpları). Toplu özet kartı aynı analizi tüm açık dosyalara uygular ve tek tabloda toplar.')),
    ...sec('5 · Raporla', h('div', null, 'Sonuçlar “Rapora ekle” ile rapora girer; Çıktı sekmesindeki Yöntem metni uygulanan işlemleri (parametreleriyle) otomatik yazar.')));
  pages['Kısayollar'] = h('table', {class: 'kv'}, ...[['Delete', 'Seçili noktaları sil'], ['Ctrl+Z / Ctrl+Y', 'Geri al / yinele'], ['P · Z · C · B · L', 'Gez · Yakınlaştır · İmleç · Kutu · Kement'], ['+ / −', 'Yakınlaş / uzaklaş'], ['Home', 'Tümünü sığdır'], ['Esc', 'Seçimi kaldır / menüyü kapat'], ['Ctrl+S', 'Oturumu kaydet'], ['Ctrl+O', 'Dosya aç'], ['Ctrl+E', 'Görünümü PNG kaydet'], ['Ctrl+Shift+R', 'Görünümü rapora ekle'], ['N', 'İmleç konumuna not ekle'], ['F1  ·  ?', 'Bu pencere']].map(r => h('tr', null, h('td', null, h('kbd', null, r[0])), h('td', null, r[1]))));
  pages['Sürüm'] = h('div', {style: 'line-height:1.6'}, h('div', null, h('b', null, 'MATView ' + APP_VER), ' — çevrimdışı, kurulum gerektirmeyen test verisi görüntüleyici/işleyici.'), h('div', {class: 'note'}, 'Arka plan işçisi: ' + (DSPW.active ? 'etkin' : (DSPW.dead ? 'kullanılamıyor (ana iş parçacığı)' : 'ilk hesaplamada başlar'))),
    ...CHANGELOG.flatMap(c => [h('h4', {style: 'margin:10px 0 3px'}, `${c.v} — ${c.d}`), h('ul', {style: 'margin:0 0 0 18px'}, ...c.items.map(t => h('li', null, t)))]));
  const nm = h('input', {type: 'checkbox', id: 'dgNames'}), er = () => S.errLog.length ? S.errLog.slice().reverse().map(e => `[${new Date(e.t).toLocaleTimeString('tr-TR')}] ${e.kind}: ${e.msg}`).join('\n') : 'Kayıtlı hata yok.';
  pages['Sorun bildir'] = h('div', {style: 'line-height:1.6'}, h('div', {class: 'note'}, 'Tanı paketi sürüm, tarayıcı, işlem günlüğü ve hata kayıtlarını içerir; ölçüm verisi içermez. Dosya adlarını eklemek isteğe bağlıdır.'),
    h('label', {class: 'chk'}, nm, ' Dosya adlarını da ekle'), h('div', {class: 'btns'}, btn('Tanı paketini kaydet', async () => { await saveBlob(new Blob([JSON.stringify(diagBundle(nm.checked), null, 1)], {type: 'application/json'}), 'matview_tani.json'); }, 'primary'), btn('Hata kaydını temizle', () => { S.errLog.length = 0; logErr('bilgi', 'günlük temizlendi'); S.errLog.length = 0; try { sessionStorage.removeItem('mv.errlog'); } catch (_) {} pre.textContent = er(); })),
    h('h4', {style: 'margin:10px 0 3px'}, 'Hata kaydı'));
  const pre = h('pre', {style: 'max-height:28vh;overflow:auto;font-size:11px;white-space:pre-wrap;background:#f6f7f9;padding:6px;border:1px solid #d5d9de'}, er()); pages['Sorun bildir'].append(pre);
  const wrap = h('div'), tabs = h('div', {class: 'btns', style: 'margin:0 0 8px'}), body = h('div', {style: 'max-height:62vh;overflow:auto'});
  const show = k => { body.replaceChildren(pages[k]); for (const b of tabs.children) b.classList.toggle('primary', b.textContent === k); };
  for (const k of Object.keys(pages)) tabs.append(btn(k, () => show(k))); wrap.append(tabs, body); show(start && pages[start] ? start : 'Genel'); modal('Yardım ve hakkında', wrap, [{t: 'Kapat', primary: true}]);
}

/* ---------- C3: analiz şablonları ---------- */
const TPLKEY = 'mv.tpl', TPL_SKIP = /^(tpl|batTpl|fileIn|binIn)/;
const tplLoad = () => { try { return JSON.parse(localStorage.getItem(TPLKEY) || '[]'); } catch (_) { return []; } };
const tplStore = l => { try { localStorage.setItem(TPLKEY, JSON.stringify(l)); } catch (_) { toast('Şablonlar kaydedilemedi (depolama kapalı)'); } };
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function tplSnapshot(name) {
  const ui = {}, profNames = new Set();
  document.querySelectorAll('#rbody input[id], #rbody select[id], #rbody textarea[id]').forEach(e => {
    if (e.type === 'file' || e.type === 'button' || TPL_SKIP.test(e.id)) return;
    if (e.type === 'checkbox') ui[e.id] = {c: e.checked};
    else if (e.tagName === 'SELECT') { const p = S.profiles.find(x => x.id === e.value); if (p) { ui[e.id] = {prof: p.name}; profNames.add(p.name); } else ui[e.id] = {v: e.value}; }
    else ui[e.id] = {v: e.value};
  });
  const pat = k => { const el = $('#tplRole' + k); return el ? el.value.trim() : ''; };
  return {name, created: Date.now(), ver: APP_VER, ui, roles: {ctl: pat('Ctl'), resp: pat('Resp')}, profiles: S.profiles.filter(p => profNames.has(p.name)).map(p => ({name: p.name, pts: p.pts, tol: p.tol, color: p.color}))};
}
function tplApply(t) {
  let added = 0; const byName = n => S.profiles.find(p => p.name === n);
  for (const p of t.profiles || []) if (!byName(p.name)) { S.profiles.push({id: 'p' + Date.now() + (added++), name: p.name, pts: p.pts, tol: p.tol, color: p.color}); }
  if (added) { saveProfiles(); refreshUnvPanel(); if (typeof cpFillProf === 'function') cpFillProf(); }
  let miss = 0; const entries = Object.entries(t.ui || {}), sels = entries.filter(([id]) => { const e = document.getElementById(id); return e && e.tagName === 'SELECT'; }), rest = entries.filter(([id]) => !sels.some(s => s[0] === id));
  const setOne = ([id, o]) => { const e = document.getElementById(id); if (!e) { miss++; return; } if (o.prof) { const p = byName(o.prof); if (!p) { miss++; return; } if (![...e.options].some(x => x.value === p.id)) { fillProfSelects(); } e.value = p.id; }
    else if ('c' in o) e.checked = o.c; else { if (e.tagName === 'SELECT' && ![...e.options].some(x => x.value === o.v)) { miss++; return; } e.value = o.v; }
    e.dispatchEvent(new Event('input', {bubbles: true})); e.dispatchEvent(new Event('change', {bubbles: true})); };
  fillProfSelects(); sels.forEach(setOne); rest.forEach(setOne);   // önce seçimler (tolerans şablonu alanları ezer), sonra sayılar
  const all = []; for (const f of allFiles()) for (const c of f.channels) all.push(c);
  for (const [k, pat] of Object.entries(t.roles || {})) { if (!pat) continue; let re; try { re = new RegExp(pat, 'i'); } catch (_) { toast('Rol kalıbı geçersiz: ' + pat); continue; } S.roles[k] = all.filter(c => re.test(c.name)).map(c => c.uid); }
  if (typeof roleRender === 'function') roleRender(); logOp('template', {name: t.name}); return {miss, roles: {ctl: S.roles.ctl.length, resp: S.roles.resp.length}};
}
function fillProfSelects() { if (typeof cpFillProf === 'function') cpFillProf(); for (const id of ['ctProf', 'batProf', 'lvRef']) { const s = document.getElementById(id); if (!s) continue; const v = s.value; if (id === 'lvRef') { fillLvRef(s); continue; } s.replaceChildren(h('option', {value: ''}, '(yok)'), ...S.profiles.map(p => h('option', {value: p.id}, p.name))); if ([...s.options].some(o => o.value === v)) s.value = v; } }
function tplRender() {
  const box = $('#tplBox'); if (!box) return; const list = tplLoad(); box.replaceChildren();
  if (!list.length) box.append(h('div', {class: 'note'}, 'Kayıtlı şablon yok.'));
  list.forEach((t, i) => box.append(h('div', {class: 'btns', style: 'align-items:center'}, h('b', {style: 'flex:1'}, t.name), h('span', {class: 'note'}, new Date(t.created).toLocaleDateString('tr-TR')),
    btn('Uygula', () => { const r = tplApply(t); toast(`Şablon uygulandı: ${t.name}` + (r.miss ? ` (${r.miss} alan bulunamadı)` : '') + ((t.roles && (t.roles.ctl || t.roles.resp)) ? ` · rol: kontrol ${r.roles.ctl}, cevap ${r.roles.resp}` : ''), 6000); }),
    btn('Dışa aktar', () => saveBlob(new Blob([JSON.stringify(t, null, 1)], {type: 'application/json'}), 'sablon_' + t.name.replace(/[^\w\-]+/g, '_') + '.json')),
    btn('Sil', () => { const l = tplLoad(); l.splice(i, 1); tplStore(l); tplRender(); }))));
}
function tplSave() {
  const name = ($('#tplName').value || '').trim(); if (!name) return toast('Şablon adı girin');
  const l = tplLoad(), t = tplSnapshot(name), k = l.findIndex(x => x.name === name); if (k >= 0) l[k] = t; else l.push(t); tplStore(l); tplRender(); toast('Şablon kaydedildi: ' + name);
}
function tplFillRoles() { const nm = k => [...new Set(roleChs(k).map(c => c.name))].map(reEsc).join('|'); $('#tplRoleCtl').value = nm('ctl'); $('#tplRoleResp').value = nm('resp'); }
async function tplImport(file) { try { const t = JSON.parse(await file.text()); if (!t || !t.ui || !t.name) throw new Error('şablon dosyası değil'); const l = tplLoad(), k = l.findIndex(x => x.name === t.name); if (k >= 0) l[k] = t; else l.push(t); tplStore(l); tplRender(); toast('Şablon içe aktarıldı: ' + t.name); } catch (e) { toast('Şablon okunamadı: ' + e.message); } }
function tplCard() {
  const imp = h('input', {type: 'file', accept: '.json', style: 'display:none', id: 'tplFile', onchange: e => { if (e.target.files[0]) tplImport(e.target.files[0]); e.target.value = ''; }});
  return card('Analiz şablonları', h('div', {class: 'note'}, 'Şablon; tüm sekmelerdeki mevcut ayarları (profil, tolerans, parametreler) ve kanal rol kalıplarını saklar. Başka dosyada tek tıkla uygulanır; .json olarak başka bilgisayara taşınır.'),
    fr('Şablon adı', h('input', {type: 'text', id: 'tplName', placeholder: 'örn. Rastgele titreşim — Faz 2'})),
    fr('Kontrol kanalı kalıbı (regex)', h('input', {type: 'text', id: 'tplRoleCtl', placeholder: 'örn. ctrl|kontrol|^CH1$'})), fr('Cevap kanalı kalıbı (regex)', h('input', {type: 'text', id: 'tplRoleResp', placeholder: 'örn. resp|cevap'})),
    h('div', {class: 'btns'}, btn('Kalıpları mevcut rollerden doldur', tplFillRoles), btn('Şablon olarak kaydet', tplSave, 'primary'), btn('İçe aktar…', () => imp.click()), imp), h('div', {id: 'tplBox'}));
}

/* ---------- C4: toplu (çoklu dosya) özet ---------- */
let _bat = null;
async function batchRun() {
  let re; try { re = new RegExp(sv('batPat') || '.', 'i'); } catch (e) { return toast('Kanal kalıbı geçersiz: ' + e.message); }
  const prof = S.profiles.find(p => p.id === sv('batProf')), t = prof ? tolFromUI() : null, onlyVib = ck('batVib'), lvl = num('batLvl') || 0, dfReq = num('batDf') || 2.5, files = allFiles();
  const todo = []; for (const f of files) for (const c of f.channels) if (re.test(c.name) && (!onlyVib || c.kind === 'vib') && c.n >= 512) todo.push([f, c]);
  if (!todo.length) return toast('Kalıba uyan kanal bulunamadı');
  await busy('Toplu özet hesaplanıyor…', async prog => {
    const rows = [], P = specAxesReset(), sa = P.addAxes({xlog: true, ylog: true, title: 'Toplu özet — PSD karşılaştırması'}); sa.xlabel = 'Frekans (Hz)'; sa.ylabel = 'PSD'; sa.xlim = [1, 1000]; sa.ylim = [1e-6, 1];
    let k = 0, tgDone = false; const fcol = new Map();
    for (const [f, c] of todo) {
      await ensureLoaded(c); const seg = DSP.segment(c.data, c.del, 0, c.n); if (seg.length < 512) { prog(++k / todo.length); continue; }
      const nfft = Math.min(DSP.nextPow2(Math.ceil(c.fs / dfReq)), DSP.nextPow2(seg.length)), r = await DSPW.run('welch', [seg, c.fs, {nfft, win: 'hann', overlap: 0.5, scale: 'psd', maxSeg: 8000}]), st = DSP.stats(seg, null, 0, seg.length);
      const f1 = prof ? prof.pts[0][0] : (num('batF1') || 1), f2 = prof ? prof.pts[prof.pts.length - 1][0] : (num('batF2') || c.fs / 2.56); let sm = 0, sT = 0, nb = 0, outN = 0, maxDev = 0, fMax = 0; const fa = [], ya = [], ta = [];
      for (let i = 0; i < r.f.length; i++) { const fq = r.f[i]; if (fq < f1 || fq > f2 || !(r.y[i] > 0)) continue; sm += r.y[i] * r.df; nb++; fa.push(fq); ya.push(r.y[i]);
        if (prof) { const tg = profAt(prof.pts, fq) * Math.pow(10, lvl / 10); sT += tg * r.df; ta.push(tg); const dv = 10 * Math.log10(r.y[i] / tg), [lo, hi] = cpTolAt(t, fq); if (dv > hi || dv < -lo) outN++; if (Math.abs(dv) > Math.abs(maxDev)) { maxDev = dv; fMax = fq; } } }
      const row = {file: f.name, ch: c.name, unit: c.unit || '', dur: c.n / c.fs, fs: c.fs, rms: st.std, peak: Math.max(Math.abs(st.min), Math.abs(st.max)), gm: Math.sqrt(sm), dof: r.dof, df: r.df};
      if (prof) { row.gt = Math.sqrt(sT); row.gpct = 100 * (row.gm / row.gt - 1); row.outPct = nb ? 100 * outN / nb : 0; row.maxDev = maxDev; row.fMax = fMax; row.gOk = row.gpct <= t.gHi && row.gpct >= -t.gLo; row.sOk = row.outPct <= t.pctOut; row.ok = row.gOk && row.sOk; }
      rows.push(row); if (!fcol.has(f.name)) fcol.set(f.name, SUBPAL[fcol.size % SUBPAL.length]);
      sa.traces.push({kind: 'xy', x: Float64Array.from(fa), y: Float64Array.from(ya), label: `${f.name} · ${c.name}`, color: fcol.get(f.name), width: 1.1, visible: true, raw: Float64Array.from(ya), scale: 'psd', df: r.df, srcKind: c.kind});
      if (prof && !tgDone) { tgDone = true; sa.traces.push({kind: 'xy', x: Float64Array.from(fa), y: Float64Array.from(ta), label: 'Hedef ' + prof.name, color: '#222', width: 2, visible: true, profileId: prof.id}); }
      prog(++k / todo.length); await sleep(0);
    }
    if (!rows.length) { P.removeAxes(sa); return toast('Hesaplanacak veri yok'); }
    _bat = {rows, prof, t, lvl, when: Date.now()}; logOp('batch', {files: new Set(rows.map(r => r.file)).size, n: rows.length, prof: prof ? prof.name : '-', tol: t ? t.name : '-', df: dfReq}); P.fitAll(); switchView('spec'); batShow();
  });
}
function batHead() { return _bat.prof ? ['Dosya', 'Kanal', 'Süre (s)', 'RMS', 'Tepe', 'Grms (bant)', 'Grms (hedef)', 'Fark', 'Tol. dışı', 'En büyük sapma', 'SD', 'Karar'] : ['Dosya', 'Kanal', 'Süre (s)', 'RMS', 'Tepe', 'Grms (bant)', 'SD']; }
function batCells(r) { const f = (v, d = 4) => Number.isFinite(v) ? fmtNum(v, d) : '-'; const b = [r.file, r.ch + (r.unit ? ' [' + r.unit + ']' : ''), f(r.dur, 5), f(r.rms), f(r.peak), f(r.gm)]; return _bat.prof ? [...b, f(r.gt), (r.gpct > 0 ? '+' : '') + r.gpct.toFixed(1) + ' %', r.outPct.toFixed(1) + ' %', (r.maxDev > 0 ? '+' : '') + r.maxDev.toFixed(1) + ' dB @ ' + fmtNum(r.fMax, 5) + ' Hz', r.dof.toFixed(0), r.ok ? 'GEÇTİ' : 'KALDI'] : [...b, r.dof.toFixed(0)]; }
function batShow() {
  const box = $('#batBox'); if (!box || !_bat) return; const B = _bat, ok = B.rows.filter(r => r.ok).length;
  box.replaceChildren(h('div', {class: 'note'}, `${new Set(B.rows.map(r => r.file)).size} dosya, ${B.rows.length} kanal` + (B.prof ? ` · ${B.t.name} · ${B.prof.name}: ${ok}/${B.rows.length} geçti` : '')), h('div', {style: 'max-height:36vh;overflow:auto'}, tblEl(batHead(), B.rows.map(r => ({cls: B.prof && !r.ok ? 'q2' : '', cells: batCells(r)})))));
}
function batToReport() { if (!_bat) return toast('Önce toplu özeti hesaplayın'); const B = _bat; REP.items.push({type: 'table', title: 'Toplu özet' + (B.prof ? ' — ' + B.prof.name : ''), head: batHead(), rows: B.rows.map(batCells), note: B.prof ? `Tolerans kümesi: ${B.t.name}. Hedef seviye ${B.lvl >= 0 ? '+' : ''}${B.lvl} dB. Her kanalın tüm süresi tek parça Welch (Hann, %50 örtüşme) ile değerlendirildi; fazlı değerlendirme için Test sekmesini kullanın.` : 'Grms yalnız belirtilen bantta PSD integralidir; RMS ham sinyalin standart sapmasıdır.'}); repRefreshList(); toast('Rapora eklendi'); }
async function batCsv() { if (!_bat) return toast('Önce toplu özeti hesaplayın'); const q = v => '"' + String(v).replace(/"/g, '""') + '"'; const csv = '﻿' + [batHead(), ..._bat.rows.map(batCells)].map(r => r.map(q).join(';')).join('\r\n'); await saveBlob(new Blob([csv], {type: 'text/csv'}), 'toplu_ozet.csv'); }
function batCard() {
  const tplSel = h('select', {id: 'batTpl'}), refill = () => { const v = tplSel.value; tplSel.replaceChildren(h('option', {value: ''}, '(şablon uygulama)'), ...tplLoad().map((t, i) => h('option', {value: String(i)}, t.name))); tplSel.value = v; };
  refill(); tplSel.onfocus = refill;
  return card('Toplu özet (çoklu dosya)', h('div', {class: 'note'}, 'Açık tüm dosyalarda kalıba uyan kanalları aynı yöntemle işler; Grms, tepe ve (profil seçilirse) şartname uygunluğunu tek tabloda toplar, PSD’leri üst üste çizer. Kanal adları dosyadan dosyaya değiştiği için kalıp düzenli ifadedir.'),
    fr('Şablon', tplSel), fr('Kanal kalıbı (regex)', h('input', {type: 'text', id: 'batPat', placeholder: 'örn. ctrl|kontrol|ch1'})), h('div', {class: 'btns'}, btn('Kalıbı kontrol rollerinden al', () => { const n = [...new Set(roleChs('ctl').map(c => c.name))].map(reEsc).join('|'); if (!n) return toast('Önce kontrol rolü atayın (Test sekmesi)'); $('#batPat').value = n; })),
    chkIn('batVib', 'Yalnız titreşim kanalları', true), fr('Profil', h('select', {id: 'batProf'}, h('option', {value: ''}, '(yok)'), ...S.profiles.map(p => h('option', {value: p.id}, p.name)))), fr('Seviye (dB)', numIn('batLvl', 0, {step: 'any'})),
    fr('Bant (Hz) — profil yoksa', h('span', null, numIn('batF1', 20, {min: 0}), ' – ', numIn('batF2', 2000, {min: 0}))), fr('Çözünürlük (Hz)', numIn('batDf', 2.5, {min: 0.01, step: 'any'})),
    h('div', {class: 'btns'}, btn('Hesapla', async () => { const i = sv('batTpl'); if (i !== '') { const t = tplLoad()[+i]; if (t) tplApply(t); } await batchRun(); }, 'primary'), btn('Rapora ekle', batToReport), btn('CSV kaydet', batCsv)),
    h('div', {class: 'note'}, 'Tolerans kümesi, Test sekmesindeki “Tolerans şablonu” alanlarından alınır.'), h('div', {id: 'batBox'}));
}
function extraToolCards() { return [tplCard(), batCard()]; }

window.addEventListener('keydown', e => {
  const t = e.target, inp = t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName), k = (e.key || '').toLowerCase(), mod = e.ctrlKey || e.metaKey;
  if (e.key === 'F1') { e.preventDefault(); helpDialog('Kısayollar'); }
  else if (mod && k === 's' && !e.shiftKey) { e.preventDefault(); saveSession(); }
  else if (mod && k === 'o') { e.preventDefault(); $('#btnOpen').click(); }
  else if (mod && k === 'e') { e.preventDefault(); savePng(); }
  else if (mod && e.shiftKey && k === 'r') { e.preventDefault(); repAddView(); }
  else if (!mod && !inp && k === 'n') { e.preventDefault(); noteAtView(); }
});
