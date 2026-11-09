// Copia os imóveis PRONTOS à venda de imobiliárias com site na plataforma Tecimob para a Carteira, no mesmo formato das outras:
//  - dados/<arq>.json          resumo de todos os imóveis (para o cruzamento com os clientes)
//  - dados/<arq>/<codigo>.json detalhes + todas as fotos do anúncio (PDF, capa e descritivo)
// Hoje: Entre Imóveis (entreimoveiscuritiba.com.br) e Urbanic Homes (urbanichomes.com.br), desde 08/11; V6 Imóveis (v6imoveis.com.br), desde 09/11.
// A lista junta o sitemap (que o robots.txt indica) com as páginas "comprar/<tipo>/…" do site, porque o sitemap às vezes
// deixa imóvel de fora; os dados vêm do __NEXT_DATA__ de cada página (props.initialState.property.data). O robots.txt proíbe
// /api/ e os filtros da busca, que não são usados. Endereço e complemento são copiados como estão no cadastro (a Urbanic
// esconde a rua). Só entra o que está à venda e pronto para morar.
// Roda à mão: node scripts/tecimob-import.mjs            (todas)   ou   node scripts/tecimob-import.mjs entre
import { writeFile, readdir, unlink, mkdir, readFile } from 'node:fs/promises';

const SITES = [
  { arq: 'entre', nome: 'Entre Imóveis', site: 'https://entreimoveiscuritiba.com.br' },
  { arq: 'urbanic', nome: 'Urbanic Homes', site: 'https://urbanichomes.com.br' },
  // desde 09/11; os códigos da V6 também têm letras ("AP0040", "LC0425")
  { arq: 'v6', nome: 'V6 Imóveis', site: 'https://v6imoveis.com.br' }
];
const HEAD = { headers: { 'User-Agent': 'Mozilla/5.0 (CarteiraNickel)', 'Accept-Encoding': 'gzip' } };
const espera = ms => new Promise(s => setTimeout(s, ms));
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const reais = s => { const n = Number(String(s || '').replace(/,\d{2}\s*$/, '').replace(/\D/g, '')) || 0; return n < 10 ? 0 : n; };
const metros = s => { const t = String(s || '').trim(); return parseFloat(/,\d{1,2}$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t.replace(/\./g, '')) || 0; };
const entidades = s => String(s || '').replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n)).replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const texto = s => entidades(String(s || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, ' ')).replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();

// tipo da Tecimob (tipo + subtipo: "Apartamento / Cobertura Duplex", "Casa / em Condomínio") → tipo da Carteira
function tipoCarteira(tipo, sub) {
  const t = norm(tipo), s = norm(sub);
  if (/sala|loja|predio|comercial|galpao|barracao|conjunto|ponto|hotel|industrial|andar corporativo/.test(t + ' ' + s)) return 'Comercial';
  if (/chacara|sitio|fazenda|rural/.test(t)) return '';
  if (/cobertura/.test(t + ' ' + s)) return 'Cobertura';
  if (/garden/.test(s)) return 'Apartamento garden';
  if (/apartamento|studio|loft|flat|kitnet/.test(t)) return 'Apartamento';
  if (/terreno|lote/.test(t)) return /condominio/.test(s) ? 'Terreno em condomínio' : 'Terreno';
  if (/sobrado/.test(t + ' ' + s)) return /condominio/.test(s) ? 'Sobrado em condomínio' : 'Sobrado';
  if (/casa/.test(t)) return /condominio/.test(s) ? 'Casa em condomínio' : 'Casa';
  return '';
}
const ITENS = {
  'suite master': 'Suíte master', 'closet': 'Closet', 'escritorio': 'Escritório', 'home theater': 'Home theater', 'lareira': 'Lareira', 'lavabo': 'Lavabo',
  'piso aquecido': 'Piso aquecido', 'ar central': 'Ar central', 'aquecimento central': 'Aquecimento central', 'automacao': 'Automação', 'piscina': 'Piscina',
  'piscina aquecida': 'Piscina aquecida', 'churrasqueira': 'Churrasqueira', 'espaco gourmet': 'Espaço gourmet', 'varanda gourmet': 'Espaço gourmet', 'sauna': 'Sauna',
  'adega': 'Adega', 'hidromassagem': 'Hidromassagem', 'jardim': 'Jardim', 'quintal': 'Quintal', 'terraco': 'Terraço', 'sacada': 'Sacada', 'deck': 'Deck',
  'mezanino': 'Mezanino', 'biblioteca': 'Biblioteca', 'living hall': 'Living hall', 'estar intimo': 'Estar íntimo', 'elevador privativo': 'Elevador privativo', 'edicula': 'Edícula'
};
const COND = {
  'portaria 24h': 'Portaria 24h', 'portaria 24 horas': 'Portaria 24h', 'seguranca 24h': 'Vigilância 24h', 'salao de festas': 'Salão de festas', 'academia': 'Academia',
  'playground': 'Playground', 'brinquedoteca': 'Brinquedoteca', 'salao de jogos': 'Salão de jogos', 'quadra de tenis': 'Quadra de tênis',
  'quadra poliesportiva': 'Quadra poliesportiva', 'bosque': 'Bosque', 'spa': 'Spa', 'cinema': 'Cinema', 'piscina': 'Piscina', 'piscina aquecida': 'Piscina aquecida',
  'espaco gourmet': 'Espaço gourmet', 'pet place': 'Pet place', 'sauna': 'Sauna', 'coworking': 'Coworking'
};
const rotulos = (lista, mapa) => [...new Set(lista.map(x => mapa[norm(x)]).filter(Boolean))];

