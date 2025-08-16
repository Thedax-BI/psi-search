// Compat version: no optional chaining, no template nesting, ES5-ish.

(function(){
  function $(id){ return document.getElementById(id); }

  var qEl = $('q');
  var yearFromEl = $('yearFrom');
  var yearToEl = $('yearTo');
  var oaOnlyEl = $('oaOnly');
  var resultsEl = $('results');
  var savedListEl = $('savedList');
  var btnSearch = $('btnSearch');
  var h_crossref = $('h_crossref');
  var h_pubmed = $('h_pubmed');
  var h_doaj = $('h_doaj');
  var errbar = $('errbar');
  var errmsg = $('errmsg');

  window.addEventListener('error', function(e){
    try{
      errbar.classList.remove('hidden');
      errmsg.textContent = 'Erro de script: ' + (e.message || e.error || 'desconhecido');
    }catch(_){}
  });

  var STORAGE_KEY = 'psisearch_saved_v1';

  function setHealth(el, ok, label){
    if(!el) return;
    if(ok){
      el.textContent = label || 'online';
      el.className = 'px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700';
    } else {
      el.textContent = label || 'offline';
      el.className = 'px-2 py-0.5 rounded-full bg-red-100 text-red-700';
    }
  }

  // Health checks
  function checkCrossref(){
    fetch('https://api.crossref.org/works?rows=0', { cache: 'no-store' })
      .then(function(r){ setHealth(h_crossref, r.ok, r.ok ? 'online' : 'HTTP '+r.status); })
      .catch(function(){ setHealth(h_crossref, false); });
  }
  function checkPubMed(){
    var params = new URLSearchParams({ db:'pubmed', term:'cancer', retmode:'json', retmax:'1' });
    fetch('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?'+params.toString(), { cache: 'no-store' })
      .then(function(r){ setHealth(h_pubmed, r.ok, r.ok ? 'online' : 'HTTP '+r.status); })
      .catch(function(){ setHealth(h_pubmed, false); });
  }
  function checkDOAJ(){
    fetch('https://doaj.org/api/v2/search/articles/test?pageSize=1', { cache: 'no-store' })
      .then(function(r){ setHealth(h_doaj, r.ok, r.ok ? 'online' : 'HTTP '+r.status); })
      .catch(function(){ setHealth(h_doaj, false); });
  }
  checkCrossref(); checkPubMed(); checkDOAJ();

  function loadSaved(){ try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch(e){ return []; } }
  function saveSaved(items){ localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); }

  function firstWord(s){
    try{ return (s || '').split(' ')[0] || 'ref'; }catch(_){ return 'ref'; }
  }
  function bibtex(item){
    var key = firstWord((item.authors && item.authors[0]) || '') .toLowerCase() + (item.year || '');
    var auth = (item.authors || []).join(' and ');
    return '@article{' + key + ',\n' +
           '  title={' + (item.title || '') + '},\n' +
           '  author={' + auth + '},\n' +
           '  journal={' + (item.journal || '') + '},\n' +
           '  year={' + (item.year || '') + '},\n' +
           '  doi={' + (item.doi || '') + '}\n' +
           '}';
  }

  function renderSaved(){
    var saved = loadSaved();
    if(saved.length === 0){
      savedListEl.innerHTML = '<div class="text-gray-500">Nada salvo ainda.</div>';
      return;
    }
    var html = saved.map(function(s){
      return '' +
      '<div class="flex items-start justify-between gap-3">' +
        '<div>' +
          '<div class="text-sm font-medium text-gray-800 line-clamp-2">' + (s.title || '') + '</div>' +
          '<div class="text-xs text-gray-500">' + (((s.authors||[])[0]) || '') + ' et al., ' + (s.year || '') + '</div>' +
        '</div>' +
        '<div class="flex gap-2">' +
          '<button class="rounded-2xl border border-gray-200 px-3 py-1 text-xs" data-action="copy" data-id="' + (s.id || '') + '">BibTeX</button>' +
          '<button class="rounded-2xl border border-gray-200 px-3 py-1 text-xs" data-action="remove" data-id="' + (s.id || '') + '">Remover</button>' +
        '</div>' +
      '</div>';
    }).join('');
    savedListEl.innerHTML = html;
  }

  savedListEl.addEventListener('click', function(e){
    var btn = e.target.closest ? e.target.closest('button') : e.target;
    if(!btn || btn.tagName !== 'BUTTON') return;
    var id = btn.getAttribute('data-id');
    var action = btn.getAttribute('data-action');
    var saved = loadSaved();
    var i, item = null;
    for(i=0;i<saved.length;i++){ if(saved[i].id === id){ item = saved[i]; break; } }
    if(!item) return;
    if(action === 'copy'){
      navigator.clipboard.writeText(bibtex(item));
      btn.textContent = 'Copiado!';
      setTimeout(function(){ btn.textContent = 'BibTeX'; }, 1200);
    }
    if(action === 'remove'){
      var next = saved.filter(function(x){ return x.id !== id; });
      saveSaved(next);
      renderSaved();
    }
  });

  function cleanAbstract(a){ return String(a||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim(); }
  function normalizeTitle(s){ return String(s||'').toLowerCase().replace(/\s+/g,' ').trim(); }

  function classify(r){
    var t = ((r.title||'') + ' ' + (r.abstract||'') + ' ' + (r.type||'')).toLowerCase();
    var type = r.type;
    if (/meta[- ]?analys|meta[- ]?an[aá]lise/.test(t)) type = "Meta-análise";
    else if (/systematic review|revis[aã]o sistem[aá]tica|review\b/.test(t)) type = "Revisão";
    else if (/randomi[sz]ed|ensaio|controlled trial|clinical trial/.test(t)) type = "Ensaio clínico";
    else if (/case study|estudo de caso/.test(t)) type = "Estudo de caso";
    else if (/qualitative|qualitativo/.test(t)) type = type || "Estudo de campo";

    var method = r.method;
    if (/qualitative|qualitativ[oa]/.test(t)) method = "Qualitativo";
    else if (/randomi[sz]ed|trial|quantitativ[oa]|meta-analys/.test(t)) method = "Quantitativo";
    else if (/mixed methods|m[eé]todos mistos|misto/.test(t)) method = "Misto";

    var population = r.population;
    if (/adolescen/.test(t)) population = "Adolescentes";
    else if (/\bchild|crian[cç]a|infantil\b/.test(t)) population = "Crianças";
    else if (/\badult|adulto[s]?\b/.test(t)) population = "Adultos";
    else if (/older|elderly|idoso[s]?/.test(t)) population = "Idosos";
    else if (/caregiver|cuidador|cuidadores/.test(t)) population = "Cuidadores";

    var out = {}; for (var k in r) out[k] = r[k];
    out.type = type; out.method = method; out.population = population;
    return out;
  }

  function dedup(items){
    var byKey = {};
    for(var i=0;i<items.length;i++){
      var r = items[i];
      var doi = (r.doi || '').trim().toLowerCase();
      var key = doi || (normalizeTitle(r.title) + '|' + (r.year || ''));
      if(!byKey[key]) byKey[key] = r;
      else {
        var prev = byKey[key];
        byKey[key] = {
          id: prev.id || r.id,
          title: prev.title || r.title,
          authors: (prev.authors && prev.authors.length) ? prev.authors : r.authors,
          year: prev.year || r.year,
          journal: prev.journal || r.journal,
          doi: prev.doi || r.doi,
          abstract: prev.abstract || r.abstract,
          oa: prev.oa || r.oa,
          language: prev.language || r.language,
          url: prev.url || r.url,
          type: prev.type || r.type,
          method: prev.method || r.method,
          population: prev.population || r.population,
          sources: Array.from(new Set([].concat(prev.sources||[], r.sources||[]))),
        };
      }
    }
    return Object.keys(byKey).map(function(k){ return byKey[k]; });
  }

  function buildFacets(items){
    var f = { year:{}, language:{}, source:{}, type:{}, method:{}, population:{} };
    items.forEach(function(r){
      if(r.year) f.year[r.year] = (f.year[r.year]||0)+1;
      if(r.language){
        var L = String(r.language).toLowerCase();
        f.language[L] = (f.language[L]||0)+1;
      }
      (r.sources||[]).forEach(function(s){ f.source[s] = (f.source[s]||0)+1; });
      if(r.type) f.type[r.type] = (f.type[r.type]||0)+1;
      if(r.method) f.method[r.method] = (f.method[r.method]||0)+1;
      if(r.population) f.population[r.population] = (f.population[r.population]||0)+1;
    });
    return f;
  }

  // API fetchers
  function fetchCrossref(q, y1, y2){
    var params = new URLSearchParams();
    if(q) params.set('query', q);
    params.set('rows', '30');
    params.set('filter', 'from-pub-date:'+y1+'-01-01,until-pub-date:'+y2+'-12-31,type:journal-article');
    var url = 'https://api.crossref.org/works?' + params.toString();
    return fetch(url, { cache: 'no-store' })
      .then(function(r){ if(!r.ok) throw new Error('Crossref HTTP '+r.status); return r.json(); })
      .then(function(j){
        var arr = (j && j.message && j.message.items) ? j.message.items : [];
        return arr.map(function(it){
          var doi = it.DOI || null;
          var title = Array.isArray(it.title) ? it.title[0] : (it.title || '');
          var authors = Array.isArray(it.author) ? it.author.map(function(a){ return [a.family||'', a.given||''].filter(Boolean).join(', '); }) : [];
          var year = (it.issued && it.issued['date-parts'] && it.issued['date-parts'][0] && it.issued['date-parts'][0][0]) ||
                     (it.created && it.created['date-parts'] && it.created['date-parts'][0] && it.created['date-parts'][0][0]) || null;
          var journal = Array.isArray(it['container-title']) ? it['container-title'][0] : (it['container-title'] || '');
          var abstract = cleanAbstract(it.abstract || '');
          var oa = Array.isArray(it.link) && it.link.some(function(l){ return String((l['content-type']||'')).indexOf('pdf') >= 0; });
          var language = it.language || null;
          var url = it.URL || (doi ? ('https://doi.org/' + doi) : null);
          return classify({ id: doi || 'crossref:'+Math.random(), title:title, authors:authors, year:year, journal:journal, doi:doi, abstract:abstract, oa:oa, language:language, url:url, sources:['Crossref'] });
        });
      });
  }

  function fetchPubMed(q, y1, y2){
    var dateTerm = '(\"'+y1+'/01/01\"[Date - Publication] : \"'+y2+'/12/31\"[Date - Publication])';
    var term = q ? (q + ' AND ' + dateTerm) : dateTerm;
    var params = new URLSearchParams({ db:'pubmed', term:term, retmode:'json', retmax:'30', sort:'relevance', tool:'psisearch', email:'psisearch@example.com' });
    var esearchURL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?' + params.toString();
    return fetch(esearchURL, { cache:'no-store' })
      .then(function(r){ if(!r.ok) throw new Error('PubMed esearch HTTP '+r.status); return r.json(); })
      .then(function(sj){
        var ids = (sj && sj.esearchresult && sj.esearchresult.idlist) ? sj.esearchresult.idlist : [];
        if(!ids.length) return [];
        var idStr = ids.slice(0,30).join(',');
        var sumParams = new URLSearchParams({ db:'pubmed', id:idStr, retmode:'json', tool:'psisearch', email:'psisearch@example.com' });
        var esumURL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?' + sumParams.toString();
        return fetch(esumURL, { cache:'no-store' })
          .then(function(r){ if(!r.ok) throw new Error('PubMed esummary HTTP '+r.status); return r.json(); })
          .then(function(ej){
            var root = ej && ej.result || {}; var uids = root.uids || [];
            var out = [];
            for(var i=0;i<uids.length;i++){
              var uid = uids[i]; var it = root[uid]; if(!it) continue;
              var title = it.title || '';
              var authors = Array.isArray(it.authors) ? it.authors.map(function(a){ return a.name; }).filter(Boolean) : [];
              var journal = it.fulljournalname || it.source || '';
              var pubdate = it.pubdate || ''; var m = pubdate.match(/(\d{4})/); var year = m ? Number(m[1]) : null;
              var articleids = Array.isArray(it.articleids) ? it.articleids : []; var doiEntry = articleids.find(function(a){ return a.idtype==='doi'; }); var doi = doiEntry ? doiEntry.value : null;
              var langArr = Array.isArray(it.lang) ? it.lang : []; var langMap = {eng:'en', por:'pt', spa:'es', fra:'fr'}; var language = langMap[langArr[0]] || langArr[0] || null;
              var url = 'https://pubmed.ncbi.nlm.nih.gov/' + uid + '/';
              var abstract = ''; var oa = false; var pubtypes = Array.isArray(it.pubtype) ? it.pubtype.map(String) : [];
              out.push(classify({ id: doi || 'pubmed:'+uid, title:title, authors:authors, year:year, journal:journal, doi:doi, abstract:abstract, oa:oa, language:language, url:url, type: pubtypes[0] || null, sources:['PubMed'] }));
            }
            return out;
          });
      });
  }

  function fetchDOAJ(q, y1, y2){
    function esc(s){ return s.replace(/([+\\-!(){}\\[\\]^"~*?:\\\\/])/g, "\\\\$1"); }
    var parts = []; if(q) parts.push('(' + esc(q) + ')'); parts.push('bibjson.year:['+y1+' TO '+y2+']');
    var query = parts.join(' AND ');
    var url = 'https://doaj.org/api/v2/search/articles/' + encodeURIComponent(query) + '?pageSize=30';
    return fetch(url, { cache:'no-store' })
      .then(function(r){ if(!r.ok) throw new Error('DOAJ HTTP '+r.status); return r.json(); })
      .then(function(j){
        var arr = Array.isArray(j && j.results) ? j.results : [];
        return arr.map(function(it){
          var b = it && it.bibjson || {};
          var title = b.title || '';
          var authors = Array.isArray(b.author) ? b.author.map(function(a){ return a.name; }).filter(Boolean) : [];
          var year = Number(b.year) || null;
          var journal = (b.journal && b.journal.title) || '';
          var idents = Array.isArray(b.identifier) ? b.identifier : []; var doiEntry = idents.find(function(x){ return (x.type||'').toLowerCase()==='doi'; }); var doi = doiEntry ? doiEntry.id : null;
          var abstract = b.abstract || '';
          var lang = (b.journal && b.journal.language && b.journal.language[0]) || b.language || null; var language = Array.isArray(lang) ? (lang[0] || null) : lang;
          var link = Array.isArray(b.link) ? ((b.link.find(function(l){ return (l.type||'').toLowerCase().indexOf('full')>=0; }) || {}).url || (b.link[0] && b.link[0].url) || null) : null;
          var oa = true;
          return classify({ id: doi || 'doaj:'+it.id, title:title, authors:authors, year:year, journal:journal, doi:doi, abstract:abstract, oa:oa, language:language, url: link, sources:['DOAJ'] });
        });
      });
  }

  function search(){
    var q = (qEl.value || '').trim();
    var y1 = Number(yearFromEl.value) || 2019;
    var y2 = Number(yearToEl.value) || 2025;
    var langs = Array.prototype.map.call(document.querySelectorAll('.lang:checked'), function(el){ return el.value; });
    var oaOnly = oaOnlyEl.checked;

    resultsEl.innerHTML = '<div class="text-sm text-gray-600">Buscando…</div>';

    Promise.allSettled([ fetchCrossref(q,y1,y2), fetchPubMed(q,y1,y2), fetchDOAJ(q,y1,y2) ])
      .then(function(res){
        var errors = {}; var arr = [];
        if(res[0].status==='fulfilled') arr = arr.concat(res[0].value); else errors.crossref = String(res[0].reason);
        if(res[1].status==='fulfilled') arr = arr.concat(res[1].value); else errors.pubmed = String(res[1].reason);
        if(res[2].status==='fulfilled') arr = arr.concat(res[2].value); else errors.doaj = String(res[2].reason);

        var merged = dedup(arr);
        if(langs.length){
          var set = {}; langs.forEach(function(x){ set[String(x).toLowerCase()] = true; });
          merged = merged.filter(function(r){ return r.language ? !!set[String(r.language).toLowerCase()] : true; });
        }
        if(oaOnly) merged = merged.filter(function(r){ return !!r.oa; });

        var facets = buildFacets(merged);
        var saved = loadSaved();

        var header = '<div class="rounded-2xl border border-gray-100 bg-white/60 p-3 text-xs text-gray-600 mb-2">' +
                     '<span class="font-medium">Resultados:</span> ' + merged.length +
                     (Object.keys(errors).length ? ' • <span class="text-red-600">Erros: ' + Object.keys(errors).join(', ') + '</span>' : '') +
                     '</div>';

        if(merged.length === 0){
          resultsEl.innerHTML = header + '<div class="rounded-3xl border border-gray-100 bg-white/70 p-6 text-center text-gray-600">Nenhum resultado.</div>';
          return;
        }

        var facetSummary = (Object.keys(facets).length ?
          '<div class="rounded-2xl border border-gray-100 bg-white/60 p-3 text-xs text-gray-600">' +
          '<span class="font-medium">Facetas:</span> ' +
          Object.keys(facets).map(function(k){ return k + '(' + Object.keys(facets[k]).length + ')'; }).join(' · ') +
          '</div>' : '');

        var html = header + facetSummary + merged.map(function(item){
          var isSaved = saved.some(function(s){ return s.id === item.id; });
          var href = item.url ? item.url : (item.doi ? ('https://doi.org/' + item.doi) : '#');
          return '' +
          '<div class="rounded-3xl border border-gray-100 bg-white/70 p-5">' +
            '<div class="flex items-start justify-between gap-4">' +
              '<div class="space-y-2">' +
                '<a href="'+href+'" target="_blank" rel="noreferrer" class="group inline-flex items-start gap-2">' +
                  '<h3 class="text-base font-semibold leading-snug text-gray-800 group-hover:text-indigo-700">' + (item.title || '(sem título)') + '</h3>' +
                  '<span class="text-gray-400">↗</span>' +
                '</a>' +
                '<div class="text-sm text-gray-600">' + (item.authors||[]).join(', ') + ' • ' + (item.journal || '') + ' • ' + (item.year || '') + '</div>' +
                '<div class="flex flex-wrap gap-2 text-xs">' +
                  (item.type ? '<span class="inline-flex items-center rounded-full border border-gray-200 bg-white/70 px-2.5 py-1 text-xs text-gray-700">'+item.type+'</span>' : '') +
                  (item.method ? '<span class="inline-flex items-center rounded-full border border-gray-200 bg-white/70 px-2.5 py-1 text-xs text-gray-700">'+item.method+'</span>' : '') +
                  (item.population ? '<span class="inline-flex items-center rounded-full border border-gray-200 bg-white/70 px-2.5 py-1 text-xs text-gray-700">'+item.population+'</span>' : '') +
                  (item.language ? '<span class="inline-flex items-center rounded-full border border-gray-200 bg-white/70 px-2.5 py-1 text-xs text-gray-700">'+String(item.language).toUpperCase()+'</span>' : '') +
                  (item.oa ? '<span class="inline-flex items-center rounded-full border border-emerald-200 bg-white/70 px-2.5 py-1 text-xs text-emerald-700">Open Access</span>' : '') +
                '</div>' +
                (item.abstract ? '<p class="text-sm text-gray-700">' + item.abstract + '</p>' : '') +
              '</div>' +
              '<div class="flex flex-col items-end gap-2">' +
                '<button class="rounded-2xl ' + (isSaved ? 'bg-amber-500 text-white' : 'bg-indigo-600 text-white') + ' px-3 py-2 text-sm" data-action="save" data-id="'+item.id+'">' + (isSaved?'Salvo':'Salvar') + '</button>' +
                '<button class="rounded-2xl bg-white text-gray-700 border border-gray-200 px-3 py-2 text-sm" data-action="cite" data-id="'+item.id+'">Citar (BibTeX)</button>' +
              '</div>' +
            '</div>' +
            '<div class="mt-2 text-xs text-gray-500">Fonte: ' + ((item.sources||[]).join(', ') || '—') + ' • DOI: ' + (item.doi || '—') + '</div>' +
          '</div>';
        }).join('');

        resultsEl.innerHTML = html;

        Array.prototype.forEach.call(resultsEl.querySelectorAll('button'), function(btn){
          btn.addEventListener('click', function(){
            var id = btn.getAttribute('data-id');
            var action = btn.getAttribute('data-action');
            var dataset = merged.find(function(x){ return x.id === id; });
            if(!dataset) return;
            if(action === 'cite'){
              navigator.clipboard.writeText(bibtex(dataset));
              btn.textContent = 'Copiado!';
              setTimeout(function(){ btn.textContent = 'Citar (BibTeX)'; }, 1200);
            }
            if(action === 'save'){
              var savedNow = loadSaved();
              var has = savedNow.some(function(x){ return x.id === dataset.id; });
              var next = has ? savedNow.filter(function(x){ return x.id !== dataset.id; }) : savedNow.concat([dataset]);
              saveSaved(next);
              renderSaved();
              search();
            }
          });
        });
      })
      .catch(function(err){
        resultsEl.innerHTML = '<div class="rounded-3xl border border-red-100 bg-red-50 p-6 text-sm text-red-700">Erro ao buscar: ' +
                              String(err && err.message || err).replace(/</g,'&lt;') + '</div>';
      });
  }

  btnSearch.addEventListener('click', search);
  qEl.addEventListener('keydown', function(e){ if(e.key === 'Enter') search(); });
  renderSaved();
})();