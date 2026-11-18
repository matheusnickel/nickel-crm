// Copia os imóveis PRONTOS à venda em Curitiba da My Broker (mybroker.com.br) para a Carteira, no mesmo formato das outras:
//  - dados/mybroker.json          resumo de todos os imóveis (para o cruzamento com os clientes)
//  - dados/mybroker/<codigo>.json detalhes + todas as fotos do anúncio (PDF, capa e descritivo)
// 18/11, pedido do Matheus (link que ele mandou: /comprar/pr/curitiba). robots.txt: Allow / (proíbe /api/, /favoritos e
// /page-builder — nada disso é usado). O sitemap de imóveis do Paraná vem vazio, então a lista sai da própria busca
// (/comprar/pr/curitiba?page=N, 20 por página). Os /lancamento/ (prédios em obra da Órulo) ficam de fora: ele só trabalha
// com prontos. Site em Next.js: os dados de cada anúncio vêm no payload da página (self.__next_f, objeto "details").
// Fotos com a marca d'água da My Broker (mantida, como na Pilar). Rua sem número; o "complemento" deles é texto livre,
// copiado como está. Roda à mão: node scripts/mybroker-import.mjs
import { writeFile, readdir, unlink, mkdir, readFile } from 'node:fs/promises';

const SITE = 'https://www.mybroker.com.br';
const HEAD = { headers: { 'User-Agent': 'Mozilla/5.0 (CarteiraNickel)', 'Accept-Encoding': 'gzip' } };
const OUT = new URL('../dados/mybroker.json', import.meta.url);
const DIR = new URL('../dados/mybroker/', import.meta.url);

const espera = ms => new Promise(s => setTimeout(s, ms));
const slug = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const norm = s => slug(s).replace(/-/g, ' ');

async function pega(url, tentativas = 3) {
  for (let t = 1; t <= tentativas; t++) {
    try { const r = await fetch(url, HEAD); if (r.ok) return await r.text(); } catch (e) {}
    await espera(2000 * t);
  }
  throw new Error('My Broker não respondeu: ' + url);
}
// junta o payload do Next (as várias partes de self.__next_f.push) e desfaz o escape
function payload(html) {
  let p = '';
  for (const m of html.matchAll(/self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)<\/script>/g)) p += m[1];
  return p.replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
}

// tipo do link ("sobrado-em-condominio", "terreno-condominio", "apartamento"…) → tipos da Carteira
function tipoCarteira(s) {
  const t = norm(s), cond = /condominio/.test(t);
  if (/chacara|fazenda|sitio|haras/.test(t)) return '';
  if (/sala|loja|predio|comercial|galpao|barracao|conjunto|ponto|hotel|industrial|andar corporativo/.test(t)) return 'Comercial';
  if (/garden/.test(t)) return 'Apartamento garden';
  if (/cobertura/.test(t)) return 'Cobertura';
  if (/apartamento|studio|loft|flat|kitnet|duplex|triplex/.test(t)) return 'Apartamento';
  if (/terreno|lote/.test(t)) return cond ? 'Terreno em condomínio' : 'Terreno';
  if (/sobrado/.test(t)) return cond ? 'Sobrado em condomínio' : 'Sobrado';
  if (/casa|residencia/.test(t)) return cond ? 'Casa em condomínio' : 'Casa';
  return '';
}
// diferenciais lidos no texto do anúncio (eles não têm lista de características) → os mesmos rótulos da J8
const ITENS = [['piscina aquecida', 'Piscina aquecida'], ['piscina', 'Piscina'], ['suite master', 'Suíte master'], ['closet', 'Closet'], ['home theater', 'Home theater'],
  ['adega', 'Adega'], ['lareira', 'Lareira'], ['espaco gourmet', 'Espaço gourmet'], ['churrasqueira', 'Churrasqueira'], ['sauna', 'Sauna'], ['hidromassagem', 'Hidromassagem'],
  ['piso aquecido', 'Piso aquecido'], ['ar condicionado central', 'Ar central'], ['automacao', 'Automação'], ['escritorio', 'Escritório'], ['terraco', 'Terraço'],
  ['jardim', 'Jardim'], ['quintal', 'Quintal'], ['sacada', 'Sacada'], ['edicula', 'Edícula'], ['elevador privativo', 'Elevador privativo']];
