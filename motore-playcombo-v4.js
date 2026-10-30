
const GIOCHI_PER_PAGINA = 60;
const EAGER_COUNT = 12;                 // poche immagini caricate subito
const DEBOUNCE_MS = 250;
let paginaCorrente = 1;
let categoriaAttuale = 'Tutti';
let lista = Array.isArray(window.listaGiochi) ? window.listaGiochi.slice() : [];
let giochiFiltrati = [];
let searchTimeout = null;
let imageObserver = null;

// normalize once for fast searches
function normalizeList(arr) {
    return arr.map((g, i) => Object.assign({}, g, {
        __titleLower: (g.titolo || '').toLowerCase(),
        __catLower: (g.categoria || '').toLowerCase(),
        __idx: i
    }));
}

function createImageObserver() {
    if (imageObserver) return imageObserver;
    imageObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            const img = entry.target;
            const data = img.dataset.src;
            if (data) {
                img.src = data;
                delete img.dataset.src;
            }
            imageObserver.unobserve(img);
        });
    }, { root: null, rootMargin: '300px 0px', threshold: 0.01 });
    return imageObserver;
}

function tinyPlaceholder() {
    return 'data:image/svg+xml;utf8,' +
        encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10"><rect width="100%" height="100%" fill="#222"/></svg>');
}

// Copertine ridimensionate e convertite in WebP da wsrv.nl
function ottimizzaImg(url) {
    if (!url || url.indexOf('http') !== 0) return url;
    // gamepix le manda gia' piccole: le lasciamo cosi'
    if (url.indexOf('img.gamepix.com') !== -1) return url;
    return 'https://wsrv.nl/?url=' + encodeURIComponent(url) + '&w=240&output=webp&q=75';
}

function imgErrorHandler() {
    // se wsrv.nl non risponde, riprova con l'immagine originale
    if (this.dataset.orig && this.src.indexOf('wsrv.nl') !== -1) {
        this.src = this.dataset.orig;
        delete this.dataset.orig;
        return;
    }
    this.onerror = null;
    this.src = 'data:image/svg+xml;utf8,' +
        encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100%" height="100%" fill="#222"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#666" font-family="sans-serif" font-size="12">No Img</text></svg>');
}

// safe text content for preview (avoid innerHTML)
function buildPreviewContent(gioco) {
    const titolo = gioco.titolo || 'Gioco';
    const desc = gioco.desc || 'Gioca gratis!';
    const container = document.createElement('div');
    const h3 = document.createElement('h3');
    h3.textContent = titolo;
    const box = document.createElement('div');
    box.id = 'box-descrizione';
    box.textContent = desc;
    container.appendChild(h3);
    container.appendChild(box);
    return container;
}

function renderPagination(totalePagine) {
    const infoPagina = document.getElementById('info-pagina');
    if (!infoPagina) return;
    // build minimal DOM once
    const frag = document.createDocumentFragment();
    const current = paginaCorrente;
    const last = totalePagine || 1;

    const makePageNode = (i, isCurrent) => {
        const node = document.createElement(isCurrent ? 'strong' : 'button');
        node.type = isCurrent ? undefined : 'button';
        node.className = isCurrent ? 'pagina-attiva' : 'pagina-button';
        node.textContent = String(i);
        if (!isCurrent) node.dataset.page = String(i);
        return node;
    };

    let addedDots = false;
    for (let i = 1; i <= last; i++) {
        if (i === 1 || i === last || (i >= current - 2 && i <= current + 2)) {
            frag.appendChild(makePageNode(i, i === current));
            addedDots = false;
        } else if (!addedDots && (i === current - 3 || i === current + 3)) {
            const dots = document.createElement('span');
            dots.className = 'puntini';
            dots.textContent = '...';
            frag.appendChild(dots);
            addedDots = true;
        }
    }
    infoPagina.innerHTML = '';
    infoPagina.appendChild(frag);
}

