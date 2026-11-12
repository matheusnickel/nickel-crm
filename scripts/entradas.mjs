// Quando cada imóvel ENTROU no estoque da Carteira (12/11, pedido do Matheus: "imóveis que entraram nos últimos 30 dias,
// para saber para quem enviar"). Roda depois de cada atualização dos estoques (o repetidos.mjs chama no fim).
//
// Grava dados/entradas.json: { geradoEm, base: { src: data da 1ª importação }, por: { src: { data: [códigos] } } }
// A data "" = já estava no estoque na primeira importação daquela imobiliária (não é novo: só não tínhamos como saber).
// Um código, depois de visto, guarda a data da primeira vez para sempre (se some e volta, não vira novo de novo).
//
// Primeira vez (ou com --refazer): reconstrói as datas pelo histórico do git dos arquivos dados/<imobiliária>.json.
// Importações que mudaram o próprio script (não o estoque do site) também contam como base: ver BASE_EXTRA.
import { readFile, writeFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ARQ = { j8: 'j8', gon: 'goncalves', sis3: 'sis3', zireh: 'zireh', arya: 'arya', prates: 'prates', pilar: 'pilar', entre: 'entre', urbanic: 'urbanic', v6: 'v6', baltazzar: 'baltazzar' };
// 28/10: a J8 passou a vir inteira (antes eram só os exclusivos); os 533 que apareceram ali não eram imóveis novos no site
const BASE_EXTRA = { j8: ['9a01bde'] };
const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const OUT = new URL('../dados/entradas.json', import.meta.url);
const diaLocal = d => { const x = new Date(d); return isNaN(x) ? '' : new Date(x.getTime() - 3 * 3600e3).toISOString().slice(0, 10); }; // Curitiba (UTC−3)

let dados = null;
if (!process.argv.includes('--refazer')) { try { dados = JSON.parse(await readFile(OUT, 'utf8')); } catch (e) {} }

// código -> data, por imobiliária
const data = {}, base = {};
if (dados) {
  Object.assign(base, dados.base);
  for (const [src, por] of Object.entries(dados.por)) { data[src] = new Map(); for (const [d, cods] of Object.entries(por)) cods.forEach(c => data[src].set(c, d)); }
} else {
  for (const [src, arq] of Object.entries(ARQ)) {
    const log = execSync(`git log --reverse "--format=%h|%ad" --date=iso -- dados/${arq}.json`, { cwd: RAIZ, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
    data[src] = new Map();
    for (let n = 0; n < log.length; n++) {
      const [h, d] = log[n].split('|');
      let j; try { j = JSON.parse(execSync(`git show ${h}:dados/${arq}.json`, { cwd: RAIZ, encoding: 'utf8', maxBuffer: 1 << 28 })); } catch (e) { continue; }
      const ehBase = n === 0 || (BASE_EXTRA[src] || []).includes(h);
      if (n === 0) base[src] = d.slice(0, 10);
      for (const i of j.imoveis) { const c = String(i.c); if (!data[src].has(c)) data[src].set(c, ehBase ? '' : d.slice(0, 10)); }
    }
  }
}

// o estoque de agora: o que ainda não foi visto entrou nesta atualização
const hoje = diaLocal(Date.now()), novos = {};
for (const [src, arq] of Object.entries(ARQ)) {
  let j; try { j = JSON.parse(await readFile(new URL(`../dados/${arq}.json`, import.meta.url), 'utf8')); } catch (e) { continue; }
  const quando = diaLocal(j.atualizadoEm) || hoje;
  const primeira = !data[src]; // imobiliária nova: tudo o que veio é a base
  if (primeira) { data[src] = new Map(); base[src] = quando; }
  for (const i of j.imoveis) { const c = String(i.c); if (!data[src].has(c)) { data[src].set(c, primeira ? '' : quando); if (!primeira) novos[src] = (novos[src] || 0) + 1; } }
}

const por = {};
for (const [src, m] of Object.entries(data)) { por[src] = {}; for (const [c, d] of m) (por[src][d] ||= []).push(c); }
await writeFile(OUT, JSON.stringify({ geradoEm: new Date().toISOString(), base, por }));

const limite = diaLocal(Date.now() - 30 * 864e5);
const ult30 = Object.fromEntries(Object.entries(por).map(([s, p]) => [s, Object.entries(p).filter(([d]) => d && d > limite).reduce((t, [, c]) => t + c.length, 0)]).filter(([, n]) => n));
console.log('Entradas:', dados ? 'novos nesta atualização ' + JSON.stringify(novos) : 'reconstruído pelo histórico', '· nos últimos 30 dias:', ult30);