const COND = [['portaria 24', 'Portaria 24h'], ['academia', 'Academia'], ['salao de festas', 'Salão de festas'], ['playground', 'Playground'], ['quadra de tenis', 'Quadra de tênis'],
  ['brinquedoteca', 'Brinquedoteca'], ['salao de jogos', 'Salão de jogos'], ['pet place', 'Pet place'], ['bosque', 'Bosque'], ['cinema', 'Cinema']];
const achaItens = (txt, lista) => { const t = norm(txt); const r = []; for (const [k, v] of lista) if (t.includes(k) && !r.includes(v)) r.push(v); return r.includes('Piscina aquecida') ? r.filter(x => x !== 'Piscina') : r; };

// 1) a lista: a busca de Curitiba, página por página, até não vir anúncio novo
const lista = new Map(); // código -> { u, tipoLink, bairroLink }
let paginas = 1;
for (let pg = 1; pg <= 200; pg++) {
  const html = await pega(`${SITE}/comprar/pr/curitiba${pg > 1 ? '?page=' + pg : ''}`);
  if (pg === 1) paginas = Math.max(1, ...[...html.matchAll(/\/comprar\/pr\/curitiba\?page=(\d+)/g)].map(m => +m[1]));
  let novos = 0;
  for (const m of html.matchAll(/href="\/([a-z-]+)\/pr\/curitiba\/([a-z0-9-]+)\/(\d+)"/g)) {
    if (m[1] === 'lancamento' || lista.has(m[3])) continue;
    lista.set(m[3], { u: `${SITE}/${m[1]}/pr/curitiba/${m[2]}/${m[3]}`, tipoLink: m[1] }); novos++;
  }
  if (pg >= paginas && !novos) break;
  await espera(300);
}
if (lista.size < 30) throw new Error('Lista de imóveis estranha: ' + lista.size);

