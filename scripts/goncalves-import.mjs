// Copia o estoque À VENDA do site da A. Gonçalves (agoncalves.com.br) para a Carteira, no mesmo formato da J8:
//  - dados/goncalves.json          resumo de todos os imóveis (para o cruzamento com os clientes)
//  - dados/goncalves/<codigo>.json detalhes + todas as fotos do anúncio (PDF, fotos e descritivo)
// O site não tem lista paginada aberta: a lista de códigos vem do próprio site (admin-ajax) e cada página de imóvel
// traz o registro do Vista em "var imovelDataLayer". Roda à mão: node scripts/goncalves-import.mjs
import { writeFile, readdir, unlink, mkdir, readFile } from 'node:fs/promises';

const SITE = 'https://agoncalves.com.br';
const HEAD = { headers: { 'User-Agent': 'Mozilla/5.0 (CarteiraNickel)', 'Accept-Encoding': 'gzip' } };
const OUT = new URL('../dados/goncalves.json', import.meta.url);
const DIR = new URL('../dados/goncalves/', import.meta.url);

const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const sim = v => /^sim$/i.test(String(v || '').trim());
const slug = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const espera = ms => new Promise(s => setTimeout(s, ms));
const norm = s => slug(s).replace(/-/g, ' ');

// categorias da Gonçalves -> tipos da Carteira (os mesmos nomes das categorias da J8)
function tipoCarteira(o) {
  const cat = norm(o.Categoria), cond = sim((o.InfraEstrutura || {})['Condominio Fechado']);
  if (/comercial|industrial|loja|sala|conjunto|predio|barracao|galpao|ponto/.test(cat)) return 'Comercial';
  if (/garden/.test(cat)) return 'Apartamento garden';
  if (/cobertura/.test(cat)) return 'Cobertura';
  if (/apartamento|studio|loft|flat|kitnet/.test(cat)) return 'Apartamento';
  if (/casa em condominio/.test(cat)) return 'Casa em condomínio';
  if (/sobrado/.test(cat)) return cond || /condominio/.test(cat) ? 'Sobrado em condomínio' : 'Sobrado';
  if (/terreno|lote/.test(cat)) return cond || /condominio/.test(cat) ? 'Terreno em condomínio' : 'Terreno';
  if (/casa/.test(cat)) return 'Casa';
  return '';
}

async function pega(url, tentativas = 3) {
  for (let t = 1; t <= tentativas; t++) {
    try { const r = await fetch(url, HEAD); if (r.ok) return await r.text(); } catch (e) {}
    await espera(2000 * t);
  }
  throw new Error('Gonçalves não respondeu: ' + url);
}
// o registro do Vista que a página do imóvel carrega (var imovelDataLayer = {...})
function registro(html) {
  const i = html.indexOf('var imovelDataLayer=');
  if (i < 0) return null;
  const a = html.indexOf('{', i);
  let d = 0, emTexto = false, esc = false;
  for (let k = a; k < html.length; k++) {
    const ch = html[k];
    if (emTexto) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') emTexto = false; continue; }
    if (ch === '"') emTexto = true;
    else if (ch === '{') d++;
    else if (ch === '}' && --d === 0) return JSON.parse(html.slice(a, k + 1));
  }
  return null;
}

