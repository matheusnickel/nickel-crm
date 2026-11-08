// Copia os imóveis à venda da Baltazzar (baltazzar.co) para a Carteira, no mesmo formato das outras:
//  - dados/baltazzar.json          resumo de todos os imóveis (para o cruzamento com os clientes)
//  - dados/baltazzar/<codigo>.json detalhes + todas as fotos do anúncio (PDF, capa e descritivo)
// O site é da Loft, com o cadastro no Vista. A lista vem do sitemap (sitemaps/imoveis-N.xml); o robots.txt proíbe /busca/,
// que não é usado. Os dados vêm da própria página (o conteúdo do Next.js dentro dela): o resumo do anúncio, os atributos
// data-* do card e as listas de características. A Baltazzar NÃO publica rua, número nem complemento (só bairro e cidade,
// e o mapa é marcado como localização aproximada). Área: a do link ("…-208m2-61", privativa); sem ela, data-area (terrenos).
// O data-area dos apartamentos é outra medida (apto 4: link 874 m², data-area 1.440). Suítes não vêm separadas.
// Roda à mão: node scripts/baltazzar-import.mjs
import { writeFile, readdir, unlink, mkdir, readFile } from 'node:fs/promises';

const SITE = 'https://baltazzar.co';
const HEAD = { headers: { 'User-Agent': 'Mozilla/5.0 (CarteiraNickel)', 'Accept-Encoding': 'gzip' } };
const OUT = new URL('../dados/baltazzar.json', import.meta.url);
const DIR = new URL('../dados/baltazzar/', import.meta.url);
const espera = ms => new Promise(s => setTimeout(s, ms));
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function tipoCarteira(cat, cond) {
  const t = norm(cat);
  if (/sala|loja|predio|comercial|galpao|barracao|conjunto|ponto|hotel|industrial/.test(t)) return 'Comercial';
  if (/chacara|sitio|fazenda|rural/.test(t)) return '';
  if (/cobertura/.test(t)) return 'Cobertura';
  if (/garden/.test(t)) return 'Apartamento garden';
  if (/apartamento|studio|loft|flat|kitnet|duplex|triplex/.test(t)) return 'Apartamento';
  if (/terreno|lote/.test(t)) return /condominio/.test(t) || cond ? 'Terreno em condomínio' : 'Terreno';
  if (/sobrado/.test(t)) return /condominio/.test(t) || cond ? 'Sobrado em condomínio' : 'Sobrado';
  if (/casa/.test(t)) return /condominio/.test(t) ? 'Casa em condomínio' : 'Casa';
  return '';
}
const ITENS = {
  'suite master': 'Suíte master', 'closet': 'Closet', 'escritorio': 'Escritório', 'home theater': 'Home theater', 'lareira': 'Lareira', 'lavabo': 'Lavabo',
  'piso aquecido': 'Piso aquecido', 'ar central': 'Ar central', 'aquecimento central': 'Aquecimento central', 'automacao': 'Automação', 'piscina': 'Piscina',
  'piscina aquecida': 'Piscina aquecida', 'churrasqueira': 'Churrasqueira', 'espaco gourmet': 'Espaço gourmet', 'sauna': 'Sauna', 'adega': 'Adega',
  'hidromassagem': 'Hidromassagem', 'jardim': 'Jardim', 'quintal': 'Quintal', 'terraco': 'Terraço', 'sacada': 'Sacada', 'deck': 'Deck', 'mezanino': 'Mezanino',
  'biblioteca': 'Biblioteca', 'living hall': 'Living hall', 'estar intimo': 'Estar íntimo', 'edicula': 'Edícula'
};
const COND = {
  'portaria 24 horas': 'Portaria 24h', 'portaria 24h': 'Portaria 24h', 'salao de festas': 'Salão de festas', 'academia': 'Academia', 'playground': 'Playground',
  'brinquedoteca': 'Brinquedoteca', 'salao de jogos': 'Salão de jogos', 'quadra de tenis': 'Quadra de tênis', 'quadra poliesportiva': 'Quadra poliesportiva',
  'bosque': 'Bosque', 'spa': 'Spa', 'cinema': 'Cinema', 'piscina': 'Piscina', 'piscina aquecida': 'Piscina aquecida', 'espaco gourmet': 'Espaço gourmet',
  'pet place': 'Pet place', 'sauna': 'Sauna', 'coworking': 'Coworking'
};
const rotulos = (lista, mapa) => [...new Set(lista.map(x => mapa[norm(x)]).filter(Boolean))];

async function pega(url, tentativas = 3) {
  for (let t = 1; t <= tentativas; t++) {
    try { const r = await fetch(url, HEAD); if (r.ok) return await r.text(); if (r.status === 404 || r.status === 410) return ''; } catch (e) {}
    await espera(2000 * t);
  }
  throw new Error('Baltazzar não respondeu: ' + url);
}
// o conteúdo que o Next.js manda junto com a página (self.__next_f.push([1,"…"]))
const payload = html => [...html.matchAll(/self\.__next_f\.push\(\[1,("[\s\S]*?")\]\)/g)].map(m => { try { return JSON.parse(m[1]); } catch (e) { return ''; } }).join('');

