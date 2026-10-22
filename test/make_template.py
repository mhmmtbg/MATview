"""MATView binary çerçeve şablonu (xlsx) + şablonla uyumlu sentetik deneme binary'si. Gerçek veri içermez.
Kullanım: python3 make_template.py [çıkış_klasörü] [kare_sayısı]"""
import random, struct, math, sys, os
from openpyxl import Workbook
from openpyxl.styles import PatternFill, Font, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

out = sys.argv[1] if len(sys.argv) > 1 else 'sablon'; NF = int(sys.argv[2]) if len(sys.argv) > 2 else 2000
os.makedirs(out, exist_ok=True)
R, C = 100, 125; L = R * C   # akış sütun sütun: 1. sütun = bayt 1-100, 2. sütun = 101-200 ...
# ÖRNEK alt sistemler (genel adlar); toplam 12500 bayt
SUBS = [('BASLIK', 100), ('DURUM', 150), ('GUC', 1200), ('ITKI', 900), ('NAVIG', 1500), ('HABER', 1700), ('ISIL', 1000), ('YAKIT', 600), ('KONTROL', 800), ('SENSOR', 2000), ('YUK', 1500), ('YEDEK', 1050)]
assert sum(s for _, s in SUBS) == L
cell = [n for n, s in SUBS for _ in range(s)]
start = {}; o = 0
for n, s in SUBS: start[n] = o; o += s
pal = ['FFE699', 'C6E0B4', 'BDD7EE', 'F8CBAD', 'D9D2E9', 'B4E5E0', 'FFF2CC', 'E2EFDA', 'DDEBF7', 'FCE4D6', 'EAD1DC', 'D0E0E3']
HDR = PatternFill('solid', fgColor='1F4E78'); HF = Font(bold=True, color='FFFFFF'); thin = Side(style='thin', color='BFBFBF'); BOX = Border(left=thin, right=thin, top=thin, bottom=thin)
WRAP = Alignment(wrap_text=True, vertical='top')

