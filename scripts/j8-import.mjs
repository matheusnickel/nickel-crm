// Copia o estoque À VENDA do site da J8 (jota8) para dados/j8.json, que a Carteira lê.
// Roda 1x por dia pelo GitHub Actions (.github/workflows/j8.yml) ou à mão: node scripts/j8-import.mjs
import { writeFile } from 'node:fs/promises';

const API = 'https://j8-busca-imoveis.gustavo-05e.workers.dev/v1/imoveis/listar';
const FIELDS = ['Codigo', 'Categoria', 'CategoriaImovel', 'TituloImovel', 'Bairro', 'Cidade', 'Dormitorios', 'Suites', 'Vagas',
  'AreaPrivativa', 'AreaTotal', 'ValorVenda', 'OcultarPrecoSite', 'FotoDestaquePequena', 'Empreendimento', 'Status'];
const OUT = new URL('../dados/j8.json', import.meta.url);

const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const slug = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function pagina(p) {
  const pesquisa = { advFilter: { ExibirNoSite: 'Sim', Status: ['Venda'], Exclusivo: 'Sim', CodigoAgencia: ['1', '2', '3'] }, fields: FIELDS, paginacao: { pagina: p, quantidade: 50 }, order: { ValorVenda: 'desc' } };
  const url = `${API}?key=&showtotal=1&pesquisa=${encodeURIComponent(JSON.stringify(pesquisa))}`;
  for (let t = 1; t <= 3; t++) {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (CarteiraNickel)', Origin: 'https://www.j8.com.br', Referer: 'https://www.j8.com.br/' } });
    if (r.ok) return r.json();
    await new Promise(s => setTimeout(s, 2000 * t));
  }
  throw new Error('J8 não respondeu a página ' + p);
}

const first = await pagina(1);
const total = Number(first.total) || 0, paginas = Number(first.paginas) || 1;
const brutos = [];
const pega = j => Object.entries(j).forEach(([k, v]) => { if (/^\d+$/.test(k) && v && v.Codigo) brutos.push(v); });
pega(first);
for (let p = 2; p <= paginas; p++) { pega(await pagina(p)); await new Promise(s => setTimeout(s, 400)); }

const imoveis = brutos.filter(v => !/\bteste\b/i.test(v.TituloImovel || '')).map(v => {
  const area = num(v.AreaPrivativa) || num(v.AreaTotal);
  const tipo = String(v.CategoriaImovel || v.Categoria || '').trim();
  return {
    c: String(v.Codigo),
    t: tipo,
    ti: String(v.TituloImovel || '').trim(),
    b: String(v.Bairro || '').trim(),
    ci: String(v.Cidade || '').trim(),
    q: num(v.Dormitorios), s: num(v.Suites), v: num(v.Vagas),
    a: Math.round(area),
    p: v.OcultarPrecoSite === 'Sim' ? 0 : num(v.ValorVenda),
    f: String(v.FotoDestaquePequena || '').replace(/^http:/, 'https:'),
    e: String(v.Empreendimento || '').trim(),
    u: `https://www.j8.com.br/imovel/${slug(tipo.split(' ')[0] || 'imovel')}-${Math.round(area)}m2-venda-${slug(v.Bairro)}-${v.Codigo}`
  };
});

// segurança: se vier muito menos do que o site diz ter, não sobrescreve o arquivo bom
if (imoveis.length < Math.max(20, total * 0.8)) throw new Error(`Importação incompleta: ${imoveis.length} de ${total}`);

const dados = { fonte: 'J8 Imóveis (j8.com.br)', atualizadoEm: new Date().toISOString(), total: imoveis.length, imoveis };
await writeFile(OUT, JSON.stringify(dados));
console.log(`Estoque da J8 atualizado: ${imoveis.length} imóveis.`);
