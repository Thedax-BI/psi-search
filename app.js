// PsiSearch — GitHub-only (no backend).
// Faz chamadas diretas às APIs: Crossref, PubMed (esearch+esummary), DOAJ.
// Notas: eFetch (abstract) pode não permitir CORS — não utilizado aqui.

const qEl = document.getElementById('q');
const yearFromEl = document.getElementById('yearFrom');
const yearToEl = document.getElementById('yearTo');
const oaOnlyEl = document.getElementById('oaOnly');
const resultsEl = document.getElementById('results');
const savedListEl = document.getElementById('savedList');
const btnSearch = document.getElementById('btnSearch');

const h_crossref = document.getElementById('h_crossref');
const h_pubmed = document.getElementById('h_pubmed');
const h_doaj = document.getElementById('h_doaj');

const STORAGE_KEY = 'psisearch_saved_v1';

function setHealth(el, ok, label){
  if(ok){
    el.textContent = label || 'online';
    el.className = 'px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700';
  } else {
    el.textContent = label || 'offline';
    el.className = 'px-2 py-0.5 rounded-full bg-red-100 text-red-700';
  }
}

// ---- Health checks (HEAD/GET leve) ----
async function checkCrossref(){
  try{
    const r = await fetch('https://api.crossref.org/works?rows=0', { cache: 'no-store' });
    setHealth(h_crossref, r.ok, r.ok ? 'online' : `HTTP ${r.status}`);
  }catch{ setHealth(h_crossref, false); }
}
async function checkPubMed(){
  try{
    const params = new URLSearchParams({ db:'pubmed', term:'cancer', retmode:'json', retmax:'1' });
    const r = await fetch(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?${params.toString()}`, { cache: 'no-store' });
    setHealth(h_pubmed, r.ok, r.ok ? 'online' : `HTTP ${r.status}`);
  }catch{ setHealth(h_pubmed, false); }
}
async function checkDOAJ(){
  try{
    const url = `https://doaj.org/api/v2/search/articles/test?pageSize=1`;
    const r = await fetch(url, { cache: 'no-store' });
    setHealth(h_doaj, r.ok, r.ok ? 'online' : `HTTP ${r.status}`);
  }catch{ setHealth(h_doaj, false); }
}

checkCrossref(); checkPubMed(); checkDOAJ();

function loadSaved() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}
function saveSaved(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function bibtex(item){
  const key = (item.authors?.[0]?.split(' ')?.[0] || 'ref').toLowerCase() + (item.year || '');
  const auth = (item.authors || []).join(' and ');
  return `@article{${key},
  title={${item.title}},
  author={${auth}},
  journal={${item.journal || ''}},
  year={${item.year || ''}},
  doi={${item.doi || ''}}
}`;
}

function renderSaved(){
  const saved = loadSaved();
  if(saved.length === 0){
    savedListEl.innerHTML = '<div class="text-gray-500">Nada salvo ainda.</div>';
    return;
  }
  savedListEl.innerHTML = saved.map(s => `
    <div class="flex items-start justify-between gap-3">
      <div>
        <div class="text-sm font-medium text-gray-800 line-clamp-2">${s.title}</div>
        <div class="text-xs text-gray-500">${(s.authors?.[0]||'')} et al., ${s.year || ''}</div>
      </div>
      <div class="flex gap-2">
        <button class="rounded-2xl border border-gray-200 px-3 py-1 text-xs" data-action="copy" data-id="${s.id}">BibTeX</button>
        <button class="rounded-2xl border border-gray-200 px-3 py-1 text-xs" data-action="remove" data-id="${s.id}">Remover</button>
      </div>
    </div>
  `).join('');
}

savedListEl.addEventListener('click', (e)=>{
  const btn = e.target.closest('button');
  if(!btn) return;
  const id = btn.dataset.id;
  const action = btn.dataset.action;
  const saved = loadSaved();
  const item = saved.find(x => x.id === id);
  if(!item) return;
  if(action === 'copy'){
    navigator.clipboard.writeText(bibtex(item));
    btn.textContent = 'Copiado!';
    setTimeout(()=> btn.textContent = 'BibTeX', 1200);
  }
  if(action === 'remove'){
    saveSaved(saved.filter(x => x.id !== id));
    renderSaved();
  }
});

function langFilters(){
  return Array.from(document.querySelectorAll('.lang:checked')).map(el=>el.value);
}

// ---- Fetchers (direto nas APIs) ----
function cleanAbstract(a){ return String(a||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim(); }

function normalizeTitle(s){ return String(s||'').toLowerCase().replace(/\s+/g,' ').trim(); }

function classify(r){
  const t = `${r.title||''} ${r.abstract||''} ${r.type||''}`.toLowerCase();
  let type = r.type;
  if (/meta[- ]?analys|meta[- ]?an[aá]lise/.test(t)) type = "Meta-análise";
  else if (/systematic review|revis[aã]o sistem[aá]tica|review\b/.test(t)) type = "Revisão";
  else if (/randomi[sz]ed|ensaio|controlled trial|clinical trial/.test(t)) type = "Ensaio clínico";
  else if (/case study|estudo de caso/.test(t)) type = "Estudo de caso";
  else if (/qualitative|qualitativo/.test(t)) type = type || "Estudo de campo";

  let method = r.method;
  if (/qualitative|qualitativ[oa]/.test(t)) method = "Qualitativo";
  else if (/randomi[sz]ed|trial|quantitativ[oa]|meta-analys/.test(t)) method = "Quantitativo";
  else if (/mixed methods|m[eé]todos mistos|misto/.test(t)) method = "Misto";

  let population = r.population;
  if (/adolescen/.test(t)) population = "Adolescentes";
  else if (/\bchild|crian[cç]a|infantil\b/.test(t)) population = "Crianças";
  else if (/\badult|adulto[s]?\b/.test(t)) population = "Adultos";
  else if (/older|elderly|idoso[s]?/.test(t)) population = "Idosos";
  else if (/caregiver|cuidador|cuidadores/.test(t)) population = "Cuidadores";

  return { ...r, type, method, population };
}

function dedup(items){
  const byKey = new Map();
  for(const r of items){
    const doi = (r.doi||'').trim().toLowerCase();
    const key = doi || (normalizeTitle(r.title)+'|'+(r.year||''));
    if(!byKey.has(key)) byKey.set(key, r);
    else {
      const prev = byKey.get(key);
      byKey.set(key, {
        ...prev,
        title: prev.title || r.title,
        authors: prev.authors?.length ? prev.authors : r.authors,
        journal: prev.journal || r.journal,
        abstract: prev.abstract || r.abstract,
        language: prev.language || r.language,
        url: prev.url || r.url,
        oa: prev.oa || r.oa,
        sources: Array.from(new Set([...(prev.sources||[]), ...(r.sources||[])])),
      });
    }
  }
  return Array.from(byKey.values());
}

function buildFacets(items){
  const f = { year:{}, language:{}, source:{}, type:{}, method:{}, population:{} };
  for(const r of items){
    if(r.year) f.year[r.year] = (f.year[r.year]||0)+1;
    if(r.language){ const L = String(r.language).toLowerCase(); f.language[L] = (f.language[L]||0)+1; }
    (r.sources||[]).forEach(s => f.source[s] = (f.source[s]||0)+1);
    if(r.type) f.type[r.type] = (f.type[r.type]||0)+1;
    if(r.method) f.method[r.method] = (f.method[r.method]||0)+1;
    if(r.population) f.population[r.population] = (f.population[r.population]||0)+1;
  }
  return f;
}

async function fetchCrossref(q, y1, y2){
  const params = new URLSearchParams();
  if(q) params.set('query', q);
  params.set('rows', '30');
  params.set('filter', `from-pub-date:${y1}-01-01,until-pub-date:${y2}-12-31,type:journal-article`);
  const url = `https://api.crossref.org/works?${params.toString()}`;
  const r = await fetch(url, { cache: 'no-store' });
  if(!r.ok) throw new Error('Crossref HTTP '+r.status);
  const j = await r.json();
  return (j?.message?.items||[]).map(it=>{
    const doi = it.DOI || null;
    const title = Array.isArray(it.title) ? it.title[0] : it.title || "";
    const authors = Array.isArray(it.author) ? it.author.map(a => [a.family||'', a.given||''].filter(Boolean).join(', ')) : [];
    const year = it.issued?.["date-parts"]?.[0]?.[0] || it.created?.["date-parts"]?.[0]?.[0] || null;
    const journal = Array.isArray(it["container-title"]) ? it["container-title"][0] : it["container-title"] || "";
    const abstract = cleanAbstract(it.abstract || "");
    const oa = Array.isArray(it.link) && it.link.some(l => String(l["content-type"]||"").includes("pdf"));
    const language = it.language || null;
    const url = it.URL || (doi ? `https://doi.org/${doi}` : null);
    return classify({ id: doi || `crossref:${Math.random()}`, title, authors, year, journal, doi, abstract, oa, language, url, sources:['Crossref'] });
  });
}

async function fetchPubMed(q, y1, y2){
  const dateTerm = `("${y1}/01/01"[Date - Publication] : "${y2}/12/31"[Date - Publication])`;
  const term = q ? `${q} AND ${dateTerm}` : dateTerm;
  const params = new URLSearchParams({ db:'pubmed', term, retmode:'json', retmax:'30', sort:'relevance', tool:'psisearch', email:'psisearch@example.com' });
  const esearchURL = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?${params.toString()}`;
  const s = await fetch(esearchURL, { cache:'no-store' });
  if(!s.ok) throw new Error('PubMed esearch HTTP '+s.status);
  const sj = await s.json();
  const ids = sj?.esearchresult?.idlist || [];
  if(!ids.length) return [];
  const idStr = ids.slice(0,30).join(',');
  const sumParams = new URLSearchParams({ db:'pubmed', id:idStr, retmode:'json', tool:'psisearch', email:'psisearch@example.com' });
  const esumURL = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?${sumParams.toString()}`;
  const e = await fetch(esumURL, { cache:'no-store' });
  if(!e.ok) throw new Error('PubMed esummary HTTP '+e.status);
  const ej = await e.json();
  const root = ej?.result || {}; const uids = root.uids || [];
  return uids.map(uid => {
    const it = root[uid]; if(!it) return null;
    const title = it.title || "";
    const authors = Array.isArray(it.authors) ? it.authors.map(a=>a.name).filter(Boolean) : [];
    const journal = it.fulljournalname || it.source || "";
    const pubdate = it.pubdate || ""; const m = pubdate.match(/(\d{4})/); const year = m? Number(m[1]): null;
    const articleids = Array.isArray(it.articleids) ? it.articleids : []; const doiEntry = articleids.find(a => a.idtype==='doi'); const doi = doiEntry ? doiEntry.value : null;
    const langArr = Array.isArray(it.lang) ? it.lang : []; const language = ({eng:'en', por:'pt', spa:'es', fra:'fr'})[langArr[0]] || langArr[0] || null;
    const url = `https://pubmed.ncbi.nlm.nih.gov/${uid}/`;
    const abstract = ""; const oa = false; const pubtypes = Array.isArray(it.pubtype)? it.pubtype.map(String):[];
    return classify({ id: doi || `pubmed:${uid}`, title, authors, year, journal, doi, abstract, oa, language, url, type: pubtypes[0]||null, sources:['PubMed'] });
  }).filter(Boolean);
}

async function fetchDOAJ(q, y1, y2){
  const parts = []; if(q) parts.push(`(${q.replace(/([+\\-!(){}\\[\\]^"~*?:\\\\/])/g, "\\$1")})`); parts.push(`bibjson.year:[${y1} TO ${y2}]`);
  const query = parts.join(' AND ');
  const url = `https://doaj.org/api/v2/search/articles/${encodeURIComponent(query)}?pageSize=30`;
  const r = await fetch(url, { cache:'no-store' });
  if(!r.ok) throw new Error('DOAJ HTTP '+r.status);
  const j = await r.json();
  const arr = Array.isArray(j?.results) ? j.results : [];
  return arr.map(it => {
    const b = it?.bibjson || {};
    const title = b.title || "";
    const authors = Array.isArray(b.author) ? b.author.map(a=>a.name).filter(Boolean) : [];
    const year = Number(b.year) || null;
    const journal = b.journal?.title || "";
    const idents = Array.isArray(b.identifier) ? b.identifier : []; const doiEntry = idents.find(x => (x.type||'').toLowerCase()==='doi'); const doi = doiEntry? doiEntry.id : null;
    const abstract = b.abstract || "";
    const lang = (b.journal?.language && b.journal.language[0]) || b.language || null; const language = Array.isArray(lang) ? (lang[0]||null) : lang;
    const link = Array.isArray(b.link) ? (b.link.find(l => (l.type||'').toLowerCase().includes('full'))?.url || b.link[0]?.url) : null;
    const oa = true;
    return classify({ id: doi || `doaj:${it.id}`, title, authors, year, journal, doi, abstract, oa, language, url: link, sources:['DOAJ'] });
  });
}

// ---- Search orchestrator ----
async function search(){
  const q = (qEl.value || '').trim();
  const y1 = Number(yearFromEl.value) || 2019;
  const y2 = Number(yearToEl.value) || 2025;
  const langs = Array.from(document.querySelectorAll('.lang:checked')).map(el=>el.value);
  const oaOnly = oaOnlyEl.checked;

  resultsEl.innerHTML = `<div class="text-sm text-gray-600">Buscando…</div>`;

  try{
    const [c, p, d] = await Promise.allSettled([
      fetchCrossref(q, y1, y2),
      fetchPubMed(q, y1, y2),
      fetchDOAJ(q, y1, y2)
    ]);

    const errors = {};
    const arr = [];
    if(c.status==='fulfilled') arr.push(...c.value); else errors.crossref = String(c.reason);
    if(p.status==='fulfilled') arr.push(...p.value); else errors.pubmed = String(p.reason);
    if(d.status==='fulfilled') arr.push(...d.value); else errors.doaj = String(d.reason);

    // dedup + facets
    let merged = dedup(arr);
    if(langs.length){
      const set = new Set(langs);
      merged = merged.filter(r => r.language ? set.has(String(r.language).toLowerCase()) : true);
    }
    if(oaOnly) merged = merged.filter(r => !!r.oa);

    const facets = buildFacets(merged);
    const saved = loadSaved();

    const header = `
      <div class="rounded-2xl border border-gray-100 bg-white/60 p-3 text-xs text-gray-600 mb-2">
        <span class="font-medium">Resultados:</span> ${merged.length}
        ${Object.keys(errors).length ? ` • <span class="text-red-600">Erros: ${Object.keys(errors).join(', ')}</span>` : ''}
      </div>`;

    if(merged.length === 0){
      resultsEl.innerHTML = header + `<div class="rounded-3xl border border-gray-100 bg-white/70 p-6 text-center text-gray-600">Nenhum resultado.</div>`;
      return;
    }

    const facetSummary = Object.keys(facets).length
      ? `<div class="rounded-2xl border border-gray-100 bg-white/60 p-3 text-xs text-gray-600">
           <span class="font-medium">Facetas:</span>
           ${Object.entries(facets).map(([k,v]) => `${k}(${Object.keys(v).length})`).join(' · ')}
         </div>`
      : '';

    resultsEl.innerHTML = header + facetSummary + merged.map(item => {
      const isSaved = saved.some(s => s.id === item.id);
      return `
        <div class="rounded-3xl border border-gray-100 bg-white/70 p-5">
          <div class="flex items-start justify-between gap-4">
            <div class="space-y-2">
              <a href="${item.url || (item.doi ? `https://doi.org/${item.doi}` : '#')}" target="_blank" rel="noreferrer" class="group inline-flex items-start gap-2">
                <h3 class="text-base font-semibold leading-snug text-gray-800 group-hover:text-indigo-700">${item.title || '(sem título)'}</h3>
                <span class="text-gray-400">↗</span>
              </a>
              <div class="text-sm text-gray-600">${(item.authors || []).join(', ')} • ${item.journal || ''} • ${item.year || ''}</div>
              <div class="flex flex-wrap gap-2 text-xs">
                ${item.type ? `<span class="inline-flex items-center rounded-full border border-gray-200 bg-white/70 px-2.5 py-1 text-xs text-gray-700">${item.type}</span>`: ''}
                ${item.method ? `<span class="inline-flex items-center rounded-full border border-gray-200 bg-white/70 px-2.5 py-1 text-xs text-gray-700">${item.method}</span>`: ''}
                ${item.population ? `<span class="inline-flex items-center rounded-full border border-gray-200 bg-white/70 px-2.5 py-1 text-xs text-gray-700">${item.population}</span>`: ''}
                ${item.language ? `<span class="inline-flex items-center rounded-full border border-gray-200 bg-white/70 px-2.5 py-1 text-xs text-gray-700">${String(item.language).toUpperCase()}</span>`: ''}
                ${item.oa ? `<span class="inline-flex items-center rounded-full border border-emerald-200 bg-white/70 px-2.5 py-1 text-xs text-emerald-700">Open Access</span>`: ''}
              </div>
              ${item.abstract ? `<p class="text-sm text-gray-700">${item.abstract}</p>`: ''}
            </div>
            <div class="flex flex-col items-end gap-2">
              <button class="rounded-2xl ${isSaved? 'bg-amber-500 text-white':'bg-indigo-600 text-white'} px-3 py-2 text-sm" data-action="save" data-id="${item.id}">${isSaved?'Salvo':'Salvar'}</button>
              <button class="rounded-2xl bg-white text-gray-700 border border-gray-200 px-3 py-2 text-sm" data-action="cite" data-id="${item.id}">Citar (BibTeX)</button>
            </div>
          </div>
          <div class="mt-2 text-xs text-gray-500">Fonte: ${item.sources?.join(', ') || '—'} • DOI: ${item.doi || '—'}</div>
        </div>`;
    }).join('');

    // Button handlers
    resultsEl.querySelectorAll('button').forEach(btn => btn.addEventListener('click', (e)=>{
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      const dataset = merged.find(x => x.id === id);
      if(!dataset) return;
      if(action === 'cite'){
        navigator.clipboard.writeText(bibtex(dataset));
        btn.textContent = 'Copiado!';
        setTimeout(()=> btn.textContent = 'Citar (BibTeX)', 1200);
      }
      if(action === 'save'){
        const savedNow = loadSaved();
        const has = savedNow.some(x => x.id === dataset.id);
        const next = has ? savedNow.filter(x => x.id !== dataset.id) : [...savedNow, dataset];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        renderSaved();
        search(); // re-render para atualizar o botão
      }
    }));

  }catch(err){
    console.error(err);
    resultsEl.innerHTML = `<div class="rounded-3xl border border-red-100 bg-red-50 p-6 text-sm text-red-700">Erro ao buscar: ${String(err.message || err).replace(/</g,'&lt;')}</div>`;
  }
}

btnSearch.addEventListener('click', search);
qEl.addEventListener('keydown', (e)=>{ if(e.key === 'Enter') search(); });

renderSaved();