async function pega(url, tentativas = 3) {
  for (let t = 1; t <= tentativas; t++) {
    try { const r = await fetch(url, HEAD); if (r.ok) return await r.text(); if (r.status === 404 || r.status === 410) return ''; } catch (e) {}
    await espera(2000 * t);
  }
  throw new Error('não respondeu: ' + url);
}
const nextData = html => { const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/); return m ? JSON.parse(m[1]) : null; };

function ficha(html, c, u) {
  const n = nextData(html), P = n && n.props.initialState && n.props.initialState.property, d = P && P.data;
  if (!d || String(d.reference) !== String(c)) return null;
  const tipoSite = [(d.subtype && d.subtype.type && d.subtype.type.title) || '', (d.subtype && d.subtype.title) || ''].join(' / ');
  const t = tipoCarteira(d.subtype && d.subtype.type && d.subtype.type.title, d.subtype && d.subtype.title);
  const areas = d.areas || {}, rooms = Object.values(d.rooms || {});
  const sala = k => +((rooms.find(r => r.name === k) || {}).value || 0) || 0;
  const ap = metros((areas.private_area || {}).value), ac = metros((areas.built_area || areas.primary_area || {}).value), atot = metros((areas.total_area || areas.ground_total_area || {}).value);
  const casa = /^(Casa|Sobrado)/.test(t), terreno = /^Terreno/.test(t);
  // fotos do anúncio, na ordem, só as originais (as miniaturas ficam em pastas de tamanho, "600x450/outside/…")
  const fotos = [...new Set(JSON.stringify(P).match(new RegExp(`https://imagens\\.tecimob\\.com\\.br/media/[^"]+/properties/${d.id}/images/[^/"]+\\.(?:jpe?g|png|webp)`, 'gi')) || [])];
  const end = d.address || {};
  const en = [end.street, end.street_number].filter(Boolean).join(', ');
  // "Água Verde - Curitiba/PR"; sem bairro vem só "Itapema/SC" (aí o bairro fica vazio e o anúncio não cruza com ninguém)
  const fmt = String(end.formatted || ''), temBairro = fmt.includes(' - ');
  const bairro = temBairro ? fmt.split(' - ')[0].trim() : '', cidadeSite = (temBairro ? fmt.split(' - ')[1] : fmt).replace(/\/[A-Z]{2}$/, '').trim();
  const carac = (d.characteristics || []).map(x => x.title), condC = (d.condo_characteristics || []).map(x => x.title);
  const extras = []; if (sala('closet')) extras.push('Closet'); if (sala('office')) extras.push('Escritório'); if (sala('lavabo') || sala('toilet')) extras.push('Lavabo');
  const i = {
    c: String(c), t, cat: tipoSite, ti: texto(d.title_formatted || d.meta_title || ''),
    b: bairro, ci: cidadeSite,
    q: sala('bedroom'), s: sala('suite'), v: sala('garage'),
    a: Math.round(terreno ? (atot || ap || ac) : (ap || ac || atot)), at: Math.round(casa || terreno ? atot : 0),
    mo: /semi/i.test(d.furniture || '') ? 'm' : /mobiliad/i.test(d.furniture || '') ? 's' : '', ob: 'r', p: reais(d.price),
    f: fotos[0] || '', e: String((d.condominium && (d.condominium.title || d.condominium.name)) || '').trim(),
    en, cp: String(end.complement || '').trim(), bl: '', ref: '', u, du: String(d.updated_at_timestamp || '')
  };
  const detalhe = Object.assign({}, i, {
    cond: reais(d.condominium_price), iptu: reais(d.territorial_tax_price || d.taxes_price), bh: sala('bathroom'),
    ap, atot, ac, apa: +((d.informations || {}).units_per_floor || 0) || 0, mob: i.mo === 's', ano: 0,
    itens: rotulos(carac, ITENS).concat(extras.filter(x => !rotulos(carac, ITENS).includes(x))), condItens: rotulos(condC, COND),
    descricao: texto(d.description), fotos
  });
  // preço digitado errado no cadastro (Entre 118: "R$635.000.000" num apartamento de 75 m²): fica "sob consulta"
  if (i.p && i.a && i.p / i.a > 200000) { console.log(`  ${c}: preço ${d.price} para ${i.a} m² parece erro de digitação; fica sob consulta`); i.p = detalhe.p = 0; }
  // "Em construção" e lançamento ficam de fora; terreno "Pronto para construir" entra (09/11: antes saía junto, por causa do "constru")
  const fora = d.transaction !== 'VENDA' ? 'nv' : /constru[cç][aã]o|planta|lan[cç]amento/i.test(d.situation || '') ? 'lan' : '';
  return { i, detalhe, fora, cidade: i.ci };
}