function mostraPagina(pagina) {
    const griglia = document.querySelector('.griglia-giochi-spc');
    if (!griglia) return;
    // normalize page bounds
    const totalePagine = Math.max(1, Math.ceil(giochiFiltrati.length / GIOCHI_PER_PAGINA));
    pagina = Math.min(Math.max(1, pagina), totalePagine);
    paginaCorrente = pagina;

    const inizio = (pagina - 1) * GIOCHI_PER_PAGINA;
    const fine = inizio + GIOCHI_PER_PAGINA;
    const giochiDaMostrare = giochiFiltrati.slice(inizio, fine);

    // defer heavy DOM work to idle if possible
    const work = () => {
        griglia.innerHTML = '';
        const fragment = document.createDocumentFragment();
        const observer = createImageObserver();

        giochiDaMostrare.forEach((gioco, idx) => {
            const div = document.createElement('div');
            div.className = 'scheda-gioco-figura';
            div.tabIndex = 0;
            // store index relative to giochiFiltrati for delegation
            div.dataset.index = String(inizio + idx);

            const img = document.createElement('img');
            img.alt = (gioco.titolo || 'Gioco');
            img.decoding = 'async';
            img.width = 105;
            img.height = 105;
            img.style.width = '100%';
            img.style.height = 'auto';
            img.loading = (idx < EAGER_COUNT) ? 'eager' : 'lazy';
            if (idx < EAGER_COUNT) img.fetchPriority = 'high';

            const src = ottimizzaImg(gioco.img || '');
            if (gioco.img) img.dataset.orig = gioco.img;
            if (idx < EAGER_COUNT) {
                img.src = src || tinyPlaceholder();
            } else {
                // lightweight placeholder, real src in data-src
                img.src = tinyPlaceholder();
                img.dataset.src = src || '';
                observer.observe(img);
            }

            img.onerror = imgErrorHandler;
            div.appendChild(img);
            fragment.appendChild(div);
        });

        griglia.appendChild(fragment);
        renderPagination(totalePagine);

        const btnPrec = document.getElementById('btn-precedente');
        const btnSucc = document.getElementById('btn-successiva');
        if (btnPrec) btnPrec.disabled = (pagina === 1);
        if (btnSucc) btnSucc.disabled = (pagina === totalePagine);
    };

    // prima pagina subito (LCP), le successive quando il browser e' libero
    if (pagina === 1 || !('requestIdleCallback' in window)) {
        work();
    } else {
        requestIdleCallback(() => work(), { timeout: 500 });
    }
}

// ===== HOME A RIGHE (stile Poki): attiva solo sulla home e solo senza ricerca =====
const RIGA_MAX = 30;   // 30 giochi mostrati per ogni riga
const CATEGORIE_HOME = [
    { key: 'puzzle', titolo: 'Puzzle', url: 'https://playcombo.it/puzzle/' },
    { key: 'shooter', titolo: 'Sparabolle', url: 'https://playcombo.it/sparabolle/' },
    { key: 'arcade', titolo: 'Arcade', url: 'https://playcombo.it/arcade/' },
    { key: 'match-3', titolo: 'Match-3', url: 'https://playcombo.it/match-3/' },
    { key: 'memory', titolo: 'Mahjong', url: 'https://playcombo.it/MAHJONG/' },
    { key: 'trivia', titolo: 'Quizzzz!', url: 'https://playcombo.it/quizzzz/' },
    { key: 'gamesforgirls', titolo: 'Girls', url: 'https://playcombo.it/GIRLS/' },
    { key: 'sports', titolo: 'Sport', url: 'https://playcombo.it/SPORT/' },
    { key: 'racing', titolo: 'Giochi di corse', url: 'https://playcombo.it/giochi-di-corse/' },
    { key: 'card', titolo: 'Carte e memory', url: 'https://playcombo.it/carte-e-memory/' },
    { key: 'adventure', titolo: "Giochi d'avventura", url: 'https://playcombo.it/giochi-davventura/' },
    { key: 'platformer', titolo: 'Giochi platform', url: 'https://www.playcombo.it/giochi-platform/' },
    { key: '2048', titolo: 'Giochi 2048', url: 'https://www.playcombo.it/2048-online-gratis-gioca-subito-su-spc/' }
];
let righeHomeEl = null;