wb = Workbook()
# ---- 1. Nasıl kullanılır ----
ws = wb.active; ws.title = 'Nasıl Kullanılır'; ws.column_dimensions['A'].width = 26; ws.column_dimensions['B'].width = 110
rows = [
 ('MATView — Binary çerçeve tanım şablonu', ''),
 ('', ''),
 ('Amaç', 'Telemetre/kayıt binary dosyasındaki baytlara ad vermek, değer çevirmek (tür, bit, dönüşüm formülü) ve sonucu MATView içinde incelemek veya .mat olarak kaydetmek.'),
 ('', ''),
 ('ADIMLAR', ''),
 ('1', 'ÇERÇEVE sayfasında her hücre 1 baytı temsil eder (varsayılan 100 satır × 125 sütun = 12.500 bayt; akış sütun sütun: 1. sütun = bayt 1-100, 2. sütun = 101-200 …). Hücreye o baytın ait olduğu alt sistemin/alanın adını yazın. Aynı ad birden çok hücrede geçerse hücreler sırayla AD_1, AD_2, … olarak numaralanır (okuma sırasına göre).'),
 ('2', 'SENARYO sayfasında okuma sırasını (satır satır / sütun sütun), kare başındaki senkron kelimesini, kare hızını ve varsa sayaç alanını girin.'),
 ('3', 'ALANLAR sayfasında çözmek istediğiniz değerleri tanımlayın: ad, başlangıç hücresi (ör. GUC_1), tür, bayt sırası, istenirse bit aralığı ve dönüşüm formülü, birim. Her satır bir kanal olur.'),
 ('4', 'MATView → Aç ▸ Binary dosya… ile önce bu Excel’i, sonra .bin dosyasını seçin (ya da ikisini birlikte pencereye sürükleyin). Önizlemede kare sayısını ve kayıp kareleri kontrol edip “Çöz”e basın.'),
 ('5', 'Kanalları soldan grafiğe ekleyin; kaydetmek için dosya başlığındaki “.mat” düğmesini kullanın (yalnız çözülmüş alanlar önerilir; ham baytlar çok yer kaplar).'),
 ('', ''),
 ('ÇERÇEVE ipuçları', ''),
 ('Renkler', 'Hücre renkleri yalnızca okunabilirlik içindir, MATView renklere bakmaz.'),
 ('Boş hücre', 'Adı olmayan bayt çözülmez (ama çerçeve boyutuna sayılır). Çerçeve boyutu = satır × sütun.'),
 ('Ad kuralı', 'Harf, rakam ve _ kullanın; boşluk/özel karakter _ olur. Türkçe harf kullanılabilir.'),
 ('Boyut', 'Çerçeve başka boyutta ise satır/sütun sayısını değiştirebilirsiniz; senkron kelimesi çerçevenin ilk baytlarına denk gelmelidir.'),
 ('', ''),
 ('ALANLAR sütunları', ''),
 ('Ad', 'Kanal adı (formüllerde de bu adla anılır).'),
 ('Başlangıç', 'Alanın ilk baytının hücre adı (ör. GUC_1 ya da tek hücreli ad: DURUM). Ya da bayt ofseti: #12 (çerçeve başından, 0 tabanlı).'),
 ('Tür', 'u8 i8 u16 i16 u32 i32 f32 f64 (u=işaretsiz, i=işaretli, f=ondalık). Çok baytlı türler başlangıç hücresinden itibaren ardışık baytları okur.'),
 ('Bayt sırası', 'BE (büyük uçlu / ağ sırası, ilk bayt en anlamlı) ya da LE (küçük uçlu).'),
 ('Bit', 'Boş = tüm değer. “3” = yalnız 3. bit; “4-7” = 4’ten 7’ye bitler (0 = en düşük anlamlı bit). Bit bayrakları ve 12/14 bit alanlar (u16 + “0-11”) için.'),
 ('İfade', 'Dönüşüm formülü; ham değer x ile gösterilir. Örnek: x*0.01   x*0.1-40   (x-2048)/4096*5   sqrt(x)   Başka alanlar da adıyla kullanılabilir: GUC_VOLT*GUC_AKIM'),
 ('Birim', 'Yalnız görüntü ve çıktı etiketi içindir.'),
 ('Periyot (kare)', 'Alan her kaç karede bir güncelleniyorsa. Çerçeve en hızlı alt sisteme göre (ör. 5 ms → 200 Hz) tanımlanır; 10 ms’de bir gelen alanlara 2 yazılır (1 = her karede). Boş = 1. Alan kendi zaman ekseniyle (5 ms × periyot) görünür.'),
 ('Faz', 'Periyot > 1 ise alanın hangi karede güncellendiği: 0 = çift numaralı kareler, 1 = tek numaralı kareler… (kare numarası sayaçtan alınır). Boş = 0.'),
 ('', ''),
 ('SENARYO anahtarları', ''),
 ('Okuma sırası', 'sütun: 1. sütun yukarıdan aşağı (bayt 1-100), sonra 2. sütun… satır: hücreler soldan sağa, yukarıdan aşağı.'),
 ('Senkron (hex)', 'Her karenin başındaki sabit bayt dizisi (ör. EB 90 A5 C3). Veri kayarsa ya da kare eksikse bu kelimeye göre yeniden senkronlanır. Boş bırakılırsa kareler ardışık kabul edilir.'),
 ('Kare hızı (Hz)', 'Saniyedeki kare sayısı: zaman ekseni = kare numarası / kare hızı.'),
 ('Atlanacak bayt', 'Dosya başındaki, çerçeveye dahil olmayan (dosya başlığı) bayt sayısı.'),
 ('Sayaç alanı', 'Karelerde artan bir sayaç alanının adı (ALANLAR’daki bir ad). Doluysa kayıp kareler sayaç boşluklarından tespit edilir ve grafikte zaman boşluğu olarak görünür. Senkron kelimesi tek başına tam kayıp kareleri bulamaz.'),
 ('', ''),
 ('Not', 'Bu dosyadaki alt sistem adları ve alanlar ÖRNEKTİR (uydurma). Kendi çerçevenize göre silip değiştirin. ÇERÇEVE sayfasını temizlemek için tüm hücreleri seçip silin ve kendi adlarınızı yazın.'),
]
for i, (a, b) in enumerate(rows, 1):
    ws.cell(i, 1, a); ws.cell(i, 2, b); ws.cell(i, 2).alignment = WRAP; ws.cell(i, 1).alignment = Alignment(vertical='top')
    if a in ('ADIMLAR', 'ÇERÇEVE ipuçları', 'ALANLAR sütunları', 'SENARYO anahtarları') or i == 1:
        for c in (1, 2): ws.cell(i, c).fill = HDR; ws.cell(i, c).font = HF
    elif a: ws.cell(i, 1).font = Font(bold=True)
ws['A1'].font = Font(bold=True, color='FFFFFF', size=14)

# ---- 2. Çerçeve ----
fr = wb.create_sheet('Çerçeve'); fills = {n: PatternFill('solid', fgColor=pal[i % len(pal)]) for i, (n, _) in enumerate(SUBS)}
for r in range(R):
    for c in range(C):
        nm = cell[c * R + r]; x = fr.cell(r + 1, c + 1, nm); x.fill = fills[nm]; x.font = Font(size=8); x.alignment = Alignment(horizontal='center')
for c in range(C): fr.column_dimensions[get_column_letter(c + 1)].width = 9

# ---- 3. Senaryo ----
sc = wb.create_sheet('Senaryo'); sc.append(('Anahtar', 'Değer', 'Açıklama'))
for row in [('Okuma sırası', 'sütun', 'sütun: 1. sütun = bayt 1-100, 2. sütun = 101-200 … ; satır: soldan sağa'), ('Senkron (hex)', 'EB 90 A5 C3', 'Kare başı kelimesi; boş bırakılabilir'), ('Kare hızı (Hz)', 200, 'Çerçevenin tekrar hızı: 5 ms → 200'), ('Atlanacak bayt', 0, 'Dosya başlığı bayt sayısı'), ('Sayaç alanı', 'SAYAC', 'ALANLAR’daki sayaç alanının adı; yoksa boş')]: sc.append(row)
for c in 'ABC': sc[c + '1'].fill = HDR; sc[c + '1'].font = HF
sc.column_dimensions['A'].width = 20; sc.column_dimensions['B'].width = 18; sc.column_dimensions['C'].width = 44
dv = DataValidation(type='list', formula1='"sütun,satır"', allow_blank=False); sc.add_data_validation(dv); dv.add('B2')

# ---- 4. Alanlar ----
al = wb.create_sheet('Alanlar'); al.append(('Ad', 'Başlangıç', 'Tür', 'Bayt sırası', 'Bit', 'İfade', 'Birim', 'Periyot (kare)', 'Faz', 'Açıklama (isteğe bağlı)'))
FIELDS = [
 ('SAYAC', 'BASLIK_5', 'u16', 'BE', '', '', '', 1, 0, 'Kare sayacı (kayıp kare tespiti); her karede'),
 ('GUC_VOLT', 'GUC_1', 'u16', 'BE', '', 'x*0.001', 'V', 1, 0, 'Her 5 ms (periyot 1)'),
 ('GUC_AKIM', 'GUC_3', 'i16', 'BE', '', 'x*0.01', 'A', 1, 0, 'İşaretli 16 bit'),
 ('GUC_WATT', 'GUC_1', 'u16', 'BE', '', 'GUC_VOLT*GUC_AKIM', 'W', 1, 0, 'Başka alanlardan hesap (aynı periyotta olmalı)'),
 ('SICAKLIK_1', 'ISIL_1', 'i16', 'LE', '', 'x*0.1-40', 'C', 2, 0, 'Her 10 ms: periyot 2 (çift numaralı kareler)'),
 ('SICAKLIK_12BIT', 'ISIL_3', 'u16', 'BE', '0-11', 'x*0.0625-40', 'C', 2, 0, '12 bit alan (alt 12 bit), 10 ms'),
 ('ENLEM', 'NAVIG_1', 'f32', 'BE', '', '', 'derece', 2, 0, 'IEEE-754 tek duyarlıklı, 10 ms'),
 ('BOYLAM', 'NAVIG_5', 'f32', 'BE', '', '', 'derece', 2, 0, ''),
 ('YAKIT_SEVIYE', 'YAKIT_1', 'u16', 'BE', '', 'x/655.35', '%', 2, 1, '10 ms, tek numaralı kareler (faz 1)'),
 ('KONTROL_MOD', 'KONTROL_1', 'u8', 'BE', '4-7', '', '', 1, 0, 'Üst 4 bit mod numarası'),
 ('BAYRAK_0', 'KONTROL_1', 'u8', 'BE', '0', '', '', 1, 0, 'Bit bayrağı'),
 ('BAYRAK_1', 'KONTROL_1', 'u8', 'BE', '1', '', '', 1, 0, 'Bit bayrağı'),
 ('BAYRAK_2', 'KONTROL_1', 'u8', 'BE', '2', '', '', 1, 0, 'Bit bayrağı'),
 ('ADC_KANAL', 'SENSOR_1', 'u16', 'BE', '', '(x-2048)/4096*5', 'V', 1, 0, '12 bit ADC sayısını 0–5 V’a çevirme (örnek)'),
]
for f in FIELDS: al.append(f)
for c in 'ABCDEFGHIJ': al[c + '1'].fill = HDR; al[c + '1'].font = HF
for c, w in zip('ABCDEFGHIJ', (18, 14, 8, 12, 8, 26, 9, 14, 7, 44)): al.column_dimensions[c].width = w
al.freeze_panes = 'A2'
d1 = DataValidation(type='list', formula1='"u8,i8,u16,i16,u32,i32,f32,f64"', allow_blank=True); d2 = DataValidation(type='list', formula1='"BE,LE"', allow_blank=True); al.add_data_validation(d1); al.add_data_validation(d2)
d1.add('C2:C500'); d2.add('D2:D500')

