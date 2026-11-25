// Opcionais dos apartamentos para filtrar sem abrir um por um (25/11, pedido do Matheus): CHURRASQUEIRA dentro do apartamento.
// Grava dados/opcionais.json: { geradoEm, ch: { "j8:78653": "c", "gon:123": "x" } }  (c = o texto diz que é a carvão; x = tem, sem dizer o tipo)
// - vem do campo "Churrasqueira" do IMÓVEL que a imobiliária marca (a My Broker não tem campo: só o texto) ou do texto do anúncio;
// - não entra a do salão de festas/condomínio nem a que ainda não existe ("previsão para", "espaço para"). Quem não fala, não entra.
// - o mesmo imóvel em duas imobiliárias (dados/repetidos.json): se um anúncio diz, vale para os dois.
// MOBÍLIA (mesmo dia): quem manda é o campo da imobiliária, mas Arya, Corretare, Prates, Pilar e My Broker não separam o semi e a SIS3 e a
// Zireh quase nunca marcam. "mo" = o que o texto do anúncio diz quando o campo é "mobiliado" e o texto diz semi, ou quando o campo está vazio.
// Roda depois de cada atualização (o repetidos.mjs chama no fim). À mão: node scripts/opcionais.mjs [--ver texto|campo|fora N]
import { readFile, writeFile } from 'node:fs/promises';