function ficha(html, c, u) {
  const p = payload(html); if (!p) return null;
  const resumo = (() => { const m = p.match(new RegExp(`\\{"titulo":"[^"]*","status":"[^"]*","categoria":"[^"]*","codigo":"${c}","endereco":"[^"]*","valorVenda":"\\d*","valorLocacao":"\\d*"\\}`)); try { return m ? JSON.parse(m[0]) : null; } catch (e) { return null; } })();
  const attr = k => (p.match(new RegExp(`"data-${k}":"([^"]*)"`)) || [])[1] || '';
  const num = k => +((p.match(new RegExp(`"children":\\["(\\d+)"," ${k}"`)) || [])[1] || 0);
  const cat = (resumo && resumo.categoria) || attr('type');
  const caract = [...p.matchAll(/\["\$","div","([^"]{2,60})",\{"className":"flex flex-row items-center gap-2 p-4/g)].map(m => m[1]);
  const k = p.indexOf('"children":"Infraestrutura"');
  const infra = k >= 0 ? [...p.slice(k, k + 6000).matchAll(/"className":"text-sm font-normal","children":"([^"]{2,60})"/g)].map(m => m[1]) : [];
  const t = tipoCarteira(cat, infra.some(x => /condom[ií]nio fechado/i.test(x)));
  // área: a do link ("…-208m2-61"); o terreno não tem metragem no link e usa o data-area
  const area = +((u.match(/-(\d+(?:\.\d+)?)m2-\d+$/) || [])[1] || 0) || +attr('area');
  const fotos = [...new Set(p.match(new RegExp(`https://cdn\\.vistahost\\.com\\.br/[^"\\s]+/fotos/${c}/[^"\\s]+?\\.(?:jpe?g|png|webp)`, 'gi')) || [])].filter(f => !/_p\.\w+$/.test(f));
  const [bairro, cidade] = String((resumo && resumo.endereco) || '').split(',').map(s => s.trim());
  const mob = caract.some(x => /^mobiliad/i.test(x));
  const casa = /^(Casa|Sobrado)/.test(t);
  const i = {
    c: String(c), t, cat, ti: (resumo && resumo.titulo) || '',
    b: bairro || attr('neighborhood'), ci: (cidade || attr('city')).replace(/\s*-\s*[A-Z]{2}$/, ''),
    q: +attr('bedrooms') || num('Dormitório'), s: 0, v: num('Vaga'), a: Math.round(area), at: 0,
    mo: mob ? 's' : '', ob: 'r', p: +((resumo && resumo.valorVenda) || attr('price-venda') || 0) || 0,
    f: fotos[0] || attr('image'), e: '', en: '', cp: '', bl: '', ref: '', u, du: ''
  };
  const detalhe = Object.assign({}, i, {
    cond: +attr('condo') || 0, iptu: +((p.match(/"valorIptu":"(\d+)"/) || [])[1] || 0), bh: +attr('bathrooms') || num('Banheiro'),
    ap: casa ? 0 : area, ac: casa ? area : 0, atot: 0, apa: 0, mob, ano: 0,
    itens: rotulos(caract, ITENS), condItens: rotulos(infra, COND), descricao: '', fotos
  });
  const venda = (resumo && /venda/i.test(resumo.status)) || attr('has-venda') === '1';
  return { i, detalhe, fora: venda && i.p ? '' : 'nv' };
}

// 1) a lista pelo sitemap
const idx = await pega(SITE + '/sitemap.xml');
const mapas = [...idx.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map(m => m[1]).filter(u => /imoveis-\d+\.xml/.test(u));
const lista = new Map();
for (const m of mapas) for (const x of (await pega(m)).matchAll(/<loc>\s*(https:\/\/baltazzar\.co\/imovel\/[^<\s]+-(\d+))\s*<\/loc>/g)) lista.set(x[2], x[1]);
if (lista.size < 5) throw new Error('Lista de imóveis estranha: ' + lista.size);

await mkdir(DIR, { recursive: true });
let anterior = 0; try { anterior = JSON.parse(await readFile(OUT, 'utf8')).total || 0; } catch {}
const imoveis = [], semTipo = {}; let fora = 0, falhas = 0;
for (const [c, u] of lista) {
  try {
    const r = ficha(await pega(u), c, u);
    if (!r || r.fora) { fora++; continue; }
    if (!r.i.t) { semTipo[r.i.cat] = (semTipo[r.i.cat] || 0) + 1; continue; }
    await writeFile(new URL(c + '.json', DIR), JSON.stringify(r.detalhe));
    imoveis.push(r.i);
  } catch (e) { falhas++; }
  await espera(500);
}
if (imoveis.length < Math.max(5, anterior * 0.7)) throw new Error(`Importação incompleta: ${imoveis.length} (antes ${anterior}), falhas ${falhas}`);
const ativos = new Set(imoveis.map(i => i.c));
for (const f of await readdir(DIR)) if (f.endsWith('.json') && !ativos.has(f.replace('.json', ''))) await unlink(new URL(f, DIR));
imoveis.sort((a, b) => b.p - a.p);
await writeFile(OUT, JSON.stringify({ fonte: 'Baltazzar (baltazzar.co)', atualizadoEm: new Date().toISOString(), total: imoveis.length, imoveis }));
const porTipo = {}; imoveis.forEach(i => { porTipo[i.t] = (porTipo[i.t] || 0) + 1; });
console.log(`Estoque da Baltazzar: ${imoveis.length} imóveis à venda (${lista.size} no site, ${fora} fora de venda, ${falhas} falhas).`, porTipo, Object.keys(semTipo).length ? '| tipos fora: ' + JSON.stringify(semTipo) : '');
