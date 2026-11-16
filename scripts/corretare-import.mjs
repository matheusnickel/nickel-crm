// Copia os imóveis PRONTOS à venda do site da Corretare (corretare.com.br) para a Carteira, no mesmo formato das outras:
//  - dados/corretare.json          resumo de todos os imóveis (para o cruzamento com os clientes)
//  - dados/corretare/<codigo>.json detalhes + todas as fotos do anúncio (PDF, capa e descritivo)
// 16/11, pedido do Matheus. robots.txt: "Allow: /" para todos e aponta o sitemap. A lista vem do sitemap (/sitemap):
// só os /imovel/venda/ — os /imovel/lancamento/ ficam de fora (ele só trabalha com prontos). Mesma plataforma de fotos da
// Arya (infocenterhost2) e a mesma ficha em tabela (td.tb-tit / td.tb-desc). Código = número interno do anúncio (o fim do
// link canônico, também a pasta das fotos). Mostra a rua quase sempre sem número; sem complemento.
// Roda à mão: node scripts/corretare-import.mjs
import { writeFile, readdir, unlink, mkdir, readFile } from 'node:fs/promises';

const SITE = 'https://www.corretare.com.br';
const HEAD = { headers: { 'User-Agent': 'Mozilla/5.0 (CarteiraNickel)', 'Accept-Encoding': 'gzip' } };
const OUT = new URL('../dados/corretare.json', import.meta.url);
const DIR = new URL('../dados/corretare/', import.meta.url);

