// Cofre de complementos (26/11, pedido do Matheus: "se a gente já tem, mantenha; nunca perca").
// dados/complementos.json guarda, para sempre, o complemento (nº do apartamento/casa), o bloco e o endereço com número de cada
// anúncio ("src:código"). Nada sai daqui: nem quando o anúncio some do site, nem quando a imobiliária para de mandar
// (a J8 parou em 26/11). A cada atualização:
//  - o que a imobiliária mandou entra no cofre (se ela mudar o complemento, vale o novo);
//  - o que veio vazio é preenchido com o do cofre (endereço só se for a mesma rua, sem número, como a J8 manda agora).
// Roda no começo do repetidos.mjs. À mão: node scripts/complementos.mjs   (--historico: lê também as versões antigas no git)
import { readFile, writeFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const D = new URL('../dados/', import.meta.url);
const ARQ = { j8: 'j8', j8loc: 'j8-locacao', gon: 'goncalves', sis3: 'sis3', zireh: 'zireh', arya: 'arya', prates: 'prates', pilar: 'pilar', entre: 'entre', urbanic: 'urbanic', v6: 'v6', corretare: 'corretare', mybroker: 'mybroker', nn: 'nn' };
const COFRE = new URL('complementos.json', D);
const temNum = en => /,\s*\S+$/.test(String(en || ''));
const t = s => String(s || '').trim();

let cofre = {};
try { cofre = JSON.parse(await readFile(COFRE, 'utf8')).c || {}; } catch (e) {}
const guarda = (k, i) => {
  const o = cofre[k] || {}, n = Object.assign({}, o);
  if (t(i.cp)) n.cp = t(i.cp); if (t(i.bl)) n.bl = t(i.bl); if (temNum(i.en)) n.en = t(i.en);
  if (n.cp || n.bl || n.en) cofre[k] = n;
};

// --historico: as versões antigas dos arquivos no git (o que já foi visto um dia também fica)
if (process.argv.includes('--historico')) {
  const raiz = fileURLToPath(new URL('../', import.meta.url));
  for (const [src, arq] of Object.entries(ARQ)) {
    const commits = execSync(`git log --format=%H -- dados/${arq}.json`, { cwd: raiz, maxBuffer: 1e8 }).toString().trim().split('\n').filter(Boolean).reverse();
    for (const h of commits) {
      let j; try { j = JSON.parse(execSync(`git show ${h}:dados/${arq}.json`, { cwd: raiz, maxBuffer: 3e8 }).toString()); } catch (e) { continue; }
      for (const i of j.imoveis || []) guarda(src + ':' + i.c, i);
    }
  }
}

let preenchidos = 0;
for (const [src, arq] of Object.entries(ARQ)) {
  const f = new URL(arq + '.json', D); let j;
  try { j = JSON.parse(await readFile(f, 'utf8')); } catch (e) { continue; }
  let mudou = 0;
  for (const i of j.imoveis) {
    const k = src + ':' + i.c; guarda(k, i);
    const o = cofre[k]; if (!o) continue; let m = false;
    if (!t(i.cp) && o.cp) { i.cp = o.cp; m = true; }
    if (!t(i.bl) && o.bl) { i.bl = o.bl; m = true; }
    if (!temNum(i.en) && o.en && (!t(i.en) || o.en.toLowerCase().includes(t(i.en).toLowerCase()))) { i.en = o.en; m = true; }
    if (!m) continue;
    mudou++;
    // o arquivo de detalhes (book, link) é uma cópia do resumo
    const fd = new URL(`${arq}/${i.c}.json`, D);
    try { const d = JSON.parse(await readFile(fd, 'utf8')); if (d.cp !== i.cp || d.bl !== i.bl || d.en !== i.en) await writeFile(fd, JSON.stringify(Object.assign(d, { cp: i.cp, bl: i.bl, en: i.en }))); } catch (e) {}
  }
  if (mudou) { await writeFile(f, JSON.stringify(j)); preenchidos += mudou; }
}
await writeFile(COFRE, JSON.stringify({ atualizadoEm: new Date().toISOString(), total: Object.keys(cofre).length, c: Object.fromEntries(Object.entries(cofre).sort((a, b) => a[0] < b[0] ? -1 : 1)) }));
const conta = p => Object.keys(cofre).filter(k => k.startsWith(p + ':') && cofre[k].cp).length;
console.log(`Cofre de complementos: ${Object.keys(cofre).length} anúncios (J8 ${conta('j8')}, locação ${conta('j8loc')}, SIS3 ${conta('sis3')}, My Broker ${conta('mybroker')}); preenchidos agora: ${preenchidos}.`);
