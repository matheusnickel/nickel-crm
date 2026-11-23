// Copia os imóveis PRONTOS à venda da NN Assessoria Imobiliária (nnassessoriaimobiliaria.com.br) para a Carteira, no mesmo
// formato das outras:
//  - dados/nn.json          resumo de todos os imóveis (para o cruzamento com os clientes)
//  - dados/nn/<codigo>.json detalhes + todas as fotos do anúncio (PDF, capa e descritivo)
// 23/11, pedido do Matheus. Site da Loft com o cadastro no Vista (a mesma plataforma da antiga Baltazzar). robots.txt:
// Allow / e proíbe /busca/, que não é usado: a lista vem do sitemap (sitemaps/imoveis-N.xml) e os dados da própria página.
// Só prontos: as unidades de construtora (título "..." ou seção "Descrição empreendimento") e os anúncios que falam em
// lançamento, obra ou entrega futura ficam de fora. Aluguel e imóvel fora do Paraná também.
// Mostra rua e número; não publica complemento nem o nome do empreendimento num campo. As fotos ficam numa pasta com número
// diferente do código: valem só as que vêm ANTES dos dados do anúncio (as de depois são dos "imóveis semelhantes").
// Área: só a "Área Privativa" da ficha (casa: é a construída). "Área Total" nunca entra na conta (na casa às vezes é o
// terreno, às vezes não: não dá para saber). Terreno usa a área total. Roda à mão: node scripts/nn-import.mjs
import { writeFile, readdir, unlink, mkdir, readFile } from 'node:fs/promises';

const SITE = 'https://nnassessoriaimobiliaria.com.br';
const HEAD = { headers: { 'User-Agent': 'Mozilla/5.0 (CarteiraNickel)', 'Accept-Encoding': 'gzip' } };
const OUT = new URL('../dados/nn.json', import.meta.url);
const DIR = new URL('../dados/nn/', import.meta.url);
const espera = ms => new Promise(s => setTimeout(s, ms));
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function tipoCarteira(cat, cond) {
  const t = norm(cat);
  if (/sala|loja|predio|comercial|galpao|barracao|conjunto|ponto|hotel|industrial/.test(t)) return 'Comercial';
  if (/chacara|sitio|fazenda|rural|empreendimento/.test(t)) return '';
  if (/cobertura/.test(t)) return 'Cobertura';
  if (/garden/.test(t)) return 'Apartamento garden';
  if (/apartamento|studio|loft|flat|kitnet|duplex|triplex/.test(t)) return 'Apartamento';
  if (/terreno|lote/.test(t)) return /condominio/.test(t) || cond ? 'Terreno em condomínio' : 'Terreno';
  if (/sobrado/.test(t)) return /condominio/.test(t) || cond ? 'Sobrado em condomínio' : 'Sobrado';
  if (/casa/.test(t)) return /condominio/.test(t) || cond ? 'Casa em condomínio' : 'Casa';
  return '';
}
// as características da ficha → os mesmos rótulos das outras imobiliárias
const ITENS = {
  'suite master': 'Suíte master', 'closet': 'Closet', 'escritorio': 'Escritório', 'home theater': 'Home theater', 'lareira': 'Lareira', 'lavabo': 'Lavabo',
  'piso aquecido': 'Piso aquecido', 'ar central': 'Ar central', 'aquecimento central': 'Aquecimento central', 'aquecimento solar': 'Aquecimento solar', 'automacao': 'Automação',
  'piscina': 'Piscina', 'piscina privativa': 'Piscina', 'piscina aquecida': 'Piscina aquecida', 'churrasqueira': 'Churrasqueira', 'espaco gourmet': 'Espaço gourmet', 'sauna': 'Sauna',
  'adega': 'Adega', 'hidromassagem': 'Hidromassagem', 'jardim': 'Jardim', 'quintal': 'Quintal', 'terraco': 'Terraço', 'sacada': 'Sacada', 'deck': 'Deck', 'mezanino': 'Mezanino',
  'biblioteca': 'Biblioteca', 'living hall': 'Living hall', 'estar intimo': 'Estar íntimo', 'edicula': 'Edícula', 'area de servico': 'Área de serviço', 'despensa': 'Despensa',
  'sala de jantar': 'Sala de jantar', 'sala de estar': 'Sala de estar', 'cozinha planejada': 'Cozinha planejada', 'varanda gourmet': 'Varanda gourmet'
};
const COND = {
  'portaria 24h': 'Portaria 24h', 'portaria 24 horas': 'Portaria 24h', 'vigilancia 24h': 'Vigilância 24h', 'vigilancia 24 horas': 'Vigilância 24h', 'salao de festas': 'Salão de festas',
  'academia': 'Academia', 'sala fitness': 'Academia', 'playground': 'Playground', 'brinquedoteca': 'Brinquedoteca', 'salao de jogos': 'Salão de jogos', 'quadra de tenis': 'Quadra de tênis',
  'quadra poliesportiva': 'Quadra poliesportiva', 'quadra de esportes': 'Quadra poliesportiva', 'bosque': 'Bosque', 'spa': 'Spa', 'cinema': 'Cinema', 'piscina': 'Piscina',
  'piscina coletiva': 'Piscina', 'piscina aquecida': 'Piscina aquecida', 'espaco gourmet': 'Espaço gourmet', 'pet place': 'Pet place', 'sauna': 'Sauna', 'coworking': 'Coworking',
  'guarita': 'Guarita', 'elevador': 'Elevador', 'bicicletario': 'Bicicletário', 'gerador': 'Gerador'
};
const rotulos = (lista, mapa) => [...new Set(lista.map(x => mapa[norm(x)]).filter(Boolean))];
const OBRA = /lan[çc]amento|em constru[çc][ãa]o|na planta|previs[ãa]o de entrega|entrega (prevista|para 20|em 20)|em obras|obras? em andamento/i;

