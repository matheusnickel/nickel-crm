// Varredura de anúncios repetidos entre as imobiliárias → dados/repetidos.json (a Carteira lê e mostra um imóvel só).
// Roda depois de atualizar os estoques: node scripts/repetidos.mjs
//
// Só junta quando há certeza pelos DADOS: mesmo tipo, mesmo endereço com número (ou mesmo condomínio no mesmo bairro),
// preço e metragem praticamente iguais e as mesmas características (quartos, suítes, vagas). Unidades com números
// diferentes ou números de rua diferentes nunca são o mesmo imóvel. Na dúvida, os dois ficam (melhor sobrar do que perder).
// As fotos não servem de prova: imobiliárias fotografam o mesmo imóvel de jeitos diferentes, e unidades diferentes de um
// mesmo prédio dividem as fotos do decorado (testado em 31/10: Vivenda Tabor sem nenhuma foto igual; Atmos 08 × 18 com 9 de 10).
//
// Quem fica: J8 (mostra o complemento), SIS3 (melhores fotos), depois pela qualidade das fotos medida em 31/10:
// Arya (2560×1707), A. Gonçalves (1920×1280), Casa Prates (1920×1280, medida em 03/11), Zireh (1280×853).
import { readFile, writeFile } from 'node:fs/promises';

const ORDEM = ['j8', 'sis3', 'arya', 'gon', 'prates', 'zireh'];
const ARQ = { j8: 'j8', gon: 'goncalves', sis3: 'sis3', zireh: 'zireh', arya: 'arya', prates: 'prates' };
const OUT = new URL('../dados/repetidos.json', import.meta.url);

const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
// tipo → família (casa e sobrado juntos; garden junto com apartamento)
const J8_GRUPO = { 'APARTAMENTO': 'apto', 'APARTAMENTO GARDEN': 'apto', 'COBERTURA': 'cob', 'CASA': 'casa', 'CASA CONDOMINIO FECHADO': 'casa', 'SOBRADO': 'casa',
  'SOBRADO CONDOMINIO FECHADO': 'casa', 'TERRENO': 'terreno', 'TERRENO CONDOMINIO FECHADO': 'terreno', 'CONJUNTO/COMERCIAL/LOJA': 'comercial' };
const grupoDe = (src, t) => src === 'j8' ? J8_GRUPO[t] : /^(Casa|Sobrado)/.test(t) ? 'casa' : /^Apartamento/.test(t) ? 'apto' : t === 'Cobertura' ? 'cob' : /^Terreno/.test(t) ? 'terreno' : t === 'Comercial' ? 'comercial' : '';
// bairros com dois nomes no mercado
const ALIASES = [['ecoville', 'mossungue'], ['cic', 'cidade industrial'], ['alto da xv', 'alto da rua xv'], ['bigorrilho', 'champagnat']];
const bairro = b => { const n = norm(b); const g = ALIASES.find(g => g.includes(n)); return g ? g[0] : n; };
// grafias diferentes do mesmo nome: letra dobrada ("Perretto" × "Perreto"), algarismo romano ("Burgel II" × "Burgel 2"), abreviações
const ROMANOS = { i: '1', ii: '2', iii: '3', iv: '4', v: '5', vi: '6', vii: '7', viii: '8', ix: '9', x: '10' };
const ABREV = { prof: 'professor', profa: 'professora', dr: 'doutor', des: 'desembargador', gal: 'general', gen: 'general', cel: 'coronel', pres: 'presidente',
  eng: 'engenheiro', sen: 'senador', dep: 'deputado', cap: 'capitao', maj: 'major', ten: 'tenente', sto: 'santo', sta: 'santa', mal: 'marechal', alm: 'almirante', pe: 'padre' };
const palavras = s => norm(s).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean).map(p => ROMANOS[p] || ABREV[p] || p.replace(/([a-z])\1+/g, '$1'));
function endereco(en) {
  const s = norm(en), m = s.match(/^(.*?),\s*(\d+)/);
  const rua = palavras(m ? m[1] : s.split(/\s+-\s+|,/)[0])
    .filter((p, k) => !(k === 0 && /^(rua|r|avenida|av|alameda|al|travessa|tv|rodovia|rod|estrada|praca|largo)$/.test(p)) && !/^(de|da|do|dos|das|e)$/.test(p));
  return { rua: rua.join(' '), num: m ? m[2] : '' };
}
const unidade = i => (String(i.cp || '').match(/\d+/) || [''])[0].replace(/^0+(?=\d)/, '');