// o endereço que o anúncio mostra no topo: <p class="endereco">Rua Alberto Klemtz, 1321, Portão - Curitiba/PR</p>
// fica só rua e número (bairro e cidade já aparecem no card); sem esse trecho, usa o cadastro
const entidades = s => s.replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n)).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'").replace(/&nbsp;/g, ' ');
function enderecoDoSite(html, o) {
  const m = html.match(/<p class="endereco">([\s\S]*?)<\/p>/);
  if (!m) return [[o.TipoEndereco, o.Endereco].map(x => String(x || '').trim()).filter(Boolean).join(' '), String(o.Numero || '').trim()].filter(Boolean).join(', ');
  let s = entidades(m[1].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
  const k = s.lastIndexOf(' - ');
  if (k > 0) s = s.slice(0, k);
  const partes = s.split(', ');
  if (partes.length > 1 && slug(partes[partes.length - 1]) === slug(o.Bairro)) partes.pop();
  return partes.join(', ').trim();
}

await mkdir(DIR, { recursive: true });
const codigos = JSON.parse(await pega(`${SITE}/wp-admin/admin-ajax.php?action=listar_codigos_imoveis`));
if (!Array.isArray(codigos) || codigos.length < 100) throw new Error('Lista de códigos estranha: ' + String(codigos).slice(0, 80));

let anterior = 0;
try { anterior = JSON.parse(await readFile(OUT, 'utf8')).total || 0; } catch {}

const imoveis = [], semTipo = {};
let feitos = 0, falhas = 0, aluguel = 0;
const fila = codigos.slice();
async function trabalhador() {
  while (fila.length) {
    const c = String(fila.shift());
    try {
      const html = await pega(`${SITE}/imovel/${c}/venda/imovel/`);
      const o = registro(html);
      if (!o || String(o.Codigo) !== c) throw new Error('sem registro');
      const venda = /venda/i.test(o.Status || '') || (o.FinalidadeStatus || {}).VENDA;
      if (!venda || /\bteste\b/i.test(o.TituloSite || '')) { aluguel++; continue; }
      const t = tipoCarteira(o);
      if (!t) { semTipo[o.Categoria] = (semTipo[o.Categoria] || 0) + 1; continue; }
      const ap = num(o.AreaPrivativa), atot = num(o.AreaTotal), aterr = num(o.AreaTerreno), ac = num(o.AreaConstruida);
      const car = o.Caracteristicas || {};
      const i = {
        c, t, cat: String(o.Categoria || ''), ti: String(o.TituloSite || '').trim(),
        b: String(o.Bairro || '').trim(), ci: String(o.Cidade || '').trim(),
        q: num(o.Dormitorios), s: num(o.Suites), v: num(o.Vagas), a: Math.round(ap || ac || atot),
        // terreno: só o campo próprio (a área total da Gonçalves não é o terreno)
        at: Math.round(aterr),
        mo: sim(car.Mobiliado) ? 's' : sim(car['Semi Mobiliado']) ? 'm' : 'n',
        ob: sim(o.Lancamento) || /lan[cç]amento|constru|planta/i.test(o.Situacao || '') ? 'p' : 'r',
        p: num(o.ValorVenda),
        f: String(o.FotoDestaquePequena || o.FotoDestaque || ''),
        e: String(o.Empreendimento || '').trim(),
        // endereço copiado do anúncio ("Rua Alberto Klemtz, 1321"): o cadastro do Vista vem sem o número
        en: enderecoDoSite(html, o),
        cp: String(o.Complemento || '').trim(), bl: String(o.Bloco || '').trim(),
        u: `${SITE}/imovel/${c}/venda/${slug([t, o.Dormitorios ? o.Dormitorios + ' quartos' : '', o.Empreendimento, o.Bairro, o.Cidade].filter(Boolean).join(' '))}/`,
        du: String(o.DataHoraAtualizacao || '')
      };
      const fotos = Object.values(o.Foto || {}).filter(f => f && f.ExibirNoSite !== 'Nao' && /\.(jpe?g|png|webp)(\?|$)/i.test(String(f.Foto || ''))).map(f => String(f.Foto));
      const det = Object.assign({}, i, {
        cond: num(o.ValorCondominio), iptu: num(o.ValorIptu), bh: num(o.BanheiroSocialQtd),
        ap, atot, ac, apa: num(o.AptosAndar), mob: sim(car.Mobiliado),
        descricao: String(o.DescricaoWeb || ''), fotos
      });
      await writeFile(new URL(c + '.json', DIR), JSON.stringify(det));
      imoveis.push(i);
      feitos++;
      if (feitos % 100 === 0) console.log(`… ${feitos} imóveis à venda lidos`);
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
await writeFile(OUT, JSON.stringify({ fonte: 'A. Gonçalves Imóveis (agoncalves.com.br)', atualizadoEm: new Date().toISOString(), total: imoveis.length, imoveis }));
console.log(`Estoque da Gonçalves: ${imoveis.length} imóveis à venda (${aluguel} só aluguel ignorados, ${falhas} falhas).`);
if (Object.keys(semTipo).length) console.log('Categorias sem tipo na Carteira:', semTipo);
const porTipo = {}; imoveis.forEach(i => { porTipo[i.t] = (porTipo[i.t] || 0) + 1; });
console.log('Por tipo:', porTipo);