const espera = ms => new Promise(s => setTimeout(s, ms));
const slug = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const norm = s => slug(s).replace(/-/g, ' ');
const entidades = s => String(s || '').replace(/&#0?39;|&apos;/g, "'").replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n)).replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ')
  .replace(/&([a-z]+);/gi, (m, n) => ({ amp: '&', lt: '<', gt: '>', aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', atilde: 'ã', otilde: 'õ', ccedil: 'ç', acirc: 'â', ecirc: 'ê', ocirc: 'ô', agrave: 'à', ldquo: '“', rdquo: '”', ndash: '–', mdash: '—', sup2: '²', Aacute: 'Á', Eacute: 'É', Ccedil: 'Ç' }[n] ?? m));
const texto = s => entidades(String(s || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, ' ')).replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
const metros = s => { const m = String(s || '').match(/[\d.,]+/); if (!m) return 0; const t = m[0]; return parseFloat(/,\d{1,2}$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '')) || 0; };
const reais = s => { const n = Number(String(s || '').replace(/,\d{2}\s*$/, '').replace(/\D/g, '')) || 0; return n < 10 ? 0 : n; };
const nomeProprio = s => String(s || '').toLowerCase().replace(/(^|\s)(\S)/g, (m, a, b) => a + b.toUpperCase()).replace(/\b(De|Da|Do|Dos|Das|E)\b/g, x => x.toLowerCase());

// "SOBRADO EM CONDOMÍNIO", "APARTAMENTO GARDEN", "CHÁCARA / FAZENDA"… → tipos da Carteira (chácara/sítio ficam de fora)
function tipoCarteira(tipo, condFechado) {
  const t = norm(tipo), cond = /condominio/.test(t) || condFechado;
  if (/chacara|fazenda|sitio|haras/.test(t)) return '';
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
  'sauna': 'Sauna', 'adega': 'Adega', 'hidromassagem': 'Hidromassagem', 'hidro': 'Hidromassagem', 'jardim': 'Jardim', 'quintal': 'Quintal', 'terraco': 'Terraço', 'sacada': 'Sacada',
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
  throw new Error('Corretare não respondeu: ' + url);
}

// 1) a lista: o sitemap, só os anúncios à venda (lançamentos fora)
const mapa = await pega(`${SITE}/sitemap`);
const urls = [...new Set([...mapa.matchAll(/<loc>(https:\/\/www\.corretare\.com\.br\/imovel\/venda\/[^<]+)<\/loc>/g)].map(m => m[1].trim()))];
if (urls.length < 100) throw new Error('Lista de imóveis estranha: ' + urls.length);

// 2) a ficha de cada imóvel
function ficha(html, u) {
  const det = {}; // "Bairro" -> "Cabral"
  for (const m of html.matchAll(/<td class="tb-tit">([^<]*)<\/td>\s*<td class="tb-desc">([\s\S]*?)<\/td>/g)) { const k = texto(m[1]); if (k && !(k in det)) det[k] = texto(m[2]); }
  const comp = [...((html.match(/<div class="composicoes">([\s\S]*?)<\/table>/) || [])[1] || '').matchAll(/<td class="tb_tit">[^<]*<\/td>\s*<td>([^<]+)<\/td>/g)].map(m => texto(m[1]));
  const infra = [...((html.match(/<div class="infraestruturas">([\s\S]*?)<\/div>\s*<\/div>/) || [])[1] || '').matchAll(/<div class="infra">([^<]+)<\/div>/g)].map(m => texto(m[1]));
  const canon = (html.match(/rel="canonical" href="([^"]+)"/) || [])[1] || u;
  // fotos: todas as da pasta deste anúncio (a galeria completa fica no topo da página; outras pastas são de outros imóveis)
  const todas = [...html.matchAll(/https:\/\/www\.infocenterhost2\.com\.br\/crm\/fotosimovel\/(\d+)\/[^"')\s]+?\.(?:jpe?g|png|webp)/gi)].filter(m => !/_\d{3}\.\w+$/.test(m[0]));
  // código: o número no fim do link canônico; sem ele (link com nome livre), a pasta das fotos
  const c = (canon.match(/-(\d{5,})$/) || [])[1] || (todas[0] || [])[1] || '';
  const fotos = [...new Set(todas.filter(m => m[1] === c).map(m => m[0]))];
  const h1 = texto((html.match(/<h1>([\s\S]*?)<\/h1>/) || [])[1]);
  // "SOBRADO EM CONDOMÍNIO em CURITIBA - PR…": o tipo vem em maiúsculas e a cidade depois do " em " minúsculo
  const tipoSite = (h1.match(/^(.*?)\s+em\s+[A-ZÀ-Ú]/) || [])[1] || '';
  const t = tipoCarteira(tipoSite, /^sim/i.test(det['Condomínio Fechado'] || ''));
  const ap = metros(det['Área privativa'] || det['Área útil']), atot = metros(det['Área total']), aterr = metros(det['Área do terreno'] || det['Área terreno']);
  const casa = /^(Casa|Sobrado)/.test(t), terreno = /^Terreno/.test(t);
  const mob = /^(sim|mobiliad|semi)/i.test(det['Mobiliado'] || '') || comp.concat(infra).some(x => /^mobiliad/.test(norm(x)));
  const i = {
    c, t, cat: nomeProprio(tipoSite), ti: h1,
    b: det['Bairro'] || '', ci: nomeProprio(det['Município'] || ''),
    q: +(det['Dormitórios'] || 0) || 0, s: +(det['Suítes'] || 0) || 0, v: +(det['Vagas de Garagens'] || det['Garagens'] || 0) || 0,
    a: Math.round(terreno ? (aterr || atot || ap) : (ap || atot)), at: Math.round(casa || terreno ? (aterr || (terreno ? atot : 0)) : 0),
    aq: Math.round(terreno ? (aterr || atot) : ap), // área da conta: privativa/construída; terreno = terreno; nunca a total
    mo: mob ? 's' : 'n', ob: 'r', p: reais(det['Valor total'] || det['Valor']),
    f: fotos[0] || '', e: det['Edificio'] || det['Edifício'] || '',
    en: det['Endereço'] || '', cp: '', bl: '', ref: det['Referência'] || '', u: canon, du: ''
  };
  const detalhe = Object.assign({}, i, {
    cond: reais(det['Condomínio']), iptu: reais(det['Iptu'] || det['IPTU']), bh: +(det['Banheiros'] || 0) || 0,
    ap, atot, ac: casa ? ap : 0, apa: 0, mob, ano: +(det['Ano de construção'] || 0) || 0,
    itens: rotulos(comp, ITENS), condItens: rotulos(infra, COND),
    descricao: texto((html.match(/<div class="descricao">([\s\S]*?)<\/div>/) || [])[1]), fotos
  });
  return { i, detalhe };
}

await mkdir(DIR, { recursive: true });
let anterior = 0;
try { anterior = JSON.parse(await readFile(OUT, 'utf8')).total || 0; } catch {}
const imoveis = [], semTipo = {}, vistos = new Set();
let falhas = 0;
const fila = urls.slice();
async function trabalhador() {
  while (fila.length) {
    const u = fila.shift();
    try {
      const { i, detalhe } = ficha(await pega(u), u);
      if (!i.c || vistos.has(i.c)) continue;
      vistos.add(i.c);
      if (!i.t) { semTipo[i.cat || '?'] = (semTipo[i.cat || '?'] || 0) + 1; continue; }
      await writeFile(new URL(i.c + '.json', DIR), JSON.stringify(detalhe));
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
await writeFile(OUT, JSON.stringify({ fonte: 'Corretare Imóveis (corretare.com.br, só prontos)', atualizadoEm: new Date().toISOString(), total: imoveis.length, imoveis }));
console.log(`Estoque da Corretare: ${imoveis.length} imóveis prontos à venda (${urls.length} anúncios à venda no sitemap, ${falhas} falhas).`);
if (Object.keys(semTipo).length) console.log('Tipos fora da Carteira:', semTipo);
const porTipo = {}; imoveis.forEach(i => { porTipo[i.t] = (porTipo[i.t] || 0) + 1; });
console.log('Por tipo:', porTipo, '| com endereço', imoveis.filter(i => i.en).length, '| com área da conta', imoveis.filter(i => i.aq > 0).length);
