// Copia os imóveis PRONTOS à venda do site da Arya1 (arya1.com.br) para a Carteira, no mesmo formato das outras:
//  - dados/arya.json          resumo de todos os imóveis (para o cruzamento com os clientes)
//  - dados/arya/<codigo>.json detalhes + todas as fotos do anúncio (PDF, capa e descritivo)
// A lista vem da busca do site (imoveis/ajax, 10 por vez); os lançamentos (lanc=1) ficam de fora — o Matheus só trabalha
// com prontos. O robots.txt deles proíbe /public/imob.json, então ele não é usado. A Arya mostra a rua sem o número.
// Roda à mão: node scripts/arya-import.mjs
import { writeFile, readdir, unlink, mkdir, readFile } from 'node:fs/promises';

const SITE = 'https://www.arya1.com.br';
const HEAD = { headers: { 'User-Agent': 'Mozilla/5.0 (CarteiraNickel)', 'Accept-Encoding': 'gzip' } };
const OUT = new URL('../dados/arya.json', import.meta.url);
const DIR = new URL('../dados/arya/', import.meta.url);

const espera = ms => new Promise(s => setTimeout(s, ms));
const slug = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const norm = s => slug(s).replace(/-/g, ' ');
const entidades = s => String(s || '').replace(/&#0?39;|&apos;/g, "'").replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n)).replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ')
  .replace(/&([a-z]+);/gi, (m, n) => ({ amp: '&', lt: '<', gt: '>', aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', atilde: 'ã', otilde: 'õ', ccedil: 'ç', acirc: 'â', ecirc: 'ê', ocirc: 'ô', agrave: 'à', ldquo: '“', rdquo: '”', ndash: '–', mdash: '—', sup2: '²', Aacute: 'Á', Eacute: 'É', Ccedil: 'Ç' }[n] ?? m));
const texto = s => entidades(String(s || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, ' ')).replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
const metros = s => { const m = String(s || '').match(/[\d.,]+/); if (!m) return 0; const t = m[0]; return parseFloat(/,\d{1,2}$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '')) || 0; };
const reais = s => { const n = Number(String(s || '').replace(/,\d{2}\s*$/, '').replace(/\D/g, '')) || 0; return n < 10 ? 0 : n; };
const nomeCidade = s => String(s || '').replace(/\s*-\s*[A-Z]{2}\s*$/, '').toLowerCase().replace(/(^|\s)(\S)/g, (m, a, b) => a + b.toUpperCase()).replace(/\b(De|Da|Do|Dos|Das)\b/g, x => x.toLowerCase());

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
// composição e infraestrutura → os mesmos rótulos da J8 (vão para a capa do book); aceita singular e plural
const ITENS = {
  'suite master': 'Suíte master', 'closet': 'Closet', 'escritorio': 'Escritório', 'home theater': 'Home theater', 'lareira': 'Lareira', 'lavabo': 'Lavabo',
  'piso aquecido': 'Piso aquecido', 'ar central': 'Ar central', 'ar condicionado central': 'Ar central', 'aquecimento central': 'Aquecimento central',
  'automacao': 'Automação', 'piscina': 'Piscina', 'piscina aquecida': 'Piscina aquecida', 'churrasqueira': 'Churrasqueira', 'espaco gourmet': 'Espaço gourmet',
  'sauna': 'Sauna', 'adega': 'Adega', 'hidromassagem': 'Hidromassagem', 'jardim': 'Jardim', 'quintal': 'Quintal', 'terraco': 'Terraço', 'sacada': 'Sacada',
  'deck': 'Deck', 'mezanino': 'Mezanino', 'biblioteca': 'Biblioteca', 'living hall': 'Living hall', 'estar intimo': 'Estar íntimo', 'elevador privativo': 'Elevador privativo',
  'edicula': 'Edícula', 'cinema': 'Home theater', 'brinquedoteca': 'Brinquedoteca'
};
const COND = {
  'portaria 24 horas': 'Portaria 24h', 'portaria 24h': 'Portaria 24h', 'seguranca 24 horas': 'Vigilância 24h', 'salao de festas': 'Salão de festas', 'academia': 'Academia',
  'sala fitness': 'Academia', 'playground': 'Playground', 'brinquedoteca': 'Brinquedoteca', 'salao de jogos': 'Salão de jogos', 'quadra de tenis': 'Quadra de tênis',
  'quadra poliesportiva': 'Quadra poliesportiva', 'bosque': 'Bosque', 'spa': 'Spa', 'cinema': 'Cinema', 'piscina': 'Piscina', 'piscina aquecida': 'Piscina aquecida',
  'espaco gourmet': 'Espaço gourmet', 'pet place': 'Pet place', 'sauna': 'Sauna', 'coworking': 'Coworking'
};
const rotulos = (lista, mapa) => [...new Set(lista.map(x => { const n = norm(x); return mapa[n] || mapa[n.replace(/s$/, '')] || mapa[n.replace(/s(\s|$)/g, '$1')]; }).filter(Boolean))];

async function pega(url, tentativas = 3) {
  for (let t = 1; t <= tentativas; t++) {
    try { const r = await fetch(url, HEAD); if (r.ok) return await r.text(); } catch (e) {}
    await espera(2000 * t);
  }
  throw new Error('Arya não respondeu: ' + url);
}
// a busca em várias ordenações (cada uma sozinha pode perder empates)
async function busca(filtro) {
  const achados = new Map();
  for (const ordem of ['valor_desc', 'valor_asc', 'area_desc']) {
    for (let ini = 0; ini < 20000; ini += 10) {
      const html = await pega(`${SITE}/imoveis/ajax?pg=ven&o=${ordem}${filtro}&pag_f=${ini}`);
      const links = [...html.matchAll(/href="(https:\/\/www\.arya1\.com\.br\/imovel\/ven\/[^"]*?-(\d{5,})(?:-([a-z0-9-]+))?)"/g)];
      if (!links.length) break;
      links.forEach(m => { if (!achados.has(m[2])) achados.set(m[2], { u: m[1], edificio: m[3] || '' }); });
      await espera(150);
    }
  }
  return achados;
}

// 1) todos à venda, menos os lançamentos
const todos = await busca(''), lancamentos = await busca('&lanc=1');
const lista = new Map([...todos].filter(([c]) => !lancamentos.has(c)));
if (lista.size < 100) throw new Error('Lista de imóveis estranha: ' + lista.size);

// 2) a ficha de cada imóvel
function ficha(html, c, info) {
  const det = {}; // "Bairro" -> "Campo Comprido"
  for (const m of html.matchAll(/<td class="tb-tit">([^<]*)<\/td><td class="tb-desc">([\s\S]*?)<\/td>/g)) if (!(texto(m[1]) in det)) det[texto(m[1])] = texto(m[2]);
  const comp = [...((html.match(/<div id="composicao">([\s\S]*?)<\/table>/) || [])[1] || '').matchAll(/<td class="tb-tit">\s*\d+\s*<\/td><td>([^<]+)<\/td>/g)].map(m => texto(m[1]));
  const infra = [...((html.match(/<div id="infraestruturas">([\s\S]*?)<\/div>\s*<\/div>/) || [])[1] || '').matchAll(/<div class="infra">([^<]+)<\/div>/g)].map(m => texto(m[1]));
  const tipoSite = det['Tipo'] || '';
  const t = tipoCarteira(tipoSite);
  const fotos = [...new Set([...html.matchAll(/class="link-foto" data-fancybox="fotos" href="(https:\/\/www\.infocenterhost2\.com\.br\/crm\/fotosimovel\/\d+\/[^"]+\.(?:jpe?g|png|webp))"/gi)].map(m => m[1]))];
  const destaque = ((html.match(/property="og:image" content="([^"]+)"/) || [])[1] || '').replace(/_500(\.\w+)$/, '$1');
  const ap = metros(det['Área útil'] || det['Área privativa']), atot = metros(det['Área total']), aterr = metros(det['Área do terreno']);
  const casa = /^(Casa|Sobrado)/.test(t);
  const mob = /^(sim|mobiliad|semi)/i.test(det['Mobiliado'] || '') || comp.concat(infra).some(x => /^mobiliad/.test(norm(x)));
  const valor = ((html.match(/<div class="valor">[\s\S]*?<\/b>([\s\S]*?)<\/div>/) || [])[1] || '');
  // o link de muitos anúncios termina com o nome do edifício ("…-11033506-helbor-landscape")
  const edificio = info.edificio ? info.edificio.split('-').map(p => p.length > 2 ? p[0].toUpperCase() + p.slice(1) : p).join(' ') : '';
  const i = {
    c, t, cat: tipoSite, ti: texto((html.match(/<h1>([\s\S]*?)<\/h1>/) || [])[1]),
    b: det['Bairro'] || '', ci: nomeCidade(det['Município/UF']),
    q: +(det['Dormitórios'] || 0) || 0, s: +(det['Suítes'] || 0) || 0, v: +(det['Garagens'] || 0) || 0,
    a: Math.round(ap || atot), at: Math.round(casa || /^Terreno/.test(t) ? aterr : 0),
    mo: mob ? 's' : 'n', ob: 'r', p: reais(valor),
    f: destaque || fotos[0] || '', e: edificio,
    en: det['Endereço'] || '', cp: '', bl: '', ref: det['Referência'] || '', u: info.u, du: ''
  };
  const detalhe = Object.assign({}, i, {
    cond: reais(det['Condomínio']), iptu: reais(det['IPTU']), bh: +(det['Banheiros'] || 0) || 0,
    ap, atot, ac: 0, apa: 0, mob, ano: +(det['Ano de construção'] || 0) || 0,
    itens: rotulos(comp, ITENS), condItens: rotulos(infra, COND),
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
    const [c, info] = fila.shift();
    try {
      const { i, detalhe } = ficha(await pega(info.u), c, info);
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
await writeFile(OUT, JSON.stringify({ fonte: 'Arya1 Imóveis (arya1.com.br, só prontos)', atualizadoEm: new Date().toISOString(), total: imoveis.length, imoveis }));
console.log(`Estoque da Arya: ${imoveis.length} imóveis prontos à venda (${todos.size} à venda no site, ${lancamentos.size} lançamentos fora, ${falhas} falhas).`);
if (Object.keys(semTipo).length) console.log('Tipos sem correspondência na Carteira:', semTipo);
const porTipo = {}; imoveis.forEach(i => { porTipo[i.t] = (porTipo[i.t] || 0) + 1; });
console.log('Por tipo:', porTipo);
