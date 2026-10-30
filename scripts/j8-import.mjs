// Copia o estoque À VENDA do site da J8 (jota8) para a Carteira:
//  - dados/j8.json          resumo de todos os imóveis (para o cruzamento com os clientes)
//  - dados/j8/<codigo>.json detalhes + todas as fotos do anúncio (para o book)
// Os detalhes só são baixados de novo quando o imóvel muda (DataAtualizacao).
// Roda 1x por dia pelo GitHub Actions (.github/workflows/j8.yml) ou à mão: node scripts/j8-import.mjs
import { writeFile, readFile, readdir, unlink, mkdir } from 'node:fs/promises';

const API = 'https://j8-busca-imoveis.gustavo-05e.workers.dev/v1/imoveis/';
const HEAD = { headers: { 'User-Agent': 'Mozilla/5.0 (CarteiraNickel)', Origin: 'https://www.j8.com.br', Referer: 'https://www.j8.com.br/' } };
const LISTA = ['Codigo', 'Categoria', 'CategoriaImovel', 'TituloImovel', 'Bairro', 'Cidade', 'Dormitorios', 'Suites', 'Vagas',
  'AreaPrivativa', 'AreaTotal', 'ValorVenda', 'OcultarPrecoSite', 'FotoDestaquePequena', 'Empreendimento', 'Status', 'DataAtualizacao',
  'AreaTerreno', 'Mobiliado', 'EmConstrucao', 'Lancamento', 'Complemento', 'Bloco'];
// características "Sim/Nao" do anúncio → rótulo no PDF de informações
const ITENS_IMOVEL = {
  SuiteMaster: 'Suíte master', LivingHall: 'Living hall', SalaEstar: 'Sala de estar', SalaJantar: 'Sala de jantar', EstarIntimo: 'Estar íntimo',
  Escritorio: 'Escritório', HomeTheater: 'Home theater', Lareira: 'Lareira', Lavabo: 'Lavabo', CopaCozinha: 'Copa/cozinha', Despensa: 'Despensa',
  AreaServico: 'Área de serviço', Elevador: 'Elevador privativo', PisoAquecido: 'Piso aquecido', ArCentral: 'Ar central', AquecimentoCentral: 'Aquecimento central',
  Piscina: 'Piscina', PiscinaAquecida: 'Piscina aquecida', Churrasqueira: 'Churrasqueira', EspacoGourmet: 'Espaço gourmet', Sauna: 'Sauna', Adega: 'Adega',
  Deck: 'Deck', Jardim: 'Jardim', Quintal: 'Quintal', Terraco: 'Terraço', Sacada: 'Sacada', Mezanino: 'Mezanino', Edicula: 'Edícula', Biblioteca: 'Biblioteca'
};
const ITENS_COND = {
  Portaria24Hrs: 'Portaria 24h', Guarita: 'Guarita', SalaoFestas: 'Salão de festas', SalaFitness: 'Academia', Playground: 'Playground',
  Brinquedoteca: 'Brinquedoteca', SalaoJogos: 'Salão de jogos', QuadraTenis: 'Quadra de tênis', QuadraEsportes: 'Quadra poliesportiva',
  Bosque: 'Bosque', Spa: 'Spa', Cinema: 'Cinema', PetCare: 'Pet place', GeradorEnergia: 'Gerador'
};
const DETALHE = ['Codigo', 'Descricao', 'ValorCondominio', 'ValorIptu', 'BanheiroSocialQtd', 'AreaTerreno', 'AreaTotal', 'AreaPrivativa', 'AnoConstrucao',
  'Imediacoes', 'Mobiliado', 'Closet', 'AptosAndar', 'AreaConstruida', ...Object.keys(ITENS_IMOVEL), ...Object.keys(ITENS_COND), { Foto: ['Foto', 'Ordem', 'ExibirSite'] }];
const FOTOS = 'todas'; // "Baixar fotos" e "Baixar PDF" usam todas as fotos que aparecem no anúncio (só imagens)
const sim = v => /^sim$/i.test(String(v || '').trim());
const OUT = new URL('../dados/j8.json', import.meta.url);
const DIR = new URL('../dados/j8/', import.meta.url);

const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const slug = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const espera = ms => new Promise(s => setTimeout(s, ms));
// complemento/bloco do cadastro (nº do apartamento, casa 8…); ignora o que veio preenchido com lixo
const unidade = v => { const s = String(v || '').trim(); return /^(\.+|-+|0+|complemento|bloco|[uú]nic[oa]|novo|usado|venda|a venda|lan[cç]amento)$/i.test(s) ? '' : s; };

async function chama(metodo, query) {
  const url = `${API}${metodo}?key=&${query}`;
  for (let t = 1; t <= 3; t++) {
    const r = await fetch(url, HEAD);
    if (r.ok) return r.json();
    await espera(2000 * t);
  }
  throw new Error('J8 não respondeu: ' + metodo + ' ' + query.slice(0, 80));
}
const pagina = p => chama('listar', 'showtotal=1&pesquisa=' + encodeURIComponent(JSON.stringify({
  advFilter: { ExibirNoSite: 'Sim', Status: ['Venda'], CodigoAgencia: ['1', '2', '3'] }, // todos os do site, exclusivos ou não
  fields: LISTA, paginacao: { pagina: p, quantidade: 50 }, order: { ValorVenda: 'desc' }
})));

// Separa a descrição em um parágrafo de abertura e uma lista de destaques (as linhas com marcador)
function leDescricao(txt) {
  const linhas = String(txt || '').replace(/\r/g, '').split('\n').map(l => l.replace(/ /g, ' ').trim()).filter(Boolean);
  const venda = /agende|n[aã]o perca|entre em contato|visite|oportunidade|ligue|whats|aproveite|hoje mesmo/i;
  const destaques = [], paragrafos = [];
  for (const l of linhas) {
    const marcado = /^([?•\-–*·✓✔▪◦>]|\d+[.)])\s*/.test(l);
    const t = l.replace(/^([?•\-–*·✓✔▪◦>]|\d+[.)])[\s?]*/, '').replace(/\s+/g, ' ').trim();
    if (!t || venda.test(t)) continue;
    if (marcado && t.length >= 3 && t.length <= 110 && !/:$/.test(t)) destaques.push(t.replace(/[.;]$/, ''));
    else if (!marcado && t.length > 50 && !/:$/.test(t)) paragrafos.push(t);
  }
  const corta = (s, max) => s.length <= max ? s : (s.slice(0, max).match(/^[\s\S]*[.!?](?=\s)/) || [s.slice(0, max).replace(/\s+\S*$/, '') + '…'])[0];
  const intro = corta(paragrafos[0] || '', 300);
  // texto corrido para a página "Sobre o imóvel" quando o anúncio não tem lista de destaques
  const texto = [];
  let soma = 0;
  for (const p of paragrafos.slice(1)) { if (soma + p.length > 900) { if (!texto.length) texto.push(corta(p, 900)); break; } texto.push(p); soma += p.length; }
  return { intro, texto, destaques: [...new Set(destaques)].slice(0, 12) };
}

await mkdir(DIR, { recursive: true });
const first = await pagina(1);
const total = Number(first.total) || 0, paginas = Number(first.paginas) || 1;
const brutos = [];
const pega = j => Object.entries(j).forEach(([k, v]) => { if (/^\d+$/.test(k) && v && v.Codigo) brutos.push(v); });
pega(first);
for (let p = 2; p <= paginas; p++) { pega(await pagina(p)); await espera(400); }