function normChiave(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function eHome() {
    const seg = window.location.pathname.split('/').filter(s => s);
    return seg.length === 0 || seg[0] === 'page';
}

function iniettaStileHome() {
    if (document.getElementById('stile-righe-home')) return;
    const st = document.createElement('style');
    st.id = 'stile-righe-home';
    st.textContent =
        '.riga-home-spc{margin:0 0 22px;padding:0 10px}' +
        '.riga-testata-spc{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}' +
        '.riga-titolo-spc{color:#fff;font-size:18px;font-weight:bold;text-decoration:none;text-shadow:0 0 8px rgba(255,45,214,.55),0 0 18px rgba(168,85,247,.45)}' +
        '.riga-frecce-spc{display:flex;gap:6px}' +
        '.riga-freccia-spc{width:32px;height:32px;border-radius:50%;border:1px solid rgba(255,45,214,.75);background:rgba(22,8,40,.45);color:#fff;cursor:pointer;font-size:20px;line-height:1;display:flex;align-items:center;justify-content:center;padding:0;font-family:Arial,sans-serif;box-shadow:0 0 10px rgba(255,45,214,.4)}' +
        '.riga-freccia-spc:hover{background:rgba(168,85,247,.35);border-color:#ff2bd6}' +
        '.riga-scroll-spc{display:flex;gap:10px;overflow-x:auto;scroll-behavior:smooth;scrollbar-width:none;-ms-overflow-style:none;padding:4px 2px 8px}' +
        '.riga-scroll-spc::-webkit-scrollbar{display:none}' +
        '.riga-attesa-spc .riga-scroll-spc{min-height:96px}' +
        '.card-riga-spc{flex:0 0 96px;cursor:pointer;transition:transform .2s ease}' +
        '.card-riga-spc:hover{transform:scale(1.05)}' +
        '.card-riga-spc img{width:96px;height:96px;object-fit:cover;border-radius:14px;display:block;box-shadow:0 4px 8px rgba(0,0,0,.3)}' +
        '.card-riga-spc:hover img{box-shadow:0 0 8px rgba(255,45,214,.85),0 0 18px rgba(168,85,247,.75)}' +
        '.card-altro-spc{flex:0 0 96px;height:96px;display:flex;align-items:center;justify-content:center;text-align:center;border-radius:14px;color:#fff;font-size:13px;font-weight:bold;text-decoration:none;background:rgba(22,8,40,.45);border:1px solid rgba(255,45,214,.75);box-shadow:0 0 10px rgba(255,45,214,.4)}' +
        '@media(min-width:768px){.card-riga-spc,.card-altro-spc{flex-basis:120px}.card-riga-spc img{width:120px;height:120px}.card-altro-spc{height:120px}.riga-attesa-spc .riga-scroll-spc{min-height:120px}}';
    document.head.appendChild(st);
}

function costruisciRigheHome() {
    if (righeHomeEl) return righeHomeEl;
    if (costruisciRigheHome.fallito) return null;
    const griglia = document.querySelector('.griglia-giochi-spc');
    if (!griglia || !griglia.parentNode) return null;
    iniettaStileHome();

    // Unisce tutte le 35 sottocategorie dentro le righe della Home
    const SINONIMI_CAT = {
        'puzzle': ['puzzle', 'brain', 'block', 'hiddenobject', 'drawing'],
        'shooter': ['shooter', 'sparabolle', 'ball', 'firstpersonshooter'],
        'arcade': ['arcade', 'retro', 'snake', 'fun', 'robots', 'io', 'casual', 'hypercasual', 'clicker', 'idle'],
        'match3': ['match-3', 'match3'],
        'memory': ['memory', 'mahjong', 'board'],
        'trivia': ['trivia', 'quizzzz', 'math', 'educational', 'quiz'],
        'gamesforgirls': ['gamesforgirls', 'girls', 'cats', 'animal'],
        'sports': ['sports', 'sport', 'basketball', 'golf', 'ball'],
        'racing': ['racing', 'giochidicorse', 'car', 'airplane'],
        'card': ['card', 'carteememory', 'cards', 'board'],
        'superbubbleshot': ['super-bubble-shot', 'ball', 'shooter'],
        'adventure': ['adventure', 'giochidavventura', 'stickman', 'christmas', 'strategy', 'farming', 'building', 'simulation', 'zombie', 'battle', 'fighting', 'tanks'],
        'platformer': ['platformer', 'giochiplatform', 'runner'],
        '2048': ['2048']
    };

    const gruppiLocali = {};
    lista.forEach(g => {
        const k = normChiave(g.categoria);
        (gruppiLocali[k] = gruppiLocali[k] || []).push(g);
    });

    const prendiLocali = (catKey) => {
        const kBase = normChiave(catKey);
        const chiaviDaCercare = SINONIMI_CAT[kBase] || [kBase];
        const trovati = [];
        const visti = new Set();
        chiaviDaCercare.forEach(k => {
            const arr = gruppiLocali[normChiave(k)] || [];
            arr.forEach(g => {
                const idUnico = g.url || g.titolo;
                if (!visti.has(idUnico)) {
                    visti.add(idUnico);
                    trovati.push(g);
                }
            });
        });
        return trovati;
    };

    // Un gioco compare in una sola riga: vince la riga piu' in alto (indice piu' basso)
    const proprietari = new Map();   // chiave gioco -> indice della riga che lo mostra
    const chiaveGioco = (g) => g.url || g.titolo;
    const liberi = (giochi, idx) => giochi.filter(g => {
        const p = proprietari.get(chiaveGioco(g));
        return p === undefined || p === idx;
    });
    const prenota = (giochi, idx) => giochi.forEach(g => {
        const k = chiaveGioco(g);
        if (!proprietari.has(k)) proprietari.set(k, idx);
    });

    // Se una riga ha pochi giochi nella Home, li legge da sola dalla pagina della categoria!
    const pescaDaPaginaCategoria = (urlCat, fallbackLocali, idx) => {
        if (!urlCat) return Promise.resolve(fallbackLocali);
        const pathRelativo = urlCat.replace(/^https?:\/\/(www\.)?playcombo\.it/i, '');
        return fetch(pathRelativo)
            .then(r => r.ok ? r.text() : Promise.reject())
            .then(html => {
                const match = html.match(/(?:var|let|const)\s+listaGiochi\s*=\s*(\[[\s\S]*?\]);/);
                if (!match || !match[1]) return fallbackLocali;
                const estratti = (new Function('return ' + match[1]))();
                const nuovi = Array.isArray(estratti) ? liberi(estratti, idx) : [];
                return nuovi.length > fallbackLocali.length
                    ? nuovi.slice(0, RIGA_MAX)
                    : fallbackLocali;
            })
            .catch(() => fallbackLocali);
    };

    const wrap = document.createElement('div');
    wrap.id = 'righe-home-spc';
    const observer = createImageObserver();
    const giochiRiga = [];
    let inAttesa = CATEGORIE_HOME.length;
    let righeVisibili = 0;

    const fineCaricamento = () => {
        inAttesa--;
        if (inAttesa > 0 || righeVisibili > 0) return;
        costruisciRigheHome.fallito = true;
        if (righeHomeEl) righeHomeEl.style.display = 'none';
        righeHomeEl = null;
        const pag = document.querySelector('.paginazione-spc');
        [griglia, pag].forEach(el => { if (el) el.style.removeProperty('display'); });
        mostraPagina(1);
    };

    // Le pagine delle categorie partono solo quando la riga e' vicina allo schermo
    const avviiRighe = new Map();
    const osservatoreRighe = ('IntersectionObserver' in window)
        ? new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                osservatoreRighe.unobserve(entry.target);
                const avvia = avviiRighe.get(entry.target);
                avviiRighe.delete(entry.target);
                if (avvia) avvia();
            });
        }, { root: null, rootMargin: '600px 0px', threshold: 0 })
        : null;
    const quandoVicina = (sezione, avvia) => {
        if (!osservatoreRighe) { avvia(); return; }
        avviiRighe.set(sezione, avvia);
        osservatoreRighe.observe(sezione);
    };

    const riempiRiga = (cat, sezione, scroll, giochi, idx) => {
        sezione.classList.remove('riga-attesa-spc');
        if (!giochi || !giochi.length) { sezione.style.display = 'none'; fineCaricamento(); return; }
        prenota(giochi.slice(0, RIGA_MAX), idx);
        giochi.slice(0, RIGA_MAX).forEach(gioco => {
            const card = document.createElement('div');
            card.className = 'card-riga-spc';
            card.tabIndex = 0;
            card.dataset.index = String(giochiRiga.length);
            giochiRiga.push(gioco);

            const img = document.createElement('img');
            img.alt = gioco.titolo || 'Gioco';
            img.decoding = 'async';
            img.width = 105;
            img.height = 105;
            const src = ottimizzaImg(gioco.img || '');
            if (gioco.img) img.dataset.orig = gioco.img;
            img.src = tinyPlaceholder();
            img.dataset.src = src || '';
            observer.observe(img);
            img.onerror = imgErrorHandler;
            card.appendChild(img);
            scroll.appendChild(card);
        });
        const altro = document.createElement('a');
        altro.className = 'card-altro-spc';
        altro.href = cat.url;
        altro.textContent = 'Mostra di più ›';
        scroll.appendChild(altro);
        sezione.style.display = '';
        righeVisibili++;
        fineCaricamento();
    };

    CATEGORIE_HOME.forEach((cat, idx) => {
        const sezione = document.createElement('section');
        sezione.className = 'riga-home-spc';
        sezione.style.display = 'none';

        const testata = document.createElement('div');
        testata.className = 'riga-testata-spc';
        const titolo = document.createElement('a');
        titolo.className = 'riga-titolo-spc';
        titolo.href = cat.url;
        titolo.textContent = cat.titolo;
        const frecce = document.createElement('div');
        frecce.className = 'riga-frecce-spc';
        const scroll = document.createElement('div');
        scroll.className = 'riga-scroll-spc';

        [['‹', -1], ['›', 1]].forEach(([simbolo, dir]) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'riga-freccia-spc';
            b.textContent = simbolo;
            b.setAttribute('aria-label', dir < 0 ? 'Scorri a sinistra' : 'Scorri a destra');
            b.onclick = () => { scroll.scrollLeft += dir * Math.max(200, scroll.clientWidth * 0.8); };
            frecce.appendChild(b);
        });
        testata.appendChild(titolo);
        testata.appendChild(frecce);
        sezione.appendChild(testata);
        sezione.appendChild(scroll);
        wrap.appendChild(sezione);

        const locali = liberi(prendiLocali(cat.key), idx);
        if (locali.length >= 15) {
            riempiRiga(cat, sezione, scroll, locali, idx);
        } else {
            // riga "in attesa": visibile con altezza minima, cosi' scatta solo quando e' vicina
            prenota(locali, idx);
            sezione.classList.add('riga-attesa-spc');
            sezione.style.display = '';
            quandoVicina(sezione, () => {
                pescaDaPaginaCategoria(cat.url, locali, idx)
                    .then(giochi => riempiRiga(cat, sezione, scroll, giochi, idx));
            });
        }
    });

    const apri = (ev) => {
        const card = ev.target.closest('.card-riga-spc');
        if (!card) return;
        const gioco = giochiRiga[Number(card.dataset.index)];
        if (gioco) apriAnteprima(gioco);
    };
    wrap.addEventListener('click', apri, { passive: true });
    wrap.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') apri(ev); });

    griglia.parentNode.insertBefore(wrap, griglia);
    righeHomeEl = wrap;
    return wrap;
}
// attiva = true: righe (se possibile). attiva = false: griglia normale. Ritorna true se le righe sono visibili.
function mostraVistaHome(attiva) {
    if (!eHome()) return false;
    const griglia = document.querySelector('.griglia-giochi-spc');
    const pag = document.querySelector('.paginazione-spc');
    if (attiva) {
        const righe = costruisciRigheHome();
        if (!righe) return false;
        righe.style.display = '';
        [griglia, pag].forEach(el => { if (el) el.style.setProperty('display', 'none', 'important'); });
        return true;
    }
    if (righeHomeEl) righeHomeEl.style.display = 'none';
    [griglia, pag].forEach(el => { if (el) el.style.removeProperty('display'); });
    return false;
}