// 2) a ficha de cada imóvel: o objeto "details" do payload
const num = (seg, k) => { const m = seg.match(new RegExp(`"${k}":(-?[\\d.]+)`)); return m ? +m[1] : 0; };
const str = (seg, k) => { const m = seg.match(new RegExp(`"${k}":"((?:[^"\\\\]|\\\\.)*)"`)); return m ? m[1].trim() : ''; };
function ficha(html, c, info) {
  const p = payload(html);
  const d = p.indexOf('"details":{'); if (d < 0) throw new Error('sem details');
  const seg = p.slice(d, p.indexOf('"similarProperties"', d) > 0 ? p.indexOf('"similarProperties"', d) : d + 20000);
  if (String(num(seg, 'code')) !== c) throw new Error('código diferente');
  const end = seg.slice(seg.indexOf('"address":{'), seg.indexOf('"images"'));
  const feat = seg.slice(seg.indexOf('"features":{'));
  const t = tipoCarteira(info.tipoLink) || tipoCarteira(str(seg, 'type_property'));
  // o texto do anúncio fica numa referência ("features":"$2a" → linha "2a:T909,texto…")
  const ref = (feat.match(/"features":"\$([0-9a-z]+)"/) || [])[1];
  let descricao = '';
  if (ref) { const k = p.indexOf('\n' + ref + ':T'); if (k >= 0) { const v = p.indexOf(',', k); const tam = parseInt(p.slice(k + ref.length + 3, v), 16) || 4000; descricao = p.slice(v + 1, v + 1 + tam).trim(); } }
  const fotos = [...new Set([...seg.slice(seg.indexOf('"images"'), seg.indexOf('"features"')).matchAll(/"file":"(https:[^"]+)"/g)].map(m => m[1]))];
  const ap = num(feat, 'private_area'), ac = num(feat, 'built_area'), atot = num(feat, 'total_area'), aterr = num(feat, 'land_area');
  const casa = /^(Casa|Sobrado)/.test(t), terreno = /^Terreno/.test(t);
  const titulo = str(seg, 'friendly_title');
  const i = {
    c, t, cat: str(seg, 'type_property'), ti: titulo,
    b: str(end, 'neighborhood'), ci: (end.match(/"city":\{"name":"([^"]+)"/) || [])[1] || 'Curitiba',
    q: num(feat, 'number_of_bedrooms'), s: num(feat, 'number_of_suites'), v: num(feat, 'parking_spaces'),
    a: Math.round(terreno ? (aterr || atot || ap) : (ap || ac || atot)), at: Math.round(casa || terreno ? (aterr || (terreno ? atot : 0)) : 0),
    aq: Math.round(terreno ? (aterr || atot) : casa ? (ac || ap) : (ap || ac)), // área da conta: nunca a total
    mo: /mobiliad|porteira fechada/i.test(titulo + ' ' + descricao.slice(0, 600)) ? 's' : 'n', ob: 'r', p: num(seg, 'sale_price'),
    f: fotos[0] || '', e: (end.match(/"condominium":\{"name":"([^"]+)"/) || [])[1] || '',
    en: str(end, 'street'), cp: str(end, 'complement'), bl: '', ref: '', u: info.u, du: str(seg, 'update_date').slice(0, 10)
  };
  const detalhe = Object.assign({}, i, {
    cond: num(seg, 'condos_price'), iptu: num(seg, 'iptu_price'), bh: num(feat, 'number_of_bathrooms'),
    ap, atot, ac, apa: 0, mob: i.mo === 's', ano: 0,
    itens: achaItens(descricao, ITENS), condItens: achaItens(descricao, COND), descricao, fotos
  });
  return { i, detalhe };
}

await mkdir(DIR, { recursive: true });
let anterior = 0;
try { anterior = JSON.parse(await readFile(OUT, 'utf8')).total || 0; } catch {}
const imoveis = [], semTipo = {};
let falhas = 0;
const fila = [...lista.entries()];
async function trabalhador() {
  while (fila.length) {
    const [c, info] = fila.shift();
    try {
      const { i, detalhe } = ficha(await pega(info.u), c, info);
      if (!i.t) { semTipo[info.tipoLink] = (semTipo[info.tipoLink] || 0) + 1; continue; }
      await writeFile(new URL(c + '.json', DIR), JSON.stringify(detalhe));
      imoveis.push(i);
      if (imoveis.length % 100 === 0) console.log(`… ${imoveis.length} imóveis lidos`);
    } catch (e) { falhas++; }
    await espera(250);
  }
}
await Promise.all([trabalhador(), trabalhador(), trabalhador()]);

if (imoveis.length < Math.max(20, anterior * 0.8)) throw new Error(`Importação incompleta: ${imoveis.length} (antes ${anterior}), falhas ${falhas}`);
const ativos = new Set(imoveis.map(i => i.c));
for (const f of await readdir(DIR)) if (f.endsWith('.json') && !ativos.has(f.replace('.json', ''))) await unlink(new URL(f, DIR));
imoveis.sort((a, b) => b.p - a.p);
await writeFile(OUT, JSON.stringify({ fonte: 'My Broker (mybroker.com.br, Curitiba, só prontos)', atualizadoEm: new Date().toISOString(), total: imoveis.length, imoveis }));
console.log(`Estoque da My Broker: ${imoveis.length} imóveis prontos à venda em Curitiba (${lista.size} na busca sem os lançamentos, ${paginas} páginas, ${falhas} falhas).`);
if (Object.keys(semTipo).length) console.log('Tipos fora da Carteira:', semTipo);
const porTipo = {}; imoveis.forEach(i => { porTipo[i.t] = (porTipo[i.t] || 0) + 1; });
console.log('Por tipo:', porTipo, '| com rua', imoveis.filter(i => i.en).length, '| com complemento', imoveis.filter(i => i.cp).length, '| com área da conta', imoveis.filter(i => i.aq > 0).length, '| sem preço', imoveis.filter(i => !i.p).length);
