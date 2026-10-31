// Copia o estoque À VENDA do site da SIS3 (sis3imoveis.com) para a Carteira, no mesmo formato da J8 e da A. Gonçalves:
//  - dados/sis3.json          resumo de todos os imóveis (para o cruzamento com os clientes)
//  - dados/sis3/<codigo>.json detalhes + todas as fotos do anúncio (PDF, capa e descritivo)
// A lista vem da própria busca do site (imoveis/busca, 10 por vez) e cada página de imóvel traz a ficha completa.
// Roda à mão: node scripts/sis3-import.mjs
import { writeFile, readdir, unlink, mkdir, readFile } from 'node:fs/promises';

const SITE = 'https://www.sis3imoveis.com';
const HEAD = { headers: { 'User-Agent': 'Mozilla/5.0 (CarteiraNickel)', 'Accept-Encoding': 'gzip' } };
const OUT = new URL('../dados/sis3.json', import.meta.url);
const DIR = new URL('../dados/sis3/', import.meta.url);

const espera = ms => new Promise(s => setTimeout(s, ms));
const slug = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const norm = s => slug(s).replace(/-/g, ' ');
const entidades = s => String(s || '').replace(/&#0?39;|&apos;/g, "'").replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n)).replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ')
  .replace(/&([a-z]+);/gi, (m, n) => ({ amp: '&', lt: '<', gt: '>', aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', atilde: 'ã', otilde: 'õ', ccedil: 'ç', acirc: 'â', ecirc: 'ê', ocirc: 'ô', agrave: 'à', ldquo: '“', rdquo: '”', ndash: '–', mdash: '—', sup2: '²', Aacute: 'Á', Eacute: 'É', Ccedil: 'Ç', Atilde: 'Ã' }[n] ?? m));
const texto = s => entidades(String(s || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
// "846,44m²" / "846.44 m²" / "R$ 12.900.000,00" → número
const metros = s => { const m = String(s || '').match(/[\d.,]+/); if (!m) return 0; const t = m[0]; return parseFloat(/,\d{1,2}$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '')) || 0; };
const reais = s => Number(String(s || '').replace(/,\d{2}\s*$/, '').replace(/\D/g, '')) || 0;

// tipos da SIS3 → tipos da Carteira (os mesmos nomes das categorias da J8)
function tipoCarteira(tipo, condominio) {
  const t = norm(tipo);
  if (/sala|loja|predio|comercial|galpao|barracao|conjunto|ponto|hotel|industrial/.test(t)) return 'Comercial';
  if (/garden/.test(t)) return 'Apartamento garden';
  if (/cobertura/.test(t)) return 'Cobertura';
  if (/apartamento|studio|loft|flat|kitnet|duplex|triplex/.test(t)) return 'Apartamento';
  if (/terreno|lote|area/.test(t)) return /condominio/.test(t) || condominio ? 'Terreno em condomínio' : 'Terreno';
  if (/sobrado/.test(t)) return /condominio/.test(t) || condominio ? 'Sobrado em condomínio' : 'Sobrado';
  if (/casa|residencia/.test(t)) return /condominio/.test(t) || condominio ? 'Casa em condomínio' : 'Casa';
  return '';
}
// características e lazer → os mesmos rótulos da J8 (vão para a capa do book)
const ITENS = {
  'suite master': 'Suíte master', 'closet': 'Closet', 'escritorio': 'Escritório', 'home theater': 'Home theater', 'cinema': 'Home theater', 'lareira': 'Lareira',
  'lavabo': 'Lavabo', 'piso aquecido': 'Piso aquecido', 'ar condicionado central': 'Ar central', 'ar central': 'Ar central', 'aquecimento central': 'Aquecimento central',
  'automacao': 'Automação', 'piscina': 'Piscina', 'piscina aquecida': 'Piscina aquecida', 'churrasqueira': 'Churrasqueira', 'espaco gourmet': 'Espaço gourmet',
  'sauna': 'Sauna', 'adega': 'Adega', 'hidromassagem': 'Hidromassagem', 'jardim': 'Jardim', 'quintal': 'Quintal', 'terraco': 'Terraço', 'sacada': 'Sacada',
  'deck': 'Deck', 'mezanino': 'Mezanino', 'biblioteca': 'Biblioteca', 'living hall': 'Living hall', 'estar intimo': 'Estar íntimo', 'elevador privativo': 'Elevador privativo',
  'edicula': 'Edícula', 'brinquedoteca': 'Brinquedoteca'
};
const COND = {
  'portaria 24 horas': 'Portaria 24h', 'portaria 24h': 'Portaria 24h', 'seguranca 24 horas': 'Vigilância 24h', 'salao de festas': 'Salão de festas', 'academia': 'Academia',
  'sala fitness': 'Academia', 'playground': 'Playground', 'brinquedoteca': 'Brinquedoteca', 'salao de jogos': 'Salão de jogos', 'quadra de tenis': 'Quadra de tênis',
  'quadra poliesportiva': 'Quadra poliesportiva', 'quadra de areia': 'Quadra de areia', 'bosque': 'Bosque', 'spa': 'Spa', 'cinema': 'Cinema', 'piscina': 'Piscina',
  'piscina aquecida': 'Piscina aquecida', 'espaco gourmet': 'Espaço gourmet', 'pet place': 'Pet place', 'sauna': 'Sauna', 'coworking': 'Coworking'
};
const rotulos = (lista, mapa) => [...new Set(lista.map(x => mapa[norm(x)]).filter(Boolean))];

async function pega(url, tentativas = 3) {
  for (let t = 1; t <= tentativas; t++) {
    try { const r = await fetch(url, HEAD); if (r.ok) return await r.text(); } catch (e) {}
    await espera(2000 * t);
  }
  throw new Error('SIS3 não respondeu: ' + url);
}

// 1) a lista: a busca do site devolve 10 cartões a partir do deslocamento pag_f ("recentes" mantém a ordem estável)
const lista = new Map(); // código -> { u, lanc }
for (let ini = 0; ini < 20000; ini += 10) {
  const html = await pega(`${SITE}/imoveis/busca?pg=venda&pag_f=${ini}&o=recentes&ordem=recentes`);
  const cartoes = html.split('<div class="box-imovel">').slice(1);
  if (!cartoes.length) break;
  for (const c of cartoes) {
    const m = c.match(/href="(https:\/\/www\.sis3imoveis\.com\/imovel\/venda\/[^"]*?-(\d+))"/);
    if (m && !lista.has(m[2])) lista.set(m[2], { u: m[1], lanc: /lan[cç]amento/i.test(texto((c.match(/<div class="labels">([\s\S]*?)<\/div>/) || [])[1])) });
  }
  await espera(200);
}
if (lista.size < 100) throw new Error('Lista de imóveis estranha: ' + lista.size);

// 2) a ficha de cada imóvel
function ficha(html, c, info) {
  const ld = (() => { try { return JSON.parse((html.match(/<script type="application\/ld\+json">\s*(\{[\s\S]*?"@type":\s*"(?!BreadcrumbList)[\s\S]*?\})\s*<\/script>/) || [])[1]); } catch (e) { return {}; } })();
  const det = {}; // "Referência" -> "14690-RL", "Endereço" -> ...
  for (const m of html.matchAll(/<p><b>([^<]+)<\/b>([\s\S]*?)<\/p>/g)) det[texto(m[1])] = texto(m[2]);
  const icone = {}; // dormitorios, suites, banheiros, garagens, area-total, area-privativa, area-terreno, ano-construcao
  for (const m of html.matchAll(/<div class="item"><i class="([a-z-]+)"><\/i><b>([\s\S]*?)<\/b>/g)) icone[m[1]] = texto(m[2]);
  const blocos = html.split('<div class="caracteristicas">').slice(1).map(b => b.slice(0, b.indexOf('</div>\n') > 0 ? b.search(/<\/div>\s*<\/div>/) : 3000));
  const composicao = blocos[0] ? [...blocos[0].matchAll(/<div><b>\d+<\/b>\s*([^<]+)<\/div>/g)].map(m => texto(m[1])) : [];
  const infra = blocos[1] ? [...blocos[1].matchAll(/<div>([^<]+)<\/div>/g)].map(m => texto(m[1])) : [];
  const tipoSite = det['Tipo'] || '';
  const emp = det['Condomínio'] || '';
  const t = tipoCarteira(tipoSite, /condom/i.test(tipoSite));
  const fotos = [...new Set([...html.matchAll(/data-image="(https:\/\/www\.infocenterhost2\.com\.br\/crm\/fotosimovel\/\d+\/[^"]+\.(?:jpe?g|png|webp))"/gi)].map(m => m[1]))];
  // endereço com número, sem o bairro (o cartão já mostra): "Rua Soldado Giovani Dal'Negro, 270". Às vezes a SIS3 põe a
  // unidade depois do número ("Rua Carmelo Rangel, 180 - 602", "…, 831 - 62 - Bloco 3"): ela vira o complemento, copiada como está
  const endCompleto = ld.address && ld.address.streetAddress ? texto(ld.address.streetAddress).replace(/\s+-\s+[^-]+$/, '') : (det['Endereço'] || '');
  const mUnid = endCompleto.match(/^(.*?,\s*\d+[A-Za-z]?)\s+-\s+(.+)$/);
  const rua = mUnid ? mUnid[1] : endCompleto, unidade = mUnid ? mUnid[2].trim() : '';
  const ap = metros(det['Área privativa'] || icone['area-privativa']), atot = metros(det['Área total'] || icone['area-total']), aterr = metros(det['Área terreno'] || icone['area-terreno']);
  const casa = /^(Casa|Sobrado)/.test(t);
  const mob = composicao.concat(infra).some(x => /^mobiliad/i.test(norm(x))) || /\bmobiliad/i.test(det['Mobília'] || '');
  const i = {
    c, t, cat: tipoSite, ti: texto((html.match(/<h1 class="edificio">([\s\S]*?)<\/h1>/) || [])[1]),
    b: det['Bairro'] || '', ci: (det['Município/UF'] || '').replace(/\s*-\s*[A-Z]{2}$/, '').toLowerCase().replace(/(^|\s)(\S)/g, (m, a, b) => a + b.toUpperCase()),
    q: +(icone.dormitorios || ld.numberOfBedrooms || 0) || 0, s: +(icone.suites || 0) || 0, v: +(icone.garagens || 0) || 0,
    a: Math.round(ap || atot), at: Math.round(casa || /^Terreno/.test(t) ? aterr : 0),
    mo: mob ? 's' : 'n', ob: info.lanc ? 'p' : 'r',
    p: reais(det['Valor do imóvel']) || Number(ld.offers && ld.offers.price) || 0,
    f: fotos[0] ? fotos[0].replace(/(\.\w+)$/, '_640$1') : '',
    e: emp && !/^(nao|não)\b/i.test(emp) ? emp : '',
    en: rua, cp: unidade, bl: '', ref: det['Referência'] || '',
    u: info.u, du: ''
  };
  const detalhe = Object.assign({}, i, {
    cond: reais(det['Valor do Condomínio']), iptu: reais(det['IPTU']), bh: +(icone.banheiros || ld.numberOfBathroomsTotal || 0) || 0,
    ap, atot, ac: 0, apa: 0, mob, ano: +(det['Ano de construção'] || icone['ano-construcao'] || 0) || 0,
    itens: rotulos(composicao, ITENS), condItens: rotulos(infra, COND),
    descricao: texto((html.match(/<div class="descricao">([\s\S]*?)<\/div>/) || [])[1]).replace(/^Um pouco mais sobre o imóvel\s*/i, ''),
    fotos
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
      const html = await pega(info.u);
      const { i, detalhe } = ficha(html, c, info);
      if (!i.t) { semTipo[i.cat] = (semTipo[i.cat] || 0) + 1; continue; }
      await writeFile(new URL(c + '.json', DIR), JSON.stringify(detalhe));
      imoveis.push(i);
      if (imoveis.length % 100 === 0) console.log(`… ${imoveis.length} imóveis lidos`);
    } catch (e) { falhas++; }
    await espera(250);
  }
}
await Promise.all([trabalhador(), trabalhador(), trabalhador(), trabalhador()]);

// segurança: se vier muito menos do que da última vez, não sobrescreve o que já está bom
if (imoveis.length < Math.max(50, anterior * 0.8)) throw new Error(`Importação incompleta: ${imoveis.length} (antes ${anterior}), falhas ${falhas}`);
const ativos = new Set(imoveis.map(i => i.c));
for (const f of await readdir(DIR)) if (f.endsWith('.json') && !ativos.has(f.replace('.json', ''))) await unlink(new URL(f, DIR));
imoveis.sort((a, b) => b.p - a.p);
await writeFile(OUT, JSON.stringify({ fonte: 'SIS3 Imóveis (sis3imoveis.com)', atualizadoEm: new Date().toISOString(), total: imoveis.length, imoveis }));
console.log(`Estoque da SIS3: ${imoveis.length} imóveis à venda (${lista.size} na lista do site, ${falhas} falhas).`);
if (Object.keys(semTipo).length) console.log('Tipos sem correspondência na Carteira:', semTipo);
const porTipo = {}; imoveis.forEach(i => { porTipo[i.t] = (porTipo[i.t] || 0) + 1; });
console.log('Por tipo:', porTipo);