// event delegation for grid clicks
function setupDelegation() {
    const griglia = document.querySelector('.griglia-giochi-spc');
    if (!griglia) return;
    griglia.addEventListener('click', (ev) => {
        const card = ev.target.closest('.scheda-gioco-figura');
        if (!card) return;
        const idx = Number(card.dataset.index);
        const gioco = giochiFiltrati[idx];
        if (gioco) apriAnteprima(gioco);
    }, { passive: true });
    // keyboard accessibility (Enter)
    griglia.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') {
            const card = ev.target.closest('.scheda-gioco-figura');
            if (!card) return;
            const idx = Number(card.dataset.index);
            const gioco = giochiFiltrati[idx];
            if (gioco) apriAnteprima(gioco);
        }
    });
    // pagination delegation
    const infoPagina = document.getElementById('info-pagina');
    if (infoPagina) {
        infoPagina.addEventListener('click', (ev) => {
            const btn = ev.target.closest('button[data-page]');
            if (!btn) return;
            const p = Number(btn.dataset.page) || 1;
            cambiaPaginaDiretta(p);
        }, { passive: true });
    }
}

// fast filter using precomputed lowercase fields
function filtraGiochi() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        const campo = document.getElementById('campoRicerca');
        const testo = (campo && campo.value) ? campo.value.toLowerCase().trim() : '';
        const cat = categoriaAttuale === 'Tutti' ? null : categoriaAttuale.toLowerCase();

        if (!testo && !cat) {
            giochiFiltrati = lista.slice();
        } else {
            giochiFiltrati = lista.filter(g => {
                const matchTitolo = testo ? g.__titleLower.includes(testo) : true;
                const matchCategoria = cat ? g.__catLower === cat : true;
                return matchTitolo && matchCategoria;
            });
        }

        paginaCorrente = 1;
        // home senza ricerca: righe per categoria; altrimenti griglia
        if (!testo && !cat && mostraVistaHome(true)) return;
        mostraVistaHome(false);
        mostraPagina(paginaCorrente);
    }, DEBOUNCE_MS);
}