async function pega(url, tentativas = 3) {
  for (let t = 1; t <= tentativas; t++) {
    try { const r = await fetch(url, HEAD); if (r.ok) return await r.text(); if (r.status === 404 || r.status === 410) return ''; } catch (e) {}
    await espera(2000 * t);
  }
  throw new Error('NN não respondeu: ' + url);
}
// o conteúdo que o Next.js manda junto com a página (self.__next_f.push([1,"…"]))
const payload = html => [...html.matchAll(/self\.__next_f\.push\(\[1,("[\s\S]*?")\]\)/g)].map(m => { try { return JSON.parse(m[1]); } catch (e) { return ''; } }).join('');
const texto = s => { try { return JSON.parse('"' + s + '"'); } catch (e) { return s; } };
// os itens de uma lista da ficha ("Infraestrutura", "Mais informações"): os que vêm ali e os que vêm por referência ("$L5b")
function listaDe(p, titulo) {
  const i = p.indexOf(`"children":"${titulo}"`); if (i < 0) return [];
  const f = p.indexOf('"h4"', i), linha = p.indexOf('\n', i);
  const seg = p.slice(i, Math.min(f < 0 ? Infinity : f, linha < 0 ? Infinity : linha, i + 30000));
  const refs = [...seg.matchAll(/"\$L([0-9a-f]+)"/g)].map(m => (p.match(new RegExp(`(?:^|\\n)${m[1]}:(\\[.*)`)) || [])[1] || '');
  return [seg, ...refs].flatMap(x => [...x.matchAll(/\["\$","div","([^"]{2,60})",\{"className":"flex flex-row items-center gap-2/g)].map(m => m[1]));
}

