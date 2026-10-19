# Ayıcık Mahallede — modül sözleşmesi

Derlemesiz web oyunu. `index.html` + ES modülleri. three.js sabit sürüm: `three@0.170.0` (importmap, jsDelivr).
Hedef: iPhone Safari ve Android Chrome, dikey değil **yatay** ekran, 4-5 yaş, okuma yok.
Her modül yalnız kendi dosyalarına yazar. Diğer modülleri aşağıdaki API ile kullanır.

## Klasörler

```
oyun/
  index.html            (çekirdek — orkestra şefi)
  css/oyun.css          (çekirdek)  · css/bulmaca.css (bulmaca ajanı) · css/panel.css (panel ajanı) · css/gardrop.css (gardırop)
  js/main.js            (çekirdek: döngü, durumlar, dünya, ayı, kamera, kontroller)
  js/core/store.js      (panel ajanı)   kayıt, profiller, ebeveyn içeriği, ses klipleri
  js/core/speech.js     (çekirdek)      konuşma
  js/core/sfx.js        (ses ajanı)     prosedürel ses efekti + müzik
  js/puzzles/index.js   (bulmaca ajanı) bulmaca ekranları
  js/parent/panel.js    (panel ajanı)   ebeveyn paneli
  js/ui/gardrop.js      (gardırop)      şapka + gömlek seçim ekranı
  icerik/icerik.json    (içerik)        temel içerik bankası
```