function filtraCategoria(categoria, bottone) {
    categoriaAttuale = categoria || 'Tutti';
    document.querySelectorAll('.btn-categoria-spc').forEach(btn => btn.classList.remove('attivo'));
    if (bottone) bottone.classList.add('attivo');
    filtraGiochi();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function cambiaPagina(delta) {
    mostraPagina(paginaCorrente + delta);
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function cambiaPaginaDiretta(numeroPagina) {
    mostraPagina(numeroPagina);
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

let currentUrl = '';

function apriAnteprima(gioco) {
    window.giocoCorrente = gioco;
    currentUrl = gioco.url || '';
    const spazioInfo = document.getElementById('spazio-info');
    if (spazioInfo) {
        spazioInfo.innerHTML = '';
        spazioInfo.appendChild(buildPreviewContent(gioco));
    }
    const btnAvvia = document.getElementById('btn-avvia');
    if (btnAvvia) btnAvvia.style.display = 'block';

    const spazioGioco = document.getElementById('spazio-gioco');
    if (spazioGioco) spazioGioco.style.display = 'none';

    const areaContenuto = document.getElementById('area-contenuto');
    if (areaContenuto) areaContenuto.style.display = 'flex';

    const corniceGioco = document.getElementById('cornice-gioco');
    if (corniceGioco) corniceGioco.style.display = 'flex';
}

function avviaGioco() {
    const areaContenuto = document.getElementById('area-contenuto');
    if (areaContenuto) areaContenuto.style.display = 'none';

    const gameDiv = document.getElementById('spazio-gioco');
    if (gameDiv) {
        // create iframe lazily and avoid heavy features to reduce CPU
        gameDiv.innerHTML = '';
        const iframe = document.createElement('iframe');
        iframe.width = '100%';
        iframe.height = '100%';
        iframe.frameBorder = '0';
        iframe.loading = 'lazy';
        iframe.allowFullscreen = true;
        iframe.referrerPolicy = 'no-referrer';
        // optional sandbox could be added depending on needs:
        // iframe.sandbox = "allow-scripts allow-same-origin allow-forms";
        iframe.src = currentUrl || '';
        gameDiv.appendChild(iframe);
        gameDiv.style.display = 'block';
    }
}

function chiudiGiocatore() {
    window.giocoCorrente = null;
    const corniceGioco = document.getElementById('cornice-gioco');
    if (corniceGioco) corniceGioco.style.display = 'none';

    const gameDiv = document.getElementById('spazio-gioco');
    if (gameDiv) {
        gameDiv.innerHTML = '';
        gameDiv.style.display = 'none';
    }
    // hint GC
    currentUrl = '';
}

// public API
window.inizializzaGiochi = function () {
    if (window.__giochiPronti) return;   // evita doppio avvio
    window.__giochiPronti = true;
    lista = normalizeList(Array.isArray(window.listaGiochi) ? window.listaGiochi : []);
    giochiFiltrati = lista.slice();
    createImageObserver();
    setupDelegation();
    if (!mostraVistaHome(true)) mostraPagina(paginaCorrente);
    // attach control functions
    window.filtraGiochi = filtraGiochi;
    window.filtraCategoria = filtraCategoria;
    window.cambiaPagina = cambiaPagina;
    window.cambiaPaginaDiretta = cambiaPaginaDiretta;
    window.apriAnteprima = apriAnteprima;
    window.avviaGioco = avviaGioco;
    window.chiudiGiocatore = chiudiGiocatore;
};

// auto init if data present
if (Array.isArray(window.listaGiochi) && window.listaGiochi.length > 0) {
    // avvio subito: le copertine sono l'elemento LCP
    window.inizializzaGiochi();
}