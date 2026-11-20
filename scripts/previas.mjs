// Prévia do link do imóvel no WhatsApp (19/11, pedido do Matheus: "personalizar o que aparece no WhatsApp do cliente,
// seleção exclusiva e alguns detalhes do imóvel").
// O WhatsApp monta a prévia lendo as etiquetas og:* do arquivo, sem rodar o JavaScript. Como o site é estático, cada
// imóvel ganha um arquivo pequeno em i/<id>.html com título, detalhes e a foto da capa; quem abre é levado na hora para
// imovel.html com o mesmo ?l= (a página de verdade, com o nome do cliente e o registro da abertura).
// O <id> é um hash de "src:código" (não mostra imobiliária nem código). A Carteira calcula o mesmo hash (previaId).
// Arquivo de imóvel que saiu do estoque NÃO é apagado: links já enviados continuam com prévia.
// Roda depois de cada atualização dos estoques (o repetidos.mjs chama no fim). À mão: node scripts/previas.mjs
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const ARQ = { j8: 'j8', gon: 'goncalves', sis3: 'sis3', zireh: 'zireh', arya: 'arya', prates: 'prates', pilar: 'pilar', entre: 'entre', urbanic: 'urbanic', v6: 'v6', corretare: 'corretare', mybroker: 'mybroker', j8loc: 'j8-locacao' };
const DIR = new URL('../i/', import.meta.url);
const J8_TIPO = { 'APARTAMENTO': 'Apartamento', 'APARTAMENTO GARDEN': 'Apartamento garden', 'COBERTURA': 'Cobertura', 'CASA': 'Casa', 'CASA CONDOMINIO FECHADO': 'Casa em condomínio',
  'SOBRADO': 'Sobrado', 'SOBRADO CONDOMINIO FECHADO': 'Sobrado em condomínio', 'TERRENO': 'Terreno', 'TERRENO CONDOMINIO FECHADO': 'Terreno em condomínio', 'CONJUNTO/COMERCIAL/LOJA': 'Comercial' };
const GRUPO = t => /^(Casa|Sobrado)/.test(t) ? 'Casa' : /^Apartamento/.test(t) ? 'Apartamento' : t === 'Cobertura' ? 'Cobertura' : /^Terreno/.test(t) ? 'Terreno' : 'Comercial';

// o mesmo hash da Carteira (cyrb53): "j8:71688" -> "1x3k9q…"
function cyrb53(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0, ch; i < str.length; i++) { ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507); h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507); h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}
export const previaId = k => cyrb53('nickel:' + k).toString(36);

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const m2 = v => Math.round(v).toLocaleString('pt-BR') + ' m²';
const reais = v => 'R$ ' + Math.round(v).toLocaleString('pt-BR');
// nome do empreendimento como na Carteira: "KAÁ" -> "Kaá"
const empDe = e => e ? (/[a-zà-ú]/.test(e) ? e : e.toLowerCase().replace(/(^|\s)(\S)/g, (m, a, b) => a + b.toUpperCase())) : '';
// a foto da capa do anúncio em 1200×630 (o tamanho da prévia grande do WhatsApp); na J8 o "_p" é a miniatura de 96 px
const capa = f => 'https://images.weserv.nl/?url=' + encodeURIComponent(String(f).replace(/_p(\.\w+)$/, '$1').replace(/^https?:\/\//, '')) + '&w=1200&h=630&fit=cover&q=72&output=jpg';

function previa(src, i) {
  const tipo = src.startsWith('j8') ? J8_TIPO[i.t] || '' : i.t;
  if (!tipo) return null;
  const g = GRUPO(tipo), b = i.b || 'Curitiba', loc = src === 'j8loc';
  const deRua = { Casa: 'Casa de rua', Sobrado: 'Casa de rua' }[tipo] || '';
  const emp = empDe(i.e);
  const titulo = emp ? `${emp}, ${b}` : `${deRua || tipo} ${/^(Vila|Cidade)\b/.test(b) ? 'na' : 'no'} ${b}`;
  // área da conta (pedido dele): apartamento = privativa, casa = construída, terreno = terreno; nunca a total
  const area = i.aq || 0;
  const det = [emp ? tipo : '',
    area ? (g === 'Apartamento' || g === 'Cobertura' ? `${m2(area)} privativos` : g === 'Casa' ? `${m2(area)} construídos` : g === 'Terreno' ? `${m2(area)} de terreno` : m2(area)) : '',
    g === 'Casa' || g === 'Apartamento' || g === 'Cobertura' ? (i.s && i.s >= i.q ? `${i.s} ${i.s === 1 ? 'suíte' : 'suítes'}` : i.q ? `${i.q} ${i.q === 1 ? 'quarto' : 'quartos'}${i.s ? ` (${i.s} ${i.s === 1 ? 'suíte' : 'suítes'})` : ''}` : '') : '',
    i.v && g !== 'Terreno' ? `${i.v} ${i.v === 1 ? 'vaga' : 'vagas'}` : '',
    i.p ? reais(i.p) + (loc ? '/mês' : '') : ''].filter(Boolean).join(' · ');
  const t = `Seleção exclusiva · ${titulo}`;
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${esc(t)}</title>
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(t)}">
<meta property="og:description" content="${esc(det)}">
${i.f ? `<meta property="og:image" content="${esc(capa(i.f))}">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">` : ''}
<script>location.replace('../imovel.html' + location.search + location.hash)</script>
</head><body style="font-family:system-ui,sans-serif;padding:24px"><a href="../imovel.html">Abrir o imóvel</a></body></html>
`;
}

await mkdir(DIR, { recursive: true });
let escritos = 0, iguais = 0, total = 0;
for (const [src, arq] of Object.entries(ARQ)) {
  let j; try { j = JSON.parse(await readFile(new URL(`../dados/${arq}.json`, import.meta.url), 'utf8')); } catch (e) { continue; }
  for (const i of j.imoveis) {
    const html = previa(src, i); if (!html) continue;
    total++;
    const f = new URL(previaId(src + ':' + i.c) + '.html', DIR);
    let antes = ''; try { antes = await readFile(f, 'utf8'); } catch (e) {}
    if (antes === html) { iguais++; continue; }
    await writeFile(f, html); escritos++;
  }
}
console.log(`Prévias do WhatsApp: ${total} imóveis (${escritos} gravadas, ${iguais} sem mudança).`);

// 20/11: os imóveis Nickel (do próprio Matheus, cadastrados na aba Nickel da Carteira) ficam no Firebase, com as fotos
// em documentos (data URL). O WhatsApp só mostra foto de um endereço público, então a capa vira i/<id>.jpg aqui.
// i/nickel.json = os códigos que já têm prévia (a Carteira usa o link com prévia só para esses).
const FB = 'https://firestore.googleapis.com/v1/projects/nickel-crm/databases/(default)/documents', KEY = 'AIzaSyAV1IBBj0usYroywP0i-SLFSHVJh8_S2-g';
const SITE = 'https://matheusnickel.github.io/nickel-crm/';
const val = f => f == null ? null : 'stringValue' in f ? f.stringValue : 'integerValue' in f ? +f.integerValue : 'doubleValue' in f ? f.doubleValue
  : 'arrayValue' in f ? (f.arrayValue.values || []).map(val) : null;
const comPrevia = [], SUF = process.env.NK_TESTE ? '_TESTE_CLAUDE' : ''; // NK_TESTE=1: lê a base de teste (para conferir)
try {
  const r = await fetch(`${FB}/nickel_imoveis${SUF}?key=${KEY}&pageSize=300`);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const docs = (await r.json()).documents || [];
  for (const d of docs) {
    const o = Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, val(v)])), id = d.name.split('/').pop();
    if (o.status !== 'ativo' || !o.t) continue;
    const g = GRUPO(o.t), area = g === 'Terreno' ? o.at : g === 'Casa' ? (o.ac || o.ap) : g === 'Comercial' ? (o.ap || o.ac || o.atot) : o.ap;
    const i = { c: id, t: o.t, b: o.b, e: o.e, q: o.q, s: o.s, v: o.v, aq: area, p: o.p, f: '' };
    const nome = previaId('nickel:' + id);
    let img = '';
    const capa = (o.fotos || [])[0];
    if (capa) {
      const rf = await fetch(`${FB}/nickel_fotos${SUF}/${capa}?key=${KEY}&mask.fieldPaths=g`);
      const s = rf.ok ? (((await rf.json()).fields || {}).g || {}).stringValue : '';
      if (s && s.startsWith('data:image/jpeg;base64,')) { await writeFile(new URL(nome + '.jpg', DIR), Buffer.from(s.slice(23), 'base64')); img = SITE + 'i/' + nome + '.jpg'; }
    }
    // o mesmo arquivo das imobiliárias, com a foto daqui (Nickel: tipo das categorias da Carteira, não da J8)
    let html = previa('nickel', i); if (!html) continue;
    html = img ? html.replace(/<meta property="og:image"[\s\S]*?summary_large_image">\n?/, '') .replace('<script>', `<meta property="og:image" content="${img}">\n<meta name="twitter:card" content="summary_large_image">\n<script>`) : html;
    await writeFile(new URL(nome + '.html', DIR), html);
    comPrevia.push(id);
  }
  await writeFile(new URL('nickel.json', DIR), JSON.stringify(comPrevia));
  console.log(`Prévias Nickel: ${comPrevia.length} imóveis publicados.`);
} catch (e) { console.log('Prévias Nickel: não consegui ler o Firebase (' + e.message + '); i/nickel.json ficou como estava.'); }