function ficha(html, c, u) {
  const p = payload(html); if (!p) return null;
  const m = p.match(/"titulo":"((?:[^"\\]|\\.)*)","status":"([^"]*)","categoria":"([^"]*)","codigo":"([^"]*)","endereco":"([^"]*)","valorVenda":"([^"]*)","valorLocacao":"([^"]*)"/);
  if (!m) return null;
  if (m[4] !== c) throw new Error('código diferente: ' + m[4]);
  const titulo = texto(m[1]).trim(), preco = Math.round(+m[6] || 0);
  const attr = k => (p.match(new RegExp(`"data-${k}":"([^"]*)"`)) || [])[1] || '';
  const num = k => +((p.match(new RegExp(`"children":\\["?(\\d+)"?,"\\s?${k}`)) || [])[1] || 0);
  const barra = Object.fromEntries([...p.matchAll(/"className":"text-sm","children":\["([^"]+)",\["\$","b",null,\{"children":\[([\d.]+)/g)].map(x => [x[1].trim(), +x[2]]));
  const kd = p.indexOf('"children":"Descrição"');
  const descricao = kd > 0 ? texto((p.slice(kd, kd + 12000).match(/"whiteSpace":"pre-line"\},"children":"((?:[^"\\]|\\.)*)"/) || [])[1] || '').replace(/\r/g, '').trim() : '';
  const partes = m[5].split(',').map(s => s.trim()), cid = partes.pop() || '', bairro = partes.pop() || attr('neighborhood');
  const uf = (cid.match(/-\s*([A-Z]{2})$/) || [])[1] || '';

  // fora: aluguel, sem preço, outro estado, construtora (empreendimento) e o que ainda está em obra
  const fora = !/venda/i.test(m[2]) || preco < 1000 ? 'sem venda' : uf && uf !== 'PR' ? 'outro estado'
    : !titulo || /^\.+$/.test(titulo) || p.includes('Descrição empreendimento') ? 'construtora' : OBRA.test(titulo + ' ' + descricao) ? 'lançamento' : '';
  if (fora) return { fora };

  const infra = listaDe(p, 'Infraestrutura'), info = listaDe(p, 'Mais informações');
  const t = tipoCarteira(m[3], infra.some(x => /condom[ií]nio fechado/i.test(x)) || /em condom[ií]nio/i.test(titulo));
  const casa = /^(Casa|Sobrado)/.test(t), terreno = /^Terreno/.test(t);
  // a ficha arredonda; o link traz com casas decimais e é a mesma medida (conferido nos 89 anúncios que têm as duas)
  const doLink = +((u.match(/-(\d+(?:\.\d+)?)m2-/) || [])[1] || 0), total = barra['Área Total'] || +attr('area') || 0;
  const priv = barra['Área Privativa'] ? (Math.abs(doLink - barra['Área Privativa']) < 1.1 ? doLink : barra['Área Privativa']) : 0;
  const area = terreno ? (total || priv) : priv;
  const antes = p.slice(0, m.index); // a galeria do anúncio vem antes dos dados; depois são os imóveis semelhantes
  const fotos = [...new Set(antes.match(/https:\/\/cdn\.vistahost\.com\.br\/[^"\\\s]+?\/fotos\/[^"\\\s]+?\.(?:jpe?g|png|webp)/gi) || [])].filter(f => !/_p\.\w+$/.test(f));
  const tudo = info, mob = tudo.some(x => /^mobiliad/i.test(x)), semi = tudo.some(x => /^semi[ -]?mobiliad/i.test(x));
  const i = {
    c, t, cat: m[3], ti: titulo, b: bairro, ci: cid.replace(/\s*-\s*[A-Z]{2}$/, '') || 'Curitiba',
    q: +attr('bedrooms') || num('Dormitório'), s: num('Suíte'), v: num('Vaga'), a: Math.round(area), at: terreno ? Math.round(area) : 0, aq: Math.round(area),
    mo: mob ? 's' : semi ? 'm' : 'n', ob: 'r', p: preco, f: fotos[0] || attr('image'), e: '', en: partes.filter((x, k) => x && !(k < partes.length - 1 && /^n[º°o.]*\s*\d+$/i.test(x))).join(', '), // sem pedaço vazio nem "Nº 29, 29"
    cp: '', bl: '', ref: '', u, du: ''
  };
  const detalhe = Object.assign({}, i, {
    cond: Math.round(+attr('condo') || 0), iptu: Math.round(+((p.match(/"valorIptu":"([\d.]+)"/) || [])[1] || 0)), bh: +attr('bathrooms') || num('Banheiro'),
    ap: casa || terreno ? 0 : priv, ac: casa ? priv : 0, atot: casa || terreno ? 0 : total, apa: 0, mob, ano: 0,
    itens: rotulos(tudo, ITENS), condItens: rotulos(infra, COND), descricao, fotos
  });
  return { i, detalhe, fora: '' };
}

// 1) a lista pelo sitemap (código = o último pedaço do link: número ou letras e número, "AP0461")
const idx = await pega(SITE + '/sitemap.xml');
const mapas = [...idx.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map(m => m[1]).filter(u => /imoveis-\d+\.xml/.test(u));
const lista = new Map();
for (const m of mapas) for (const x of (await pega(m)).matchAll(/<loc>\s*(https:\/\/nnassessoriaimobiliaria\.com\.br\/imovel\/[^<\s]+-([A-Za-z]{0,3}\d+))\s*<\/loc>/g)) lista.set(x[2], x[1]);
if (lista.size < 80) throw new Error('Lista de imóveis estranha: ' + lista.size);

// 2) a ficha de cada um
await mkdir(DIR, { recursive: true });
let anterior = 0; try { anterior = JSON.parse(await readFile(OUT, 'utf8')).total || 0; } catch {}
const imoveis = [], semTipo = {}, fora = {}; let falhas = 0;
const fila = [...lista];
async function trabalhador() {
  while (fila.length) {
    const [c, u] = fila.shift();
    try {
      // a página às vezes vem pela metade (sem os dados do anúncio): tenta de novo, para o imóvel não sumir e voltar "novo"
      let r = null;
      for (let t = 1; t <= 4 && !r; t++) { const html = await pega(u); if (!html) break; r = ficha(html, c, u); if (!r) await espera(2500 * t); }
      if (!r) { fora['sem dados'] = (fora['sem dados'] || 0) + 1; continue; }
      if (r.fora) { fora[r.fora] = (fora[r.fora] || 0) + 1; continue; }
      if (!r.i.t) { semTipo[r.i.cat] = (semTipo[r.i.cat] || 0) + 1; continue; }
      await writeFile(new URL(c + '.json', DIR), JSON.stringify(r.detalhe));
      imoveis.push(r.i);
    } catch (e) { falhas++; }
    await espera(350);
  }
}
await Promise.all([trabalhador(), trabalhador(), trabalhador()]);
if (imoveis.length < Math.max(40, anterior * 0.8)) throw new Error(`Importação incompleta: ${imoveis.length} (antes ${anterior}), falhas ${falhas}`);
const ativos = new Set(imoveis.map(i => i.c));
for (const f of await readdir(DIR)) if (f.endsWith('.json') && !ativos.has(f.replace('.json', ''))) await unlink(new URL(f, DIR));
imoveis.sort((a, b) => b.p - a.p);
await writeFile(OUT, JSON.stringify({ fonte: 'NN Assessoria Imobiliária (nnassessoriaimobiliaria.com.br, só prontos)', atualizadoEm: new Date().toISOString(), total: imoveis.length, imoveis }));
const porTipo = {}; imoveis.forEach(i => { porTipo[i.t] = (porTipo[i.t] || 0) + 1; });
console.log(`Estoque da NN: ${imoveis.length} imóveis prontos à venda (${lista.size} no site, ${falhas} falhas). Fora:`, fora, Object.keys(semTipo).length ? '| tipos fora: ' + JSON.stringify(semTipo) : '');
console.log('Por tipo:', porTipo, '| com rua', imoveis.filter(i => i.en).length, '| com área da conta', imoveis.filter(i => i.aq > 0).length, '| sem foto', imoveis.filter(i => !i.f).length);