# ---- 5. Türler (başvuru) ----
tp = wb.create_sheet('Türler'); tp.append(('Tür', 'Bayt', 'Aralık / anlam'))
for r in [('u8', 1, '0 … 255'), ('i8', 1, '−128 … 127'), ('u16', 2, '0 … 65.535'), ('i16', 2, '−32.768 … 32.767'), ('u32', 4, '0 … 4.294.967.295'), ('i32', 4, '−2.147.483.648 … 2.147.483.647'), ('f32', 4, 'IEEE-754 tek duyarlık'), ('f64', 8, 'IEEE-754 çift duyarlık')]: tp.append(r)
tp.append(()); tp.append(('Formül işlevleri', '', 'x, + − * / ^, ( ), abs sqrt sin cos tan exp log log10 sign round floor ceil atan2(a,b) pow(a,b) max(a,b) min(a,b) ve başka alan adları'))
for c in 'ABC': tp[c + '1'].fill = HDR; tp[c + '1'].font = HF
tp.column_dimensions['A'].width = 18; tp.column_dimensions['C'].width = 80
wb.save(f'{out}/MATView_Cerceve_Sablonu.xlsx')

# ---- sentetik deneme binary'si ----
rnd = random.Random(11); SYNC = bytes([0xEB, 0x90, 0xA5, 0xC3]); LOST = {400, 401}
rb = bytes(rnd.randrange(256) for _ in range(997)); buf = bytearray()
for k in range(NF):
    fr_ = bytearray((rb * 13)[:L]); fr_[k % 997] ^= k % 251; fr_[0:4] = SYNC; t = k / 200
    def put(nm, idx, fmt, v): o = start[nm] + idx - 1; fr_[o:o + struct.calcsize(fmt)] = struct.pack(fmt, v)
    put('BASLIK', 5, '>H', k % 65536); put('GUC', 1, '>H', int(28000 + 800 * math.sin(0.5 * t))); put('GUC', 3, '>h', int(1200 + 300 * math.sin(0.2 * t)))
    if k % 2 == 0:
        put('ISIL', 1, '<h', int((25 + 0.05 * k + 40) * 10)); put('ISIL', 3, '>H', int((25 + 2 * math.sin(t) + 40) / 0.0625) & 0xFFF)
        put('NAVIG', 1, '>f', 39.9 + 0.001 * k); put('NAVIG', 5, '>f', 32.8 + 0.0008 * k)
    else: put('YAKIT', 1, '>H', int(max(0, 100 - 0.01 * k) * 655.35))
    fr_[start['KONTROL']] = ((k // 20 % 4) << 4) | (1 if k % 10 < 5 else 0) | (2 if k % 20 < 10 else 0); put('SENSOR', 1, '>H', int(2048 + 1500 * math.sin(2 * t)))
    if k in LOST: continue
    buf += fr_
open(f'{out}/sablon_deneme.bin', 'wb').write(buf); print('şablon + deneme binary:', len(buf), 'bayt,', len(buf) // L, 'kare')