const D = new URL('../dados/', import.meta.url);
const ARQ = { j8: 'j8', gon: 'goncalves', sis3: 'sis3', zireh: 'zireh', arya: 'arya', prates: 'prates', pilar: 'pilar', entre: 'entre', urbanic: 'urbanic', v6: 'v6', corretare: 'corretare', mybroker: 'mybroker', nn: 'nn', j8loc: 'j8-locacao' };
const APTO = t => /^(apartamento|cobertura)/i.test(String(t || '')), SEM_CAMPO = new Set(['mybroker']);
const norm = s => String(s || '').replace(/&sup2;/g, '2').replace(/&[a-z]+;/g, ' ').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const RX = /churrasqueiras?/g;
const PRIVADO = /sacada|varanda|apartamento|\bapto\b|unidade|privativ|suites?|living|\bsalas?\b|cozinha|quartos?|dormitorio|\bestar\b|jantar|lavabo|lareira|\binterna\b|integrad|cobertura|reiki|\bgarden\b|lavanderia|banheiro|closet|vagas?|adega|segundo (?:piso|pavimento)|piso superior|pavimento superior/g;
const COMUM = /sal(?:ao|oes) de festas|sal(?:ao|oes) gourmet|areas? comu(?:m|ns)|condominio|\bpredio\b|\bedificio (?:possui|conta|oferece|dispoe|tem)|empreendimento|coletiv|quiosque|playground|academia|salao de jogos|brinquedoteca|portaria|bicicletario|coworking|quadra|rooftop|boulevard|fitness|\bpub\b|area de lazer|infraestrutura completa|infraestrutura de lazer/g;
const NAO_TEM = /(?:(?:previsao|preparad[oa]s?|preparacao|possibilidade|nicho|infraestrutura|infra|ponto|tubulacao|dutos?|chamine|espaco|local|opcao)\s+(?:e\s+[a-z]+\s+)?(?:para|p\/|pra)|(?:previsao|possibilidade|preparacao|ponto|nicho|infraestrutura|infra|tubulacao|opcao)\s+(?:de|da)|(?:permit\w+|pode\w*|possivel|autoriza\w*)\s+(?:a\s+)?(?:instal\w+|colocar|colocacao)|sem|nao\s+(?:possui|tem|ha))\s*(?:(?:a|o|uma|instalar|instalacao|colocar|colocacao|futura|de|da)\s+)*$/;
const TIT_COMUM = /^\W*(?:o )?(?:condominio|areas? comu(?:m|ns)|lazer|areas? de lazer|area externa do condominio|infraestrutura|estrutura do|empreendimento|edificio|predio|diferenciais do (?:condominio|empreendimento|predio|edificio)|sobre o (?:condominio|predio|edificio|empreendimento)|facilidades|comodidades)\b.{0,45}$/;
const TIT_COMUM2 = /^\W*(?:o )?(?:destaques|diferenciais|caracteristicas|sobre|comodidades|lazer|estrutura|infraestrutura|itens)\b.{0,25}\b(?:condominio|predio|edificio|empreendimento|lazer)\b.{0,25}$|^\W*condominio clube\b/;
const TIT_PRIVADO = /^\W*(?:o )?(?:apartamento|imovel|unidade|area (?:privativa|interna|social|intima)|caracteristicas|diferenciais|destaques|planta|acabamentos|composicao|detalhes|distribuicao|sobre o (?:apartamento|imovel))\b.{0,45}$/;
const ult = (rx, s) => { let k = -1, m; const r = new RegExp(rx.source, 'g'); while ((m = r.exec(s))) k = m.index; return k; };
// { tem, carvao, trecho } ou { fora: motivo, trecho }
export function leChurrasqueira(texto) {
  const t = norm(texto).split(/alem deste imovel|outras opcoes|veja tambem|mais opcoes de imoveis/)[0];
  let secao = 'p', fora = null, achou = null;
  for (const linha of t.split(/[\r\n]+|•|;|\s\*\s/)) {
    const l = linha.trim(); if (!l) continue;
    if (l.length < 70 && !/churrasq/.test(l)) { if (TIT_COMUM.test(l) || TIT_COMUM2.test(l)) { secao = 'c'; continue; } if (TIT_PRIVADO.test(l)) { secao = 'p'; continue; } }
    if (!/churrasq/.test(l)) continue;
    for (const frase of l.split(/(?<=[.!?])\s+/)) for (const m of frase.matchAll(RX)) {
      const ini = m.index, antes = frase.slice(Math.max(0, ini - 160), ini), dep = frase.slice(ini + m[0].length, ini + m[0].length + 60), trecho = frase.slice(Math.max(0, ini - 80), ini + 70);
      if (NAO_TEM.test(antes.slice(-60))) { fora = fora || { fora: 'ainda nao existe', trecho }; continue; }
      // de que lugar se fala: o último citado antes; se nenhum, a seção do texto; e o que vem logo depois manda ("na sacada", "no salão")
      const kp = ult(PRIVADO, antes), kc = ult(COMUM, antes); let onde = kp < 0 && kc < 0 ? secao : kc > kp ? 'c' : 'p';
      const d = dep.match(/^\s*(?:(?:a|à) (?:carvao|gas)|eletrica|e \w+|completa|propria|privativa|gourmet|,)?\s*(?:na|no|nas|nos|da|do|em)\s+([a-z ]{0,40})/);
      if (d && /^(?:(?:ampla|sua|propria|grande)\s+)?(?:sacada|varanda|apartamento|living|sala|unidade|cozinha|area privativa|area gourmet)/.test(d[1])) onde = 'p';
      if (d && /^(?:salao|saloes|areas? comu|condominio|predio|rooftop|quiosque|terraco do|area de lazer)/.test(d[1])) onde = 'c';
      if (/(?:sal(?:ao|oes) de festas?|sal(?:ao|oes) gourmet|quiosques?|areas? de lazer|area comum)[^.;]{0,40}$/.test(antes) && !/(?:sacada|varanda|apartamento|living|privativ)[^.;]{0,35}$/.test(antes)) onde = 'c';
      if (/(?:sacadas?|varandas?)\b[^.;,]{0,40}$/.test(antes)) onde = 'p';
      if (/^\s*(?:coletiva|comunitaria|condominial|do condominio|do predio|do salao)/.test(dep)) onde = 'c';
      if (/^[^.]{0,30}exaust|^[^.]{0,25}(?:integrad|reiki|privativ)/.test(dep)) onde = 'p'; // exaustão e 'integrada' são de dentro do apartamento
      if (onde === 'c') { fora = fora || { fora: 'area comum', claro: kp >= 0 || kc >= 0 || /^\s*(?:coletiva|comunitaria|condominial|d[oe] )/.test(dep), trecho }; continue; }
      const carvao = /^\W*(?:(?:propria|privativa|interna|gourmet|estilo \w+|tipo \w+|,)\s*)*(?:a |à |de |em |\()?\s*carvao|^\s*a ?carvao/.test(dep);
      achou = { tem: true, carvao: carvao || !!(achou && achou.carvao), trecho: achou && achou.carvao ? achou.trecho : trecho };
    }
  }
  return achou || fora || {};
}

const IMO = 'apartamento|apto|casa|sobrado|imovel|cobertura|studio|loft|garden|duplex|triplex|unidade|flat|residencia';
const SEMI = /\b(?:semi[\s-]*mobili(?:ad[oa]s?|a)\b|parcialmente mobiliad[oa])/;
const FULL = new RegExp('(?:\\b(?:' + IMO + ')\\b(?:\\s+(?:esta|e|foi|sera|ja|todo|toda|totalmente|completo|completa|completamente|inteiramente|100%|novo|nova|amplo|ampla|impecavel|lindo|linda|lindamente|finamente|duplex|garden|reformad[oa]|e|,|entregue|vendid[oa]))*\\s+mobiliad[oa]\\b|\\b(?:totalmente|completamente|inteiramente|todo|toda|100%|lindamente|finamente)\\s+mobiliad[oa]\\b|\\bporteira[ -]fechada|\\b(?:entregue|vendid[oa]|venda|vende-se|locad[oa])\\s+(?:totalmente\\s+|todo\\s+|ja\\s+)?mobiliad[oa]\\b|^\\W*mobiliad[oa]\\W*$)', 'm');
const NAO = /(?:\bnao\b|\bsem\b|opcao|opcional|possibilidade|possivel|pode(?:ndo)?|caso|negoci\w*|consult\w*|a parte|salao|areas? comu\w*|decorad[oa] de|condominio|lavanderia|academia|lobby|hall|cozinha|lazer|interessad\w+)[^.\n]{0,28}$/;
export function leMobilia(texto) {
  const t = norm(texto).split(/alem deste imovel|outras opcoes|veja tambem/)[0];
  for (const [v, rx] of [['m', SEMI], ['s', FULL]]) for (const m of t.matchAll(new RegExp(rx.source, 'gm'))) {
    const antes = t.slice(Math.max(0, m.index - 70), m.index), dep = t.slice(m.index + m[0].length, m.index + m[0].length + 45);
    if (NAO.test(antes) || /^\s*(?:nao|ou sem|ou nao|opcional|se desejar|a negociar|a parte|negociavel)|^[^.\n]{0,20}(?:a parte|negoci|opcional|nao inclu)/.test(dep)) continue;
    return [v, (antes + '>>' + m[0] + '<<' + dep).replace(/\s+/g, ' ')];
  }
  return ['', ''];
}

const ver = process.argv.includes('--ver') ? process.argv[process.argv.indexOf('--ver') + 1] : '';
let grupos = []; try { grupos = JSON.parse(await readFile(new URL('repetidos.json', D), 'utf8')).grupos || []; } catch (e) {}
const ch = {}, mo = {}, conta = {}, lista = [];
for (const [src, arq] of Object.entries(ARQ)) {
  let j; try { j = JSON.parse(await readFile(new URL(arq + '.json', D), 'utf8')); } catch (e) { continue; }
  const c = conta[src] = { n: 0, campo: 0, texto: 0, carvao: 0 };
  for (const i of j.imoveis) {
    let d; try { d = JSON.parse(await readFile(new URL(`${arq}/${i.c}.json`, D), 'utf8')); } catch (e) { continue; }
    const texto = [d.ti || i.ti, d.intro, d.descricao, ...[].concat(d.texto || [])].filter(Boolean).join('\n'), k = src + ':' + i.c, m = leMobilia(texto)[0];
    if (m && (i.mo === 's' ? m === 'm' : i.mo !== 'm')) { mo[k] = m; c.mo = (c.mo || 0) + 1; }
    if (!APTO(i.t)) continue; c.n++;
    const r = leChurrasqueira(texto);
    const campo = !SEM_CAMPO.has(src) && (d.itens || []).some(x => /churrasq/i.test(x)) && !(r.fora === 'ainda nao existe' || r.fora === 'area comum' && r.claro); // o texto só fala da do prédio: não vale o campo
    if (campo || r.tem) { ch[k] = r.carvao ? 'c' : 'x'; c[campo ? 'campo' : 'texto']++; if (r.carvao) c.carvao++; }
    if (campo && !r.tem) lista.push(['campo', k, r.fora || 'so o campo', r.trecho || '']); else if (r.tem && !campo) lista.push(['texto', k, r.carvao ? 'carvao' : '', r.trecho]); else if (r.fora) lista.push(['fora', k, r.fora, r.trecho]);
  }
}
let irmaos = 0;
for (const g of grupos) { const v = g.map(k => ch[k]).filter(Boolean); if (!v.length) continue; const m = v.includes('c') ? 'c' : 'x'; for (const k of g) { if (!ch[k]) irmaos++; ch[k] = m; } }
if (ver) { const N = +process.argv[process.argv.indexOf('--ver') + 2] || 60, l = lista.filter(x => x[0] === ver), p = Math.max(1, Math.floor(l.length / N)); console.log(ver, l.length); l.filter((x, k) => k % p === 0).forEach(x => console.log(x[1], `[${x[2]}]`, String(x[3]).replace(/\s+/g, ' '))); }
else await writeFile(new URL('opcionais.json', D), JSON.stringify({ geradoEm: new Date().toISOString(), ch: Object.fromEntries(Object.entries(ch).sort((a, b) => a[0] < b[0] ? -1 : 1)), mo }));
console.log(`Churrasqueira no apartamento: ${Object.keys(ch).length} (${Object.values(ch).filter(x => x === 'c').length} a carvão; ${irmaos} pelo anúncio da outra imobiliária).`);
console.log(`Mobília acertada pelo texto: ${Object.values(mo).filter(x => x === 'm').length} semi, ${Object.values(mo).filter(x => x === 's').length} mobiliados.`);
console.log(Object.entries(conta).map(([s, c]) => `${s} ${c.campo + c.texto}/${c.n} (campo ${c.campo}, texto ${c.texto})`).join(' · '));