async function importa(S) {
  const OUT = new URL(`../dados/${S.arq}.json`, import.meta.url), DIR = new URL(`../dados/${S.arq}/`, import.meta.url);
  // 1) a lista: sitemap + páginas "comprar" (com as páginas seguintes, até não aparecer imóvel novo)
  const lista = new Map();
  const sm = await pega(`${S.site}/sitemap.xml`);
  const locs = [...sm.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map(m => m[1]);
  // o código é a última parte do link: número, número com sufixo ("132-GT") ou letras e número ("AP0040", na V6)
  const pegaLinks = html => [...html.matchAll(/\/imovel\/[a-z0-9-]+\/([A-Za-z0-9]+(?:-[A-Za-z0-9]+)?)(?=["'?#\s\\])/g)].forEach(m => { if (!lista.has(m[1])) lista.set(m[1], S.site + m[0]); });
  locs.filter(u => /\/imovel\//.test(u)).forEach(u => { const m = u.match(/\/([A-Za-z0-9]+(?:-[A-Za-z0-9]+)?)\/?$/); if (m) lista.set(m[1], u.replace(/\/$/, '')); });
  for (const cat of locs.filter(u => /\/comprar\//.test(u))) {
    for (let pg = 1; pg < 50; pg++) {
      const antes = lista.size, html = await pega(pg === 1 ? cat : `${cat}?page=${pg}`);
      if (!html) break;
      pegaLinks(html); await espera(300);
      if (lista.size === antes && pg > 1) break;
      const n = nextData(html), s = n ? JSON.stringify(n) : '', tot = +((s.match(/"total":\s*(\d+)/) || [])[1] || 0);
      if (!tot || [...lista.keys()].length >= tot && pg >= Math.ceil(tot / 12)) break;
    }
  }
  await mkdir(DIR, { recursive: true });
  let anterior = 0; try { anterior = JSON.parse(await readFile(OUT, 'utf8')).total || 0; } catch {}
  // 2) a ficha de cada imóvel (2 por vez, com pausa: os sites são pequenos)
  const imoveis = [], semTipo = {}, cont = { fora: 0, lan: 0, falhas: 0 };
  const fila = [...lista.entries()];
  const trabalhador = async () => {
    while (fila.length) {
      const [c, u] = fila.shift();
      try {
        const r = ficha(await pega(u), c, u);
        if (!r || r.fora === 'nv') { cont.fora++; continue; } // sem preço entra como "sob consulta", igual à J8
        if (r.fora === 'lan') { cont.lan++; continue; }
        if (!r.i.t) { semTipo[r.i.cat] = (semTipo[r.i.cat] || 0) + 1; continue; }
        await writeFile(new URL(c + '.json', DIR), JSON.stringify(r.detalhe));
        imoveis.push(r.i);
      } catch (e) { cont.falhas++; }
      await espera(400);
    }
  };
  await Promise.all([trabalhador(), trabalhador()]);
  if (imoveis.length < Math.max(3, anterior * 0.7)) throw new Error(`${S.nome}: importação incompleta, ${imoveis.length} (antes ${anterior}), falhas ${cont.falhas}`);
  const ativos = new Set(imoveis.map(i => i.c));
  for (const f of await readdir(DIR)) if (f.endsWith('.json') && !ativos.has(f.replace('.json', ''))) await unlink(new URL(f, DIR));
  imoveis.sort((a, b) => b.p - a.p);
  await writeFile(OUT, JSON.stringify({ fonte: `${S.nome} (${new URL(S.site).hostname}, só prontos)`, atualizadoEm: new Date().toISOString(), total: imoveis.length, imoveis }));
  const porTipo = {}; imoveis.forEach(i => { porTipo[i.t] = (porTipo[i.t] || 0) + 1; });
  console.log(`Estoque da ${S.nome}: ${imoveis.length} imóveis prontos à venda (${lista.size} no site, ${cont.fora} fora de venda, ${cont.lan} em obra/lançamento, ${cont.falhas} falhas).`, porTipo,
    `| endereço ${imoveis.filter(i => i.en).length} · complemento ${imoveis.filter(i => i.cp).length}`, Object.keys(semTipo).length ? '| tipos fora: ' + JSON.stringify(semTipo) : '');
}
const so = process.argv[2];
for (const S of SITES.filter(s => !so || s.arq === so)) await importa(S);
