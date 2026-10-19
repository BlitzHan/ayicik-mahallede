// İçeriği kanonik biçime getirir: farklı ajan/ebeveyn çıktılarındaki küçük farkları tolere eder.
const ALAN = { aile: 'aile', mahalle: 'aile', okul: 'okul', din: 'din', cami: 'din', kultur: 'kultur', 'kültür': 'kultur', sahil: 'kultur' };
const TUR = {
  sec: 'sec', renk_sec: 'sec', sekil_sec: 'sec', ses_tani: 'sec', dogru_davranis: 'sec', secim: 'sec',
  say: 'say', sayma: 'say', sirala: 'sirala', siralama: 'sirala', esles: 'esles', eslestir: 'esles', eslestirme: 'esles',
  hafiza: 'hafiza', 'hafıza': 'hafiza',
};

const alanOf = a => ALAN[String(a || '').toLocaleLowerCase('tr').trim()] || 'aile';

export function normalizeContent(c = {}) {
  const npcler = (c.npcler || []).filter(n => n && n.id).map(n => ({
    ...n, alan: alanOf(n.alan), konusmalar: (n.konusmalar || []).filter(Boolean),
  }));
  const bulmacalar = (c.bulmacalar || []).filter(b => b && b.id).map(b => ({
    ...b, alan: alanOf(b.alan), tur: TUR[b.tur] || b.tur || 'sec',
    soru: b.soru || b.soru_sesli || '',
    secenekler: b.secenekler,
  }));
  const ids = new Set(bulmacalar.map(b => b.id));
  const npcIds = new Set(npcler.map(n => n.id));
  const gorevler = (c.gorevler || []).filter(g => g && g.id && npcIds.has(g.npc)).map(g => {
    const hedef = g.hedef || {};
    let tur = g.tur === 'topla' ? 'topla' : 'bulmaca';
    if (tur === 'bulmaca' && hedef.bulmaca && !ids.has(hedef.bulmaca)) hedef.bulmaca = null;
    if (tur === 'topla') { hedef.adet = Math.max(1, Math.min(8, +hedef.adet || 3)); hedef.ikon ||= '⭐'; }
    return { ...g, alan: alanOf(g.alan), tur, hedef, odul: g.odul || g.odul_mesaji || 'Teşekkür ederim!' };
  });
  return {
    npcler, gorevler, bulmacalar,
    aileMesajlari: c.aileMesajlari || [],
    fotolar: c.fotolar || [],
  };
}
