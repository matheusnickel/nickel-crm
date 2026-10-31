// Copia os imóveis PRONTOS à venda do site da Zireh (zireh.com.br/prontos) para a Carteira, no mesmo formato das outras:
//  - dados/zireh.json          resumo de todos os imóveis (para o cruzamento com os clientes)
//  - dados/zireh/<codigo>.json detalhes + todas as fotos do anúncio (PDF, capa e descritivo)
// Lançamentos ficam de fora (o Matheus só trabalha com prontos). A busca do site devolve 10 por vez e a ordem embaralha
// empates, então a lista junta várias ordenações. A Zireh não mostra o número da rua nem o complemento.
// Roda à mão: node scripts/zireh-import.mjs
import { writeFile, readdir, unlink, mkdir, readFile } from 'node:fs/promises';

const SITE = 'https://www.zireh.com.br';
const HEAD = { headers: { 'User-Agent': 'Mozilla/5.0 (CarteiraNickel)', 'Accept-Encoding': 'gzip' } };
const OUT = new URL('../dados/zireh.json', import.meta.url);
const DIR = new URL('../dados/zireh/', import.meta.url);

const espera = ms => new Promise(s => setTimeout(s, ms));
const slug = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const norm = s => slug(s).replace(/-/g, ' ');
const entidades = s => String(s || '').replace(/&#0?39;|&apos;/g, "'").replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n)).replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ')
  .replace(/&([a-z]+);/gi, (m, n) => ({ amp: '&', lt: '<', gt: '>', aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', atilde: 'ã', otilde: 'õ', ccedil: 'ç', acirc: 'â', ecirc: 'ê', ocirc: 'ô', agrave: 'à', ldquo: '“', rdquo: '”', ndash: '–', mdash: '—', sup2: '²' }[n] ?? m));
const texto = s => entidades(String(s || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ')).replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
const metros = s => { const m = String(s || '').match(/[\d.,]+/); if (!m) return 0; const t = m[0]; return parseFloat(/,\d{1,2}$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '')) || 0; };
// valores simbólicos ("R$ 0,01" no condomínio e no IPTU) contam como não informados
const reais = s => { const n = Number(String(s || '').replace(/,\d{2}\s*$/, '').replace(/\D/g, '')) || 0; return n < 10 ? 0 : n; };

function tipoCarteira(tipo) {
  const t = norm(tipo), cond = /condominio/.test(t);
  if (/sala|loja|predio|comercial|galpao|barracao|conjunto|ponto|hotel|industrial/.test(t)) return 'Comercial';
  if (/garden/.test(t)) return 'Apartamento garden';
  if (/cobertura/.test(t)) return 'Cobertura';
  if (/apartamento|studio|loft|flat|kitnet|duplex|triplex/.test(t)) return 'Apartamento';
  if (/terreno|lote/.test(t)) return cond ? 'Terreno em condomínio' : 'Terreno';
  if (/sobrado/.test(t)) return cond ? 'Sobrado em condomínio' : 'Sobrado';
  if (/casa|residencia/.test(t)) return cond ? 'Casa em condomínio' : 'Casa';
  return '';
}
// características e lazer → os mesmos rótulos da J8 (vão para a capa do book)
const ITENS = {
  'suite master': 'Suíte master', 'closet': 'Closet', 'escritorio': 'Escritório', 'home theater': 'Home theater', 'lareira': 'Lareira', 'lavabo': 'Lavabo',
  'piso aquecido': 'Piso aquecido', 'ar central': 'Ar central', 'ar condicionado central': 'Ar central', 'aquecimento central': 'Aquecimento central',
  'automacao': 'Automação', 'piscina': 'Piscina', 'piscina aquecida': 'Piscina aquecida', 'churrasqueira': 'Churrasqueira', 'espaco gourmet': 'Espaço gourmet',
  'sauna': 'Sauna', 'adega': 'Adega', 'hidromassagem': 'Hidromassagem', 'jardim': 'Jardim', 'quintal': 'Quintal', 'terraco': 'Terraço', 'sacada': 'Sacada',
  'deck': 'Deck', 'mezanino': 'Mezanino', 'biblioteca': 'Biblioteca', 'living hall': 'Living hall', 'estar intimo': 'Estar íntimo', 'elevador privativo': 'Elevador privativo',
  'casa com elevador': 'Elevador privativo', 'edicula': 'Edícula', 'face norte': 'Face norte', 'marcenaria premium': 'Marcenaria premium'
};
const COND = {
  'portaria24 hrs': 'Portaria 24h', 'portaria 24 horas': 'Portaria 24h', 'portaria 24h': 'Portaria 24h', 'vigilancia24h': 'Vigilância 24h', 'seguranca patrimonial': 'Segurança patrimonial',
  'salao festas': 'Salão de festas', 'salao de festas': 'Salão de festas', 'sala fitness': 'Academia', 'academia': 'Academia', 'playground': 'Playground',
  'brinquedoteca': 'Brinquedoteca', 'salao jogos': 'Salão de jogos', 'salao de jogos': 'Salão de jogos', 'quadra tenis': 'Quadra de tênis', 'quadra de tenis': 'Quadra de tênis',
  'quadra esportes': 'Quadra poliesportiva', 'quadra poliesportiva': 'Quadra poliesportiva', 'bosque': 'Bosque', 'spa': 'Spa', 'cinema': 'Cinema', 'piscina': 'Piscina',
  'piscina aquecida': 'Piscina aquecida', 'espaco gourmet': 'Espaço gourmet', 'pet care': 'Pet place', 'pet place': 'Pet place', 'sauna': 'Sauna', 'coworking': 'Coworking'
};
const rotulos = (lista, mapa) => [...new Set(lista.map(x => mapa[norm(x)]).filter(Boolean))];

async function pega(url, tentativas = 3) {
  for (let t = 1; t <= tentativas; t++) {
    try { const r = await fetch(url, HEAD); if (r.ok) return await r.text(); } catch (e) {}
    await espera(2000 * t);
  }
  throw new Error('Zireh não respondeu: ' + url);
}

// 1) a lista dos prontos, juntando ordenações (cada uma sozinha perde alguns imóveis nos empates)
const lista = new Map(); // código -> endereço do anúncio
for (const ordem of ['valor_desc', 'area_desc', 'recentes', 'valor_asc']) {
  for (let ini = 0; ini < 20000; ini += 10) {
    const html = await pega(`${SITE}/imoveis/busca?pg=prontos&ordem=${ordem}&orig_pg=prontos&pag_f=${ini}`);
    const links = [...html.matchAll(/href="(https:\/\/www\.zireh\.com\.br\/imovel\/venda\/[^"]*?-(\d+)-(\d+))"/g)];
    if (!links.length) break;
    links.forEach(m => { if (!lista.has(m[3])) lista.set(m[3], m[1]); });
    await espera(150);
  }
}
if (lista.size < 100) throw new Error('Lista de imóveis estranha: ' + lista.size);

// 2) a ficha de cada imóvel
function ficha(html, c, u) {
  const ld = (() => { try { return JSON.parse((html.match(/<script type="application\/ld\+json">\s*(\{[\s\S]*?"@type":\s*"(?!BreadcrumbList|Organization|WebPage|RealEstateAgent)[\s\S]*?\})\s*<\/script>/) || [])[1]); } catch (e) { return {}; } })();
  const det = {}; // "Bairro" -> "Pilarzinho"
  const bloco = html.slice(html.indexOf('<div class="detalhes">'), html.indexOf('<div class="detalhes">') + 6000);
  for (const m of bloco.matchAll(/<p>([^<]+?)\s*<b>([\s\S]*?)<\/b><\/p>/g)) det[texto(m[1])] = texto(m[2]);
  const sobre = {}; // "Quartos" -> "3", "Área Privativa" -> "134m²"
  for (const m of html.matchAll(/alt="([^"]+)">\s*<b>([\s\S]*?)<\/b>/g)) if (!(m[1] in sobre)) sobre[m[1]] = texto(m[2]);
  const lista = cls => { const i = html.indexOf(`<div class="${cls}">`); if (i < 0) return []; const b = html.slice(i, i + 5000); return [...b.slice(0, b.indexOf('</div>\n                </div>') > 0 ? b.indexOf('</div>\n                </div>') : 5000).matchAll(/<div>\s*([^<]+?)\s*<\/div>/g)].map(m => texto(m[1])); };
  const composicao = lista('composicoes'), infra = lista('infraestruturas');
  const tipoSite = det['Tipo'] || '';
  const t = tipoCarteira(tipoSite);
  // fotos: as do próprio anúncio estão na pasta do código dele no Vista (as de "imóveis semelhantes" ficam em outras pastas)
  const todas = [...html.matchAll(/href="(https:\/\/cdn\.vistahost\.com\.br\/[^"]+\/fotos\/(\d+)\/[^"]+\.(?:jpe?g|png|webp))"/gi)];
  const pastas = {}; todas.forEach(m => { pastas[m[2]] = (pastas[m[2]] || 0) + 1; });
  const pasta = Object.entries(pastas).sort((a, b) => b[1] - a[1])[0];
  const fotos = pasta ? [...new Set(todas.filter(m => m[2] === pasta[0]).map(m => m[1]))] : [];
  const ap = metros(sobre['Área Privativa']), atot = metros(sobre['Área total']), aterr = metros(det['Área terreno'] || sobre['Área do terreno'] || sobre['Área Terreno']);
  const casa = /^(Casa|Sobrado)/.test(t);
  const mob = composicao.concat(infra).some(x => /^mobiliad/.test(norm(x)));
  // a página mostra só o nome da rua; se o streetAddress do código trouxer número (e unidade, como na SIS3), usa ele
  const sa = ld.address && ld.address.streetAddress ? texto(ld.address.streetAddress).replace(/\s+-\s+[^-]+$/, '') : '';
  const mEnd = sa.match(/^(.*?,\s*\d+[A-Za-z]?)(?:\s+-\s+(.+))?$/);
  const valor = (html.match(/<div class="valor">[\s\S]*?<b class="destaque">([\s\S]*?)<\/b>/) || [])[1];
  const cond = (html.match(/<div class="condominio">[\s\S]*?<b class="destaque">([\s\S]*?)<\/b>/) || [])[1];
  const i = {
    c, t, cat: tipoSite, ti: texto((html.match(/<h1>([\s\S]*?)<\/h1>/) || [])[1]),
    b: det['Bairro'] || '', ci: det['Município'] || '',
    q: +(sobre['Quartos'] || ld.numberOfBedrooms || 0) || 0, s: +(sobre['Suítes'] || 0) || 0, v: +(sobre['Vagas'] || 0) || 0,
    a: Math.round(ap || atot), at: Math.round(casa || /^Terreno/.test(t) ? (aterr || (casa ? 0 : atot)) : 0),
    mo: mob ? 's' : 'n', ob: 'r', p: reais(valor) || Number(ld.offers && ld.offers.price) || 0,
    f: fotos[0] || '', e: '',
    // em geral a Zireh mostra só o nome da rua, sem número nem complemento
    en: mEnd ? mEnd[1] : det['Endereço'] || '', cp: mEnd && mEnd[2] ? mEnd[2].trim() : '', bl: '', u, du: ''
  };
  const detalhe = Object.assign({}, i, {
    cond: reais(cond), iptu: reais(det['IPTU']), bh: +(sobre['Banheiros'] || ld.numberOfBathroomsTotal || 0) || 0,
    ap, atot, ac: 0, apa: 0, mob, ano: +(det['Ano de construção'] || 0) || 0,
    itens: rotulos(composicao, ITENS), condItens: rotulos(infra, COND),
    descricao: texto((html.match(/<div class="descricao">([\s\S]*?)<\/div>/) || [])[1]), fotos
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
    const [c, u] = fila.shift();
    try {
      const { i, detalhe } = ficha(await pega(u), c, u);
      if (!i.t) { semTipo[i.cat] = (semTipo[i.cat] || 0) + 1; continue; }
      await writeFile(new URL(c + '.json', DIR), JSON.stringify(detalhe));
      imoveis.push(i);
      if (imoveis.length % 100 === 0) console.log(`… ${imoveis.length} imóveis lidos`);
    } catch (e) { falhas++; }
    await espera(250);
  }
}
await Promise.all([trabalhador(), trabalhador(), trabalhador(), trabalhador()]);

if (imoveis.length < Math.max(50, anterior * 0.8)) throw new Error(`Importação incompleta: ${imoveis.length} (antes ${anterior}), falhas ${falhas}`);
const ativos = new Set(imoveis.map(i => i.c));
for (const f of await readdir(DIR)) if (f.endsWith('.json') && !ativos.has(f.replace('.json', ''))) await unlink(new URL(f, DIR));
imoveis.sort((a, b) => b.p - a.p);
await writeFile(OUT, JSON.stringify({ fonte: 'Zireh Imóveis (zireh.com.br, só prontos)', atualizadoEm: new Date().toISOString(), total: imoveis.length, imoveis }));
console.log(`Estoque da Zireh: ${imoveis.length} imóveis prontos à venda (${lista.size} na lista do site, ${falhas} falhas).`);
if (Object.keys(semTipo).length) console.log('Tipos sem correspondência na Carteira:', semTipo);
const porTipo = {}; imoveis.forEach(i => { porTipo[i.t] = (porTipo[i.t] || 0) + 1; });
console.log('Por tipo:', porTipo);
