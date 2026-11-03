// Copia os imóveis PRONTOS à venda do site da Casa Prates (casaprates.com.br) para a Carteira, no mesmo formato das outras:
//  - dados/prates.json          resumo de todos os imóveis (para o cruzamento com os clientes)
//  - dados/prates/<codigo>.json detalhes + todas as fotos do anúncio (PDF, capa e descritivo)
// A lista vem da página "Comprar" do site (comprar/?jsf=jet-engine&pagenum=N, 8 por vez; inclui os que são para alugar
// ou vender). Só entra o que tem preço de venda; empreendimentos (lançamentos) ficam de fora — o Matheus só trabalha com
// prontos. O robots.txt só fecha o /wp-admin/. O site mostra a rua com o número; o complemento (unidade) não aparece.
// Roda à mão: node scripts/prates-import.mjs
import { writeFile, readdir, unlink, mkdir, readFile } from 'node:fs/promises';

const SITE = 'https://casaprates.com.br';
const HEAD = { headers: { 'User-Agent': 'Mozilla/5.0 (CarteiraNickel)', 'Accept-Encoding': 'gzip' } };
const OUT = new URL('../dados/prates.json', import.meta.url);
const DIR = new URL('../dados/prates/', import.meta.url);

const espera = ms => new Promise(s => setTimeout(s, ms));
const slug = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const norm = s => slug(s).replace(/-/g, ' ');
const entidades = s => String(s || '').replace(/&#0?39;|&apos;/g, "'").replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n)).replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ')
  .replace(/&([a-z]+);/gi, (m, n) => ({ amp: '&', lt: '<', gt: '>', aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', atilde: 'ã', otilde: 'õ', ccedil: 'ç', acirc: 'â', ecirc: 'ê', ocirc: 'ô', agrave: 'à', ldquo: '“', rdquo: '”', ndash: '–', mdash: '—', sup2: '²', Aacute: 'Á', Eacute: 'É', Ccedil: 'Ç' }[n] ?? m));
const texto = s => entidades(String(s || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, ' ')).replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
const metros = s => { const m = String(s || '').match(/[\d.,]+/); if (!m) return 0; const t = m[0]; return parseFloat(/,\d{1,2}$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t.replace(/\./g, '')) || 0; };
const reais = s => { const n = Number(String(s || '').replace(/,\d{2}\s*$/, '').replace(/\D/g, '')) || 0; return n < 10 ? 0 : n; };

// tipo do site (classe "tipo-…") → tipo da Carteira; sobrado/terreno em condomínio fechado viram "em condomínio" (igual à A. Gonçalves)
function tipoCarteira(tipo, condFechado) {
  const t = norm(tipo), cond = /condominio/.test(t) || condFechado;
  if (/empreendimento|chacara/.test(t)) return '';
  if (/sala|loja|predio|comercial|galpao|barracao|conjunto|ponto|hotel|industrial/.test(t)) return 'Comercial';
  if (/garden/.test(t)) return 'Apartamento garden';
  if (/cobertura/.test(t)) return 'Cobertura';
  if (/apartamento|studio|loft|flat|kitnet|duplex|triplex/.test(t)) return 'Apartamento';
  if (/terreno|lote/.test(t)) return cond ? 'Terreno em condomínio' : 'Terreno';
  if (/sobrado/.test(t)) return cond ? 'Sobrado em condomínio' : 'Sobrado';
  if (/casa|residencia/.test(t)) return /condominio/.test(t) ? 'Casa em condomínio' : 'Casa';
  return '';
}
// características do imóvel e do condomínio (classes "caracteristicas-…" e "infra-…") → os mesmos rótulos da J8
const ITENS = {
  'suite master': 'Suíte master', 'closet': 'Closet', 'escritorio': 'Escritório', 'home theater': 'Home theater', 'lareira': 'Lareira', 'lavabo': 'Lavabo',
  'piso aquecido': 'Piso aquecido', 'ar central': 'Ar central', 'ar condicionado central': 'Ar central', 'aquecimento central': 'Aquecimento central',
  'automacao': 'Automação', 'piscina': 'Piscina', 'piscina aquecida': 'Piscina aquecida', 'churrasqueira': 'Churrasqueira', 'espaco gourmet': 'Espaço gourmet',
  'sauna': 'Sauna', 'adega': 'Adega', 'hidromassagem': 'Hidromassagem', 'jardim': 'Jardim', 'jardim inverno': 'Jardim', 'quintal': 'Quintal', 'terraco': 'Terraço',
  'sacada': 'Sacada', 'sacada com churrasqueira': 'Sacada', 'deck': 'Deck', 'mezanino': 'Mezanino', 'biblioteca': 'Biblioteca', 'living hall': 'Living hall',
  'estar intimo': 'Estar íntimo', 'elevador privativo': 'Elevador privativo', 'edicula': 'Edícula', 'cinema': 'Home theater', 'brinquedoteca': 'Brinquedoteca'
};
const COND = {
  'portaria 24 horas': 'Portaria 24h', 'portaria': 'Portaria 24h', 'vigilancia24 horas': 'Vigilância 24h', 'vigilancia 24 horas': 'Vigilância 24h',
  'salao festas': 'Salão de festas', 'salao de festas': 'Salão de festas', 'academia': 'Academia', 'sala fitness': 'Academia', 'playground': 'Playground',
  'brinquedoteca': 'Brinquedoteca', 'salao jogos': 'Salão de jogos', 'salao de jogos': 'Salão de jogos', 'quadra tenis': 'Quadra de tênis',
  'quadra esportes': 'Quadra poliesportiva', 'quadra poliesportiva': 'Quadra poliesportiva', 'bosque': 'Bosque', 'spa': 'Spa', 'cinema': 'Cinema',
  'piscina': 'Piscina', 'piscina condominio': 'Piscina', 'piscina aquecida': 'Piscina aquecida', 'espaco gourmet': 'Espaço gourmet', 'pet place': 'Pet place',
  'espaco pet': 'Pet place', 'sauna': 'Sauna', 'sauna condominio': 'Sauna', 'coworking': 'Coworking'
};
const rotulos = (lista, mapa) => [...new Set(lista.map(x => { const n = norm(x); return mapa[n] || mapa[n.replace(/s$/, '')] || mapa[n.replace(/s(\s|$)/g, '$1')]; }).filter(Boolean))];

async function pega(url, tentativas = 3) {
  for (let t = 1; t <= tentativas; t++) {
    try { const r = await fetch(url, HEAD); if (r.ok) return await r.text(); } catch (e) {}
    await espera(2000 * t);
  }
  throw new Error('Casa Prates não respondeu: ' + url);
}

// 1) a lista da página "Comprar" (só a grade principal; os destaques e similares da página ficam de fora)
const lista = new Map();
for (let pag = 1; pag < 200; pag++) {
  const html = await pega(`${SITE}/comprar/?jsf=jet-engine&pagenum=${pag}`);
  const grade = html.split('jet-listing-grid--3512')[1] || '';
  const fim = grade.indexOf('jet-listing-grid__loader');
  const links = [...(fim > 0 ? grade.slice(0, fim) : grade).matchAll(/href="(https:\/\/casaprates\.com\.br\/imoveis\/[a-z0-9-]+-(\d+)\/)"/g)];
  const novos = links.filter(m => !lista.has(m[2]));
  if (!novos.length) break;
  novos.forEach(m => lista.set(m[2], m[1]));
  await espera(200);
}
if (lista.size < 100) throw new Error('Lista de imóveis estranha: ' + lista.size);

// 2) a ficha de cada imóvel
function ficha(html, c, u) {
  let ld = [];
  try { ld = JSON.parse((html.match(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/) || [])[1] || '{}')['@graph'] || []; } catch (e) {}
  const anuncio = ld.find(x => x['@type'] === 'RealEstateListing') || {}, prop = ld.find(x => /House|Apartment|Residence|Place|Accommodation|SingleFamily/.test(x['@type']) && x.address) || {};
  const venda = [].concat(anuncio.offers || []).find(o => /venda/i.test(o.name || ''));
  // as classes do anúncio: tipo-…, bairro-…, infra-… (condomínio) e caracteristicas-… (imóvel)
  const cls = ((html.match(/class="([^"]*\bpost-\d+ imoveis type-imoveis[^"]*)"/) || [])[1] || '').split(/\s+/);
  const tipoSite = (cls.find(x => x.startsWith('tipo-')) || '').slice(5).replace(/-/g, ' ');
  const infra = cls.filter(x => x.startsWith('infra-')).map(x => x.slice(6).replace(/-/g, ' '));
  const carac = cls.filter(x => x.startsWith('caracteristicas-')).map(x => x.slice(16).replace(/-/g, ' '));
  const t = tipoCarteira(tipoSite, infra.includes('condominio fechado'));
  // os números do topo: "3 Quartos", "5 Banheiros", "295 m² Totais"… (o primeiro de cada, o resto é dos similares)
  const num = {};
  for (const m of html.matchAll(/<div class="elementor-(?:icon|image)-box-title">\s*(?:<span\s*>)?\s*([^<]*?)\s*(?:<\/span>\s*)?<\/div>\s*<p class="elementor-(?:icon|image)-box-description">\s*([^<]*?)\s*<\/p>/g)) {
    const k = norm(m[2]); if (k && !(k in num)) num[k] = m[1];
  }
  const custo = rot => reais((html.match(new RegExp('>\\+ ' + rot + '\\*?<\\/div>[\\s\\S]{0,900}?jet-listing-dynamic-field__content"\\s*>([^<]+)<')) || [])[1]);
  const fotos = [...new Set([...html.matchAll(/<a href="(https:\/\/casaprates\.com\.br\/wp-content\/uploads\/[^"]+\.(?:jpe?g|png|webp))" class="fancybox"[^>]*data-fancybox="gallerybutton"/gi)].map(m => m[1]))];
  // endereço "Rua X, 123 - Bairro - Curitiba/PR": a 1ª linha logo depois do título
  const endLinha = texto((html.match(/<h1 class="jet-listing-dynamic-field__content"\s*>[\s\S]*?<\/h1>[\s\S]{0,800}?jet-listing-dynamic-field__content"\s*>([^<]+)</) || [])[1]);
  const partes = endLinha.split(/\s+-\s+/);
  const descricao = texto((html.match(/data-widget_type="theme-post-content\.default">([\s\S]*?)<\/div>\s*<\/div>/) || [])[1]);
  // o condomínio: "Conheça o Helbor Double Life Ecoville" ou o começo da descrição ("Helbor Double Life Ecoville | …")
  const conheca = texto((html.match(/e-n-accordion-item-title-text">\s*Conheça (?:o|a)\s+([^<]+?)\s*<\/div>/) || [])[1]);
  const edificio = conheca || (/^[^|\n]{3,60}\s\|/.test(descricao) ? descricao.split('|')[0].trim() : '');
  const ap = metros(num['privativos']) || +((prop.floorSize || {}).value || 0), atot = metros(num['totais']), aterr = metros(num['terreno'] || num['area terreno']);
  const casa = /^(Casa|Sobrado)/.test(t), terreno = /^Terreno/.test(t);
  const mob = carac.some(x => /^(mobiliado|semi mobiliado)/.test(x));
  const i = {
    c, t, cat: tipoSite.replace(/^./, s => s.toUpperCase()), ti: texto((html.match(/<h1 class="jet-listing-dynamic-field__content"\s*>([\s\S]*?)<\/h1>/) || [])[1]).replace(/\s+/g, ' '),
    b: ((prop.containedInPlace || {}).name) || partes[1] || '', ci: ((prop.address || {}).addressLocality) || (partes[2] || '').replace(/\/[A-Z]{2}$/, ''),
    q: +(num['quartos'] || prop.numberOfBedrooms || 0) || 0, s: +(num['suites'] || 0) || 0, v: +(num['vagas'] || 0) || 0,
    a: Math.round(terreno ? (aterr || atot || ap) : (ap || atot)), at: Math.round(casa ? aterr : terreno ? (aterr || atot) : 0),
    mo: mob ? 's' : 'n', ob: 'r', p: venda ? reais(String(venda.price).replace('.', ',')) || +venda.price || 0 : 0,
    f: fotos[0] || (prop.image || [])[0] || '', e: edificio,
    en: partes.length > 1 ? partes[0] : '', cp: '', bl: '', ref: '', u, du: ''
  };
  const detalhe = Object.assign({}, i, {
    cond: custo('Condomínio'), iptu: custo('IPTU'), bh: +(num['banheiros'] || 0) || 0,
    ap, atot, ac: 0, apa: 0, mob, ano: 0,
    itens: rotulos(carac, ITENS), condItens: rotulos(infra, COND), descricao, fotos
  });
  return { i, detalhe };
}

await mkdir(DIR, { recursive: true });
let anterior = 0;
try { anterior = JSON.parse(await readFile(OUT, 'utf8')).total || 0; } catch {}
const imoveis = [], semTipo = {};
let falhas = 0, semVenda = 0;
const fila = [...lista.entries()];
async function trabalhador() {
  while (fila.length) {
    const [c, u] = fila.shift();
    try {
      const { i, detalhe } = ficha(await pega(u), c, u);
      if (!i.p) { semVenda++; continue; }
      if (!i.t) { semTipo[i.cat] = (semTipo[i.cat] || 0) + 1; continue; }
      await writeFile(new URL(c + '.json', DIR), JSON.stringify(detalhe));
      imoveis.push(i);
      if (imoveis.length % 100 === 0) console.log(`… ${imoveis.length} imóveis lidos`);
    } catch (e) { falhas++; }
    await espera(300);
  }
}
await Promise.all([trabalhador(), trabalhador(), trabalhador()]);

if (imoveis.length < Math.max(50, anterior * 0.8)) throw new Error(`Importação incompleta: ${imoveis.length} (antes ${anterior}), falhas ${falhas}`);
const ativos = new Set(imoveis.map(i => i.c));
for (const f of await readdir(DIR)) if (f.endsWith('.json') && !ativos.has(f.replace('.json', ''))) await unlink(new URL(f, DIR));
imoveis.sort((a, b) => b.p - a.p);
await writeFile(OUT, JSON.stringify({ fonte: 'Casa Prates Imóveis (casaprates.com.br, só prontos)', atualizadoEm: new Date().toISOString(), total: imoveis.length, imoveis }));
console.log(`Estoque da Casa Prates: ${imoveis.length} imóveis prontos à venda (${lista.size} na página Comprar, ${semVenda} sem preço de venda, ${falhas} falhas).`);
if (Object.keys(semTipo).length) console.log('Tipos fora da Carteira:', semTipo);
const porTipo = {}; imoveis.forEach(i => { porTipo[i.t] = (porTipo[i.t] || 0) + 1; });
console.log('Por tipo:', porTipo);