// os anúncios de todas as imobiliárias
const todos = [];
for (const src of ORDEM) {
  const j = JSON.parse(await readFile(new URL(`../dados/${ARQ[src]}.json`, import.meta.url), 'utf8'));
  for (const i of j.imoveis) {
    const g = grupoDe(src, i.t); if (!g) continue;
    const end = endereco(i.en), b = bairro(i.b);
    const chaves = [];
    if (end.rua && end.num) chaves.push(['forte', `${g}|end|${end.rua}#${end.num}`]);
    if (i.e && b) chaves.push(['forte', `${g}|cond|${palavras(i.e).join(' ')}|${b}`]);
    if (end.rua && b) chaves.push(['rua', `${g}|rua|${end.rua}|${b}`]);
    todos.push({ k: `${src}:${i.c}`, src, g, a: i.a || 0, p: i.p || 0, q: i.q || 0, s: i.s || 0, v: i.v || 0, un: unidade(i), num: end.num, chaves });
  }
}
// é o mesmo imóvel? só com certeza
function mesmo(x, y, forte) {
  if (x.un && y.un && x.un !== y.un) return false;          // unidades diferentes
  if (x.num && y.num && x.num !== y.num) return false;      // números de rua diferentes
  if (!x.a || !y.a) return false;
  const da = Math.abs(x.a - y.a) / Math.max(x.a, y.a);
  const dp = x.p && y.p ? Math.abs(x.p - y.p) / Math.max(x.p, y.p) : null;
  const conflitos = ['q', 's', 'v'].filter(c => x[c] && y[c] && x[c] !== y[c]).length;
  const temQuartos = x.g !== 'terreno' && x.g !== 'comercial';
  // preço idêntico e mesma metragem: é o mesmo, mesmo que uma imobiliária tenha cadastrado quartos/suítes diferente
  // (Vivenda Tabor: J8 4 quartos/4 suítes, SIS3 5/5, mesmos R$ 12.900.000 e 539 m²)
  const identico = dp !== null && dp <= .005 && da <= .01;
  if (forte) {
    if (identico) return true;
    if (dp !== null) return da <= .02 && dp <= .02 && conflitos <= (x.g === 'casa' ? 1 : 0); // casa: um dado divergente tolerado
    return da <= .01 && conflitos === 0 && (!temQuartos || (x.q && x.q === y.q));             // um deles sem preço
  }
  // só a rua e o bairro batem (um anúncio sem número): mais rígido
  if (identico) return conflitos <= 1;
  return dp !== null && da <= .01 && dp <= .01 && conflitos === 0 && (!temQuartos || (x.q && x.q === y.q));
}

const porChave = new Map();
todos.forEach(i => i.chaves.forEach(([, ch]) => { if (!porChave.has(ch)) porChave.set(ch, []); porChave.get(ch).push(i); }));
// pares certos; se um anúncio bate com DOIS da mesma imobiliária (unidades iguais no mesmo prédio), não dá para saber qual é: fica
const pares = [];
let ambiguos = 0;
for (const i of todos) {
  const achados = new Map(); // src -> Set(k)
  for (const [tipo, ch] of i.chaves) for (const o of porChave.get(ch)) {
    if (o.src === i.src || !mesmo(i, o, tipo === 'forte')) continue;
    if (!achados.has(o.src)) achados.set(o.src, new Map());
    achados.get(o.src).set(o.k, o);
  }
  for (const [src, m] of achados) {
    if (m.size > 1) { ambiguos++; continue; }
    const o = [...m.values()][0];
    if (ORDEM.indexOf(i.src) < ORDEM.indexOf(src)) pares.push([i, o]);
  }
}
// junta os pares em grupos (um anúncio por imobiliária em cada grupo; nada de juntar unidades diferentes por tabela)
const grupoDo = new Map(todos.map(i => [i.k, [i]]));
for (const [x, y] of pares) {
  const gx = grupoDo.get(x.k), gy = grupoDo.get(y.k);
  if (gx === gy) continue;
  const fontes = new Set(gx.map(i => i.src));
  if (gy.some(i => fontes.has(i.src))) continue;
  if (gx.some(a => gy.some(b => (a.un && b.un && a.un !== b.un) || (a.num && b.num && a.num !== b.num)))) continue;
  const junto = gx.concat(gy); junto.forEach(i => grupoDo.set(i.k, junto));
}
const grupos = [...new Set(grupoDo.values())].filter(g => g.length > 1)
  .map(g => g.sort((a, b) => ORDEM.indexOf(a.src) - ORDEM.indexOf(b.src)).map(i => i.k));

await writeFile(OUT, JSON.stringify({ geradoEm: new Date().toISOString(), ordem: ORDEM, total: grupos.length, escondidos: grupos.reduce((s, g) => s + g.length - 1, 0), grupos }));
const fica = {}, sai = {};
grupos.forEach(g => { const [p, ...o] = g; fica[p.split(':')[0]] = (fica[p.split(':')[0]] || 0) + 1; o.forEach(k => { const s = k.split(':')[0]; sai[s] = (sai[s] || 0) + 1; }); });
console.log(`${todos.length} anúncios · ${grupos.length} imóveis repetidos · ${grupos.reduce((s, g) => s + g.length - 1, 0)} anúncios a menos · ${ambiguos} casos ambíguos mantidos`);
console.log('fica de quem:', fica);
console.log('sai de quem:', sai);
