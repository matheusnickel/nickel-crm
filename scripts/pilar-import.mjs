// Copia os imóveis PRONTOS à venda em Curitiba da PilarHomes (pilarhomes.com.br) para a Carteira, no mesmo formato das outras:
//  - dados/pilar.json          resumo de todos os imóveis (para o cruzamento com os clientes)
//  - dados/pilar/<codigo>.json detalhes + todas as fotos do anúncio (PDF, capa e descritivo)
// A Pilar é um marketplace: cada anúncio é de uma imobiliária parceira (campo `ref`). A lista vem do sitemap que o robots.txt
// indica (sitemap-property-pages) e os dados do __NUXT_DATA__ de cada página. O robots.txt proíbe /api/*, /_ipx/* e os filtros
// da busca, então nada disso é usado. A Pilar esconde rua, número e complemento (só bairro e condomínio), e as páginas por
// rua não servem para descobrir: mostram o bairro inteiro. As fotos vêm com a marca d'água da Pilar, que fica como está.
// O ENDEREÇO vem do site próprio da parceira: quase todas usam a mesma plataforma da Pilar, com o mesmo código de imóvel, e
// a página <site>/imoveis/<código> traz rua e número quando a parceira publica (sem CEP na Carteira, a pedido do Matheus).
// A plataforma não tem campo de complemento. Parceira nova sem site em SITES fica sem endereço: basta acrescentar.
// Empreendimento com lançamento no futuro fica de fora: o Matheus só trabalha com prontos.
// Roda à mão: node scripts/pilar-import.mjs
import { writeFile, readdir, unlink, mkdir, readFile } from 'node:fs/promises';

const SITE = 'https://www.pilarhomes.com.br';
const HEAD = { headers: { 'User-Agent': 'Mozilla/5.0 (CarteiraNickel)', 'Accept-Encoding': 'gzip' } };
const OUT = new URL('../dados/pilar.json', import.meta.url);
const DIR = new URL('../dados/pilar/', import.meta.url);

// o site de cada parceira (achado testando um código real dela em 04/11); sem site: Brunna Stavis, Casa Valente, Aura Home,
// Carlos Osternack, Garcia Mendes, Henrique Martinkoski, Paulo Roberto, Thelma Goulart
const SITES = {
  'Valsa Homes': 'valsahomes.com.br', 'Galleria de Imóveis': 'galleriadeimoveis.com.br', 'Vila 5 Imóveis': 'vila5imoveis.com.br',
  'Mocellin Imoveis': 'mocellinimoveis.com.br', 'Augusta Homes': 'augustahomes.com.br', 'Cammino Curadoria Imobiliária': 'camminoimoveis.com.br',
  'Casa Uno': 'casaunoimoveis.com.br', 'MARAGNA Imóveis selecionados': 'maragnaimoveis.com.br', 'Leonardo Barrosa': 'leonardobarrosa.com.br',
  'J.Assad': 'jassad.com.br', 'NestMob': 'nestmob.com.br', 'Simetria Imóveis': 'simetriaimoveis.com', 'Tria Imóveis': 'triaimoveis.imb.br',
  'Luck Imóveis': 'luck.imb.br', 'Circino': 'circino.com.br', 'Livena Real Estate': 'livenarealestate.com.br', 'MSS Imóveis': 'mssimoveis.imb.br',
  'ID Urbana & Propriedades': 'idurbana.com.br', 'Imobilliare': 'imobilliare.com.br', 'Faatto Imóveis': 'faattoimoveis.com.br',
  'Katy Pedroso Consultoria Imobiliária': 'katypedrosoimoveis.com.br', 'Beth Bertinato': 'bethbertinatoimoveis.com.br', 'Casa Brave': 'casabrave.com.br',
  'Janos Imobiliária': 'janos.imb.br', 'Lu Ferreira Imóveis': 'luferreiraimoveis.com.br', 'Cristina Marin - Curadoria de Imóveis': 'cristinamarinimoveis.com.br',
  'Lumen - Soluções Imobiliárias': 'lumensolucoes.com.br', 'Livella': 'livella.imb.br', 'Investing Curitiba': 'investingcuritiba.com.br',
  'Rodrigo França Imóveis': 'rodrigofrancaimoveis.com.br', 'STNI Imóveis': 'stni.com.br', 'Thais Fornielles': 'thaisfornielles.com.br', 'Pizzatto Imóveis': 'pizzattoimoveis.com.br'
};
const espera = ms => new Promise(s => setTimeout(s, ms));
const norm =s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// propertyType.identifier/name do site → tipo da Carteira
function tipoCarteira(nome, cond) {
  const t = norm(nome);
  if (/chacara|sitio|fazenda|area rural|ilha/.test(t)) return '';
  if (/sala|loja|predio|comercial|galpao|barracao|conjunto|ponto|hotel|industrial|laje/.test(t)) return 'Comercial';
  if (/garden/.test(t)) return 'Apartamento garden';
  if (/cobertura|penthouse/.test(t)) return 'Cobertura';
  if (/apartamento|studio|estudio|loft|flat|kitnet|kitinete|duplex|triplex/.test(t)) return 'Apartamento';
  if (/terreno|lote/.test(t)) return /condominio/.test(t) || cond ? 'Terreno em condomínio' : 'Terreno';
  if (/sobrado/.test(t)) return /condominio/.test(t) || cond ? 'Sobrado em condomínio' : 'Sobrado';
  if (/casa|residencia/.test(t)) return /condominio/.test(t) ? 'Casa em condomínio' : 'Casa';
  return '';
}
// características do anúncio → os mesmos rótulos da J8
const ITENS = {
  'suite master': 'Suíte master', 'closet': 'Closet', 'escritorio': 'Escritório', 'home theater': 'Home theater', 'lareira': 'Lareira', 'lavabo': 'Lavabo',
  'piso aquecido': 'Piso aquecido', 'ar central': 'Ar central', 'ar condicionado central': 'Ar central', 'aquecimento central': 'Aquecimento central',
  'automacao': 'Automação', 'piscina': 'Piscina', 'piscina privativa': 'Piscina', 'piscina aquecida': 'Piscina aquecida', 'churrasqueira': 'Churrasqueira',
  'espaco gourmet': 'Espaço gourmet', 'varanda gourmet': 'Espaço gourmet', 'sauna': 'Sauna', 'adega': 'Adega', 'hidromassagem': 'Hidromassagem', 'jardim': 'Jardim',
  'quintal': 'Quintal', 'terraco': 'Terraço', 'sacada': 'Sacada', 'varanda': 'Sacada', 'deck': 'Deck', 'mezanino': 'Mezanino', 'biblioteca': 'Biblioteca',
  'living hall': 'Living hall', 'estar intimo': 'Estar íntimo', 'elevador privativo': 'Elevador privativo', 'edicula': 'Edícula', 'cinema': 'Home theater'
};
const COND = {
  'portaria 24 horas': 'Portaria 24h', 'portaria 24h': 'Portaria 24h', 'seguranca 24 horas': 'Vigilância 24h', 'seguranca 24h': 'Vigilância 24h', 'salao de festas': 'Salão de festas',
  'academia': 'Academia', 'playground': 'Playground', 'brinquedoteca': 'Brinquedoteca', 'salao de jogos': 'Salão de jogos', 'quadra de tenis': 'Quadra de tênis',
  'quadra poliesportiva': 'Quadra poliesportiva', 'bosque': 'Bosque', 'spa': 'Spa', 'cinema': 'Cinema', 'piscina': 'Piscina', 'piscina aquecida': 'Piscina aquecida',
  'espaco gourmet': 'Espaço gourmet', 'pet place': 'Pet place', 'sauna': 'Sauna', 'coworking': 'Coworking'
};
const rotulos = (lista, mapa) => [...new Set(lista.map(x => { const n = norm(x); return mapa[n] || mapa[n.replace(/s$/, '')] || mapa[n.replace(/s(\s|$)/g, '$1')]; }).filter(Boolean))];

async function pega(url, tentativas = 5) {
  for (let t = 1; t <= tentativas; t++) {
    try { const r = await fetch(url, HEAD); if (r.ok) return await r.text(); if (r.status === 404 || r.status === 410) return ''; } catch (e) {} // 410: anúncio retirado
    await espera(3000 * t);
  }
  throw new Error('Pilar não respondeu: ' + url);
}
// o __NUXT_DATA__ é uma lista em que cada valor aponta para outros pela posição
function nuxt(html) {
  const raw = (html.match(/<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/) || [])[1];
  if (!raw) return null;
  const a = JSON.parse(raw), memo = new Map();
  const rev = i => {
    if (typeof i !== 'number' || i < 0) return undefined;
    if (memo.has(i)) return memo.get(i);
    const v = a[i];
    if (v === null || typeof v !== 'object') { memo.set(i, v); return v; }
    if (Array.isArray(v)) {
      if (typeof v[0] === 'string' && ['Ref', 'ShallowRef', 'Reactive', 'ShallowReactive'].includes(v[0])) { const r = rev(v[1]); memo.set(i, r); return r; }
      const o = []; memo.set(i, o); v.forEach(x => o.push(rev(x))); return o;
    }
    const o = {}; memo.set(i, o); for (const k in v) o[k] = rev(v[k]); return o;
  };
  return rev(0);
}

// 1) a lista: as páginas de imóvel de Curitiba no sitemap
const lista = new Map();
for (let n = 1; n < 10; n++) {
  const x = await pega(`${SITE}/sitemap/sitemap-property-pages-part-${String(n).padStart(4, '0')}.xml`);
  if (!x) break;
  for (const m of x.matchAll(/<loc>(https:\/\/www\.pilarhomes\.com\.br\/imovel\/([^/]+)\/[^<]*-curitiba)<\/loc>/g)) lista.set(m[2], m[1]);
}
if (lista.size < 300) throw new Error('Lista de imóveis estranha: ' + lista.size);

// rua e número no site da parceira. Só número puro vale ("1202-2147483647" vira só a rua) e "rua" igual ao bairro é descartada
const acha = (o, c, seen = new Set()) => {
  if (!o || typeof o !== 'object' || seen.has(o)) return null; seen.add(o);
  if (!Array.isArray(o) && o.commercialId === c && 'address' in o) return o;
  for (const k in o) { const r = acha(o[k], c, seen); if (r) return r; }
  return null;
};
function enderecoDe(d, c, bairro) {
  const o = acha(d, c), rua = String((o && o.address) || '').trim(), num = String((o && o.number) || '').trim();
  if (!rua || norm(rua) === norm(bairro)) return '';
  return /^\d+$/.test(num) ? `${rua}, ${num}` : rua;
}
async function enderecoNaParceira(i) {
  const site = SITES[i.ref]; if (!site) return '';
  try { const html = await pega(`https://${site}/imoveis/${i.c}`, 2); const d = html && nuxt(html); return d ? enderecoDe(d, i.c, i.b) : ''; } catch (e) { return ''; }
}

// 2) a ficha de cada imóvel
const hoje =new Date().toISOString().slice(0, 10);
function ficha(html, c, u) {
  const d = nuxt(html); if (!d) return null;
  const v = (d.data || {})['imovel:' + c]; if (!v) return null;
  const cats = Object.values(v.featuresByCategory || {}).flat().filter(Boolean);
  const nomes = cats.map(x => x.name);
  const noCond = cats.filter(x => ['facilities', 'external_area', 'leisure', 'condominium'].includes(x.category)).map(x => x.name);
  const tipoSite = (v.propertyType || {}).name || '';
  const t = tipoCarteira(tipoSite, !!v.condoName);
  const fotos = [...new Set((v.images || []).map(x => x.watermarkUrl || x.url).filter(Boolean))];
  const mob =nomes.some(x => /^mobiliad|semi.?mobiliad|porteira fechada/.test(norm(x)));
  const i = {
    c, t, cat: tipoSite, ti: ((v.ad || {}).title || v.propertySummary || '').trim(),
    b: v.region || '', ci: v.city || '',
    q: +v.bedrooms || 0, s: +v.suites || 0, v: +v.parkingSpots || 0,
    // at fica 0: a Pilar só diz "Área útil" e "Área total", e a total de casa não é necessariamente o terreno (VA126: 178 e 193 m²)
    a: Math.round(+v.area || +v.totalArea || 0), at: 0,
    mo: mob ? 's' : 'n', ob: 'r', p: +v.askingPrice || 0,
    f: fotos[0] || '', e: String(v.condoName || (v.building && v.building.name) || '').trim(),
    en: '', cp: '', bl: '', ref: (v.company || {}).name || '', u, du: ''
  };
  const detalhe = Object.assign({}, i, {
    cond: Math.round(+v.condoFee || 0), iptu: Math.round(+v.tax || 0), bh: +v.bathrooms || 0,
    ap: +v.area || 0, atot: +v.totalArea || 0, ac: 0, apa: 0, mob, ano: +String(v.launchDate || '').slice(0, 4) || 0,
    itens: rotulos(nomes, ITENS), condItens: rotulos(noCond, COND),
    descricao: String((v.ad || {}).description || '').trim(), fotos
  });
  const fora = (v.ad || {}).transactionType !== 'sell' || v.publicationStatus !== 'published' ? 'nv' : v.launchDate && v.launchDate > hoje ? 'lan' : '';
  return { i, detalhe, fora, cidade: v.city };
}