## Ortak kurallar
- Yazı yok varsayımı: çocuk okumuyor. Her yönerge sesli (`speak`). Ekranda yazı yalnızca küçük alt yazı olabilir (ebeveyn için).
- Dokunma hedefi en az 88 px. Emoji ikonlar (iOS ve Android'de görünen yaygın emojiler).
- Yanlış cevapta ceza yok: hafif "boing" sesi, titreşim animasyonu, "Bir daha deneyelim!".
- Doğru cevapta konfeti + `sfx.play('yes')` + övgü.
- DOM katmanı: `#overlay` (bulmaca ve panel ekranları buraya açılır, tam ekran, `z-index: 50`).
- `safe-area-inset-*` padding kullan (çentikli telefonlar).
- Kütüphane yok (three.js hariç). Vanilla JS, ES2020.

## js/core/store.js (panel ajanı yazar)

```js
export const store = {
  init(): Promise<void>                       // IndexedDB açar, localStorage'dan okur
  profiles(): Profile[]                        // [{id, ad, renk, foto: dataURL|null}]
  activeProfile(): Profile|null
  setActive(id), addProfile({ad, renk, foto}), updateProfile(id, patch), removeProfile(id)
  progress(): Progress                         // aktif profilin ilerlemesi
  //  Progress = {altin:number, yildiz:{[id]:true}, cozulen:{[bulmacaId]:true}, kostum:string|null, kostumler:string[], gomlek:string|null}
  //  gomlek = giyilen kıyafetin id'si (store.shirts()) ya da null
  saveProgress(patch)                          // birleştirip kaydeder
  content(): Content                           // icerik.json + ebeveyn eklemeleri birleşik
  //  Content = {npcler:[], gorevler:[], bulmacalar:[], aileMesajlari:[{id, kimden, metin, sesKey}], fotolar:[{id, dataURL}]}
  custom(): Custom                             // yalnız ebeveyn eklemeleri (+ kiyafetler:[{id, tur:'gomlek', tarih, dataURL}])
  saveCustom(custom)
  getClip(key): Promise<Blob|null>             // ebeveyn kaydı ses
  putClip(key, blob): Promise<void>
  deleteClip(key): Promise<void>
  listClips(): Promise<string[]>
  exportAll(): Promise<string>                 // JSON (sesler base64) — iki telefon arasında taşımak için
  importAll(json: string): Promise<void>
  resetProgress(profileId)
  // Kıyafetler (ebeveyn çocuğun gerçek gömleğini fotoğraflar; init() sonrası kullan)
  shirts(): {id, tur:'gomlek', tarih}[]        // liste, eskiden yeniye (özel veride `kiyafetler`)
  getShirt(id): string|null                    // JPEG dataURL (256×256), eşzamanlı; yoksa null
  addShirt(dataURL): Promise<{id,tur,tarih}>   // IndexedDB `fotolar` deposuna 'kiyafet:<id>' anahtarıyla yazar
  removeShirt(id): Promise<boolean>            // siler; giyen çocukların progress.gomlek'i null olur
}
export async function loadBaseContent(): Promise<Content>   // fetch('icerik/icerik.json')
```
Kıyafet listesi ve görselleri `exportAll`/`importAll` içindedir (`ozel.kiyafetler`, dataURL ile; kıyafetsiz eski yedek bu cihazdakileri silmez).
Ses klibi anahtarları (`key`): `hosgeldin`, `aferin-1..3`, `tekrar`, `npc:<npcId>:<i>`, `bulmaca:<id>`, `mesaj:<id>`.

## js/core/speech.js (çekirdek yazar)
```js
export function speak(text, {key}={}): Promise<void>   // key için ebeveyn kaydı varsa onu çalar, yoksa tr-TR TTS
export function stopSpeak()
export function unlockAudio()                           // ilk dokunuşta çağrılır (iOS)
```

## js/core/sfx.js (ses ajanı yazar)
```js
export const sfx = {
  unlock(),                      // ilk kullanıcı dokunuşunda AudioContext resume
  play(name),                    // 'jump','land','coin','star','yes','no','pop','step','splash','open','talk','whoosh','bounce'
  music(name|null),              // 'mahalle','okul','cami','sahil','baslik' — basit, neşeli, döngülü prosedürel melodi; null = durdur
  setVolume(sfx0to1, music0to1)
}
```

## js/puzzles/index.js (bulmaca ajanı yazar)
```js
export function openPuzzle(def, ctx): Promise<{solved:boolean}>
// ctx = {speak, sfx, childName, onClose}
```
Bulmaca tanımı (kanonik şema; `icerik.json` → `bulmacalar[]` ve ebeveyn eklemeleri):
```json
{"id":"renk-1","alan":"okul|din|kultur|aile","tur":"sec",
 "soru":"Kırmızı balonu bul!",
 "secenekler":[{"ikon":"🎈","renk":"#e53935","dogru":true,"ses":"Kırmızı balon"},{"ikon":"🎈","renk":"#1e88e5","dogru":false}],
 "odul":"Aferin! Kırmızıyı buldun!"}
```
Türler:
- `sec`: 2-4 seçenek, doğru olan(lar)a dokun. `renk` verilmişse ikonun arkasına o renkte daire çiz. (renk, şekil, doğru davranış, ses tanıma hepsi bu tür)
- `say`: `{"ikon":"🍎","adet":3,"secenekler":[2,3,4]}` — ekranda adet kadar ikon (dokununca tek tek sayılır ve sesli "bir, iki, üç"), altta sayı seçenekleri büyük rakam + nokta gösterimiyle.
- `sirala`: `{"adimlar":[{"ikon":"🚰","ses":"Suyu aç"},{"ikon":"🧼","ses":"Sabunla"}]}` — verilen sıra doğrudur, ekranda karışık gösterilir, çocuk sırayla dokunur; doğru dokunuş üstte numaralı yuvaya uçar.
- `esles`: `{"ciftler":[[{"ikon":"🐄"},{"ikon":"🥛"}],[{"ikon":"🐔"},{"ikon":"🥚"}]]}` — sol sütundan birine, sağ sütundan eşine dokun; doğruysa çizgiyle bağlanır.
- `hafiza`: `{"ikonlar":["🐱","🐶","🐟"]}` — kartlar ters, ikişer ikişer çevir, eşleri bul (3-4 çift).
- Bilinmeyen tür → `sec` gibi davran ya da kibarca kapan (`{solved:false}`).

## js/parent/panel.js (panel ajanı yazar)
```js
export function openParentPanel(ctx): Promise<void>   // ctx = {speak, sfx, onChange}
```
Giriş kapısı: çekirdek ⚙️ düğmesine 2 sn basılı tutulunca çağırır. Panel önce yetişkin sorusu sorar (ör. "7 + 8 = ?", rastgele, yazılı).
Panel YETİŞKİN içindir: yazı kullanılabilir, Türkçe.
Sekmeler: Çocuklar · Sesim · Aile · Bulmacalarım · **Kıyafetler** · Kayıt. Kıyafetler: `<input type=file accept="image/*" capture="environment">`
(düz HTTP'de de çalışır) → ortadan kare kırp, 256×256 JPEG (0.8) → `store.addShirt`; küçük resim ızgarası, her birinde sil düğmesi (en çok 24).

## js/world/bear.js — gömlek
```js
createBear(...).setShirt(img | null)   // img: HTMLImageElement | canvas | ImageBitmap | dataURL (metin); null = çıkar
```
Kabuk gövdenin alt ~%68'ini sarar (gövde grubuna bağlı), kısa kollar kol gruplarına bağlıdır: gövde/kol animasyonunu izler.
Doku tuvali: taban renk = fotoğraf kenar piksellerinin ortalaması; fotoğrafın merkez karesi karnın önüne (+z) baskı olur.
Giyilince açık renkli göbek lekesi gizlenir, atkı ucu 0.03 öne alınır. Dış hat: kabuk ve kollar kendi dış hat kabuklarını taşır
(`userData.outline`). NPC ayılarda (`npc: true`) etkisizdir. Gölge bayrakları gömlek parçalarında kendiliğinden açıktır.

## js/ui/gardrop.js (gardırop)
```js
export function openWardrobe({ player, store, sfx, speak, kostumler, progress, saveProgress, onChange?, camera? }): Promise<void>
// kostumler = sahip olunan şapkalar [{ad, ikon}] (ikon: emoji); progress = () => Progress; saveProgress(patch)
// onChange: her seçimden sonra çağrılır (gölge bayraklarını yenilemek için); camera: verilirse sahne sola kayar (setViewOffset)
```
Tam ekran katman (`#overlay`), yazı yok. Sağ panelde iki bölüm: şapkalar (🚫 + sahip olunanlar) ve gömlekler (👕🚫 + fotoğraf küçük resimleri).
Şapka ve gömlek bağımsız yuvalardır. Dokunuş anında `player.setCostume(ad)` / `player.setShirt(img)` uygular, `sfx.play('pop')`,
`progress.kostum` ve `progress.gomlek` (id | null) yazar. Büyük ✖️ ile ya da Esc ile kapanır (Promise çözülür). Şapka da gömlek de yoksa
"Altın topla, şapka kazan!" der ve açılmaz. Sınama: `test/gardrop.html`.

## Dünya (çekirdek)
Ada merkezli dünya; 4 bölge: **Mahalle** (ev, aile, başlangıç) → **Okul bahçesi** (renk/şekil/sayı) → **Cami bahçesi** (selam, besmele, paylaşma; insan/peygamber görseli yok) → **Sahil** (vapur, martı, simit, Galata). Her bölgede 5 yıldız; yıldızlar bir sonraki bölgenin köprüsünü açar. Ölüm yok: suya düşen ayı son kontrol noktasında yumuşakça belirir.