const lista = brutos.filter(v => !/\bteste\b/i.test(v.TituloImovel || ''));
const imoveis = lista.map(v => {
  const area = num(v.AreaPrivativa) || num(v.AreaTotal);
  const tipo = String(v.CategoriaImovel || v.Categoria || '').trim();
  return {
    c: String(v.Codigo), t: tipo, ti: String(v.TituloImovel || '').trim(),
    b: String(v.Bairro || '').trim(), ci: String(v.Cidade || '').trim(),
    q: num(v.Dormitorios), s: num(v.Suites), v: num(v.Vagas), a: Math.round(area),
    at: Math.round(num(v.AreaTerreno)),
    // mobília: s = mobiliado, m = semi, n = sem, '' = não informado
    mo: { SIM: 's', SEMI: 'm', 'NÃO': 'n', NAO: 'n' }[String(v.Mobiliado || '').trim().toUpperCase()] || '',
    // obra: p = na planta / em construção, r = pronto
    ob: sim(v.Lancamento) || sim(v.EmConstrucao) ? 'p' : 'r',
    p: v.OcultarPrecoSite === 'Sim' ? 0 : num(v.ValorVenda),
    f: String(v.FotoDestaquePequena || '').replace(/^http:/, 'https:'),
    e: String(v.Empreendimento || '').trim(),
    cp: unidade(v.Complemento), bl: unidade(v.Bloco),
    u: `https://www.j8.com.br/imovel/${slug(tipo.split(' ')[0] || 'imovel')}-${Math.round(area)}m2-venda-${slug(v.Bairro)}-${v.Codigo}`,
    du: String(v.DataAtualizacao || '')
  };
});

// segurança: se vier muito menos do que o site diz ter, não sobrescreve o que já está bom
if (imoveis.length < Math.max(20, total * 0.8)) throw new Error(`Importação incompleta: ${imoveis.length} de ${total}`);

// detalhes + fotos, só dos imóveis novos ou alterados (3 por vez, com pausa, para não pesar no site deles)
const fila = [];
for (const i of imoveis) {
  let atual = null;
  try { atual = JSON.parse(await readFile(new URL(i.c + '.json', DIR), 'utf8')); } catch {}
  if (!atual || atual.nf !== FOTOS || atual.du !== i.du || atual.p !== i.p) fila.push(i);
}
let feitos = 0, falhas = 0;
async function trabalhador() {
  while (fila.length) {
    const i = fila.shift();
    try {
      const d = await chama('detalhes', `imovel=${i.c}&pesquisa=${encodeURIComponent(JSON.stringify({ fields: DETALHE }))}`);
      const fotos = Object.values(d.Foto || {}).filter(f => f.ExibirSite !== 'Nao' && /\.(jpe?g|png|webp)(\?|$)/i.test(String(f.Foto || ''))) // só imagens
        .sort((a, b) => num(a.Ordem) - num(b.Ordem)).map(f => String(f.Foto).replace(/^http:/, 'https:'));
      const { intro, texto, destaques } = leDescricao(d.Descricao);
      const det = Object.assign({}, i, {
        cond: num(d.ValorCondominio), iptu: num(d.ValorIptu), bh: num(d.BanheiroSocialQtd),
        at: num(d.AreaTerreno), ap: num(d.AreaPrivativa), atot: num(d.AreaTotal), ano: num(d.AnoConstrucao),
        im: String(d.Imediacoes || '').trim(), mob: sim(d.Mobiliado), cl: num(d.Closet),
        apa: num(d.AptosAndar), ac: num(d.AreaConstruida),
        itens: Object.entries(ITENS_IMOVEL).filter(([k]) => sim(d[k])).map(([, v]) => v),
        condItens: Object.entries(ITENS_COND).filter(([k]) => sim(d[k])).map(([, v]) => v),
        intro, texto, destaques, fotos, nf: FOTOS
      });
      await writeFile(new URL(i.c + '.json', DIR), JSON.stringify(det));
      feitos++;
    } catch (e) { falhas++; }
    await espera(300);
  }
}
await Promise.all([trabalhador(), trabalhador(), trabalhador()]);

// tira os books de imóveis que saíram do site
const ativos = new Set(imoveis.map(i => i.c));
for (const f of await readdir(DIR)) if (f.endsWith('.json') && !ativos.has(f.replace('.json', ''))) await unlink(new URL(f, DIR));

await writeFile(OUT, JSON.stringify({ fonte: 'J8 Imóveis (j8.com.br)', atualizadoEm: new Date().toISOString(), total: imoveis.length, imoveis }));
console.log(`Estoque da J8: ${imoveis.length} imóveis. Detalhes baixados: ${feitos}${falhas ? `, falhas: ${falhas}` : ''}.`);
