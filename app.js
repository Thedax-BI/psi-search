import { AGGREGATOR_BASE } from './config.js';

const qEl = document.getElementById('q');
const yearFromEl = document.getElementById('yearFrom');
const yearToEl = document.getElementById('yearTo');
const oaOnlyEl = document.getElementById('oaOnly');
const resultsEl = document.getElementById('results');
const savedListEl = document.getElementById('savedList');
const btnSearch = document.getElementById('btnSearch');

const STORAGE_KEY = 'psisearch_saved_v1';

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

async function search(){
  const q = (qEl.value || '').trim();
  const year_from = Number(yearFromEl.value) || 2019;
  const year_to = Number(yearToEl.value) || 2025;
  const oa = oaOnlyEl.checked ? 'true' : 'false';
  const langs = langFilters();

  resultsEl.innerHTML = `<div class="text-sm text-gray-600">Buscando…</div>`;

  try{
    const url = new URL(`${AGGREGATOR_BASE}/search`);
    url.searchParams.set('q', q);
    url.searchParams.set('year_from', year_from);
    url.searchParams.set('year_to', year_to);
    url.searchParams.set('oa', oa);
    if(langs.length) url.searchParams.set('lang', langs.join(','));

    const resp = await fetch(url.toString());
    const data = await resp.json();

    const saved = loadSaved();
    const langSet = new Set(langs);

    const filtered = (data.results || []).filter(r => {
      if(langs.length && r.language){
        return langSet.has(String(r.language).toLowerCase());
      }
      return true;
    }).filter(r => !oaOnlyEl.checked || !!r.oa);

    if(filtered.length === 0){
      resultsEl.innerHTML = `<div class="rounded-3xl border border-gray-100 bg-white/70 p-6 text-center text-gray-600">Nenhum resultado.</div>`;
      return;
    }

    resultsEl.innerHTML = filtered.map(item => {
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

    // Delegated buttons
    resultsEl.querySelectorAll('button').forEach(btn => btn.addEventListener('click', (e)=>{
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      const dataset = filtered.find(x => x.id === id);
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
        saveSaved(next);
        renderSaved();
        search(); // re-render para atualizar o botão
      }
    }));

  }catch(err){
    console.error(err);
    resultsEl.innerHTML = `<div class="rounded-3xl border border-red-100 bg-red-50 p-6 text-sm text-red-700">Erro ao buscar. Verifique a URL do agregador em <code>config.js</code>.</div>`;
  }
}

btnSearch.addEventListener('click', search);
qEl.addEventListener('keydown', (e)=>{ if(e.key === 'Enter') search(); });

renderSaved();