await mkdir(DIR, { recursive: true });
let anterior = 0;
try { anterior = JSON.parse(await readFile(OUT, 'utf8')).total || 0; } catch {}
const imoveis = [], semTipo = {}, parceiros = {};
let falhas = 0, naoVenda = 0, lanc = 0;
const fila = [...lista.entries()], tentou = new Set();
async function trabalhador() {
  while (fila.length) {
    const [c, u] = fila.shift();
    try {
      const html = await pega(u);
      // veio página sem os dados: o site estava sobrecarregado, tenta de novo uma vez no fim da fila
      if (html && !html.includes('__NUXT_DATA__') && !tentou.has(c)) { tentou.add(c); fila.push([c, u]); await espera(1500); continue; }
      const r = ficha(html, c, u);
      if (!r || r.fora === 'nv' || !r.i.p || r.cidade !== 'Curitiba') { naoVenda++; continue; }
      if (r.fora === 'lan') { lanc++; continue; }
      if (!r.i.t) { semTipo[r.i.cat] = (semTipo[r.i.cat] || 0) + 1; continue; }
      r.i.en = r.detalhe.en = await enderecoNaParceira(r.i);
      await writeFile(new URL(c + '.json', DIR), JSON.stringify(r.detalhe));
      imoveis.push(r.i);
      parceiros[r.i.ref] = (parceiros[r.i.ref] || 0) + 1;
      if (imoveis.length % 100 === 0) console.log(`… ${imoveis.length} imóveis lidos`);
    } catch (e) { if (tentou.has(c)) falhas++; else { tentou.add(c); fila.push([c, u]); await espera(1500); } }
    await espera(400);
  }
}
await Promise.all([trabalhador(), trabalhador()]);

if (imoveis.length < Math.max(300, anterior * 0.8)) throw new Error(`Importação incompleta: ${imoveis.length} (antes ${anterior}), falhas ${falhas}`);
const ativos = new Set(imoveis.map(i => i.c));
for (const f of await readdir(DIR)) if (f.endsWith('.json') && !ativos.has(f.replace('.json', ''))) await unlink(new URL(f, DIR));
imoveis.sort((a, b) => b.p - a.p);
await writeFile(OUT, JSON.stringify({ fonte: 'PilarHomes (pilarhomes.com.br, Curitiba, só prontos)', atualizadoEm: new Date().toISOString(), total: imoveis.length, imoveis }));
console.log(`Estoque da Pilar: ${imoveis.length} imóveis prontos à venda em Curitiba (${lista.size} no sitemap, ${naoVenda} fora de venda, ${lanc} lançamentos fora, ${falhas} falhas).`);
if (Object.keys(semTipo).length) console.log('Tipos fora da Carteira:', semTipo);
const porTipo = {}; imoveis.forEach(i => { porTipo[i.t] = (porTipo[i.t] || 0) + 1; });
console.log('Por tipo:', porTipo);
console.log(`Endereço: ${imoveis.filter(i => i.en).length} com rua, ${imoveis.filter(i => /,\s*\d+$/.test(i.en)).length} com número.`);
console.log('Parceiras sem site em SITES:', Object.keys(parceiros).filter(k => !SITES[k]).join(', ') || 'nenhuma');
console.log('Parceiros:', Object.entries(parceiros).sort((a, b) => b[1] - a[1]).map(([k, n]) => k + ' ' + n).join(' · '));
