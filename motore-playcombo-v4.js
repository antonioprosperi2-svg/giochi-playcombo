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
const RIGA_MAX = 15;   // giochi mostrati per ogni riga
// key = valore del campo "categoria" nei giochi (maiuscole e trattini non contano)
const CATEGORIE_HOME = [
    { key: 'puzzle', titolo: 'Puzzle', url: 'https://playcombo.it/puzzle/' },
    { key: 'sparabolle', titolo: 'Sparabolle', url: 'https://playcombo.it/sparabolle/' },
    { key: 'arcade', titolo: 'Arcade', url: 'https://playcombo.it/arcade/' },
    { key: 'match-3', titolo: 'Match-3', url: 'https://playcombo.it/match-3/' },
    { key: 'mahjong', titolo: 'Mahjong', url: 'https://playcombo.it/MAHJONG/' },
    { key: 'quizzz', titolo: 'Quizzz!', url: 'https://playcombo.it/quizzz/' },
    { key: 'girls', titolo: 'Girls', url: 'https://playcombo.it/GIRLS/' },
    { key: 'sport', titolo: 'Sport', url: 'https://playcombo.it/SPORT/' },
    { key: 'giochi-di-corse', titolo: 'Giochi di corse', url: 'https://playcombo.it/giochi-di-corse/' },
    { key: 'carte-e-memory', titolo: 'Carte e memory', url: 'https://playcombo.it/carte-e-memory/' },
    { key: 'super-bubble-shot', titolo: 'Super Bubble Shot', url: 'https://playcombo.it/super-bubble-shot/' },
    { key: 'giochi-davventura', titolo: "Giochi d'avventura", url: 'https://playcombo.it/giochi-davventura/' },
    { key: 'giochi-platform', titolo: 'Giochi platform', url: 'https://www.playcombo.it/giochi-platform/' },
    { key: '2048', titolo: 'Giochi 2048', url: 'https://www.playcombo.it/2048-online-gratis-gioca-subito-su-spc/' }
];
let righeHomeEl = null;

function normChiave(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// stessa logica di ottieniCategoriaDalURL(): home = nessun segmento (o /page/...)
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
        '.riga-freccia-spc{width:32px;height:32px;border-radius:50%;border:1px solid rgba(255,45,214,.75);background:rgba(22,8,40,.45);color:#fff;cursor:pointer;font-size:13px;box-shadow:0 0 10px rgba(255,45,214,.4)}' +
        '.riga-freccia-spc:hover{background:rgba(168,85,247,.35);border-color:#ff2bd6}' +
        '.riga-scroll-spc{display:flex;gap:10px;overflow-x:auto;scroll-behavior:smooth;scrollbar-width:none;-ms-overflow-style:none;padding:4px 2px 8px}' +
        '.riga-scroll-spc::-webkit-scrollbar{display:none}' +
        '.card-riga-spc{flex:0 0 96px;cursor:pointer;transition:transform .2s ease}' +
        '.card-riga-spc:hover{transform:scale(1.05)}' +
        '.card-riga-spc img{width:96px;height:96px;object-fit:cover;border-radius:14px;display:block;box-shadow:0 4px 8px rgba(0,0,0,.3)}' +
        '.card-riga-spc:hover img{box-shadow:0 0 8px rgba(255,45,214,.85),0 0 18px rgba(168,85,247,.75)}' +
        '.card-altro-spc{flex:0 0 96px;height:96px;display:flex;align-items:center;justify-content:center;text-align:center;border-radius:14px;color:#fff;font-size:13px;font-weight:bold;text-decoration:none;background:rgba(22,8,40,.45);border:1px solid rgba(255,45,214,.75);box-shadow:0 0 10px rgba(255,45,214,.4)}' +
        '@media(min-width:768px){.card-riga-spc,.card-altro-spc{flex-basis:120px}.card-riga-spc img{width:120px;height:120px}.card-altro-spc{height:120px}}';
    document.head.appendChild(st);
}

function costruisciRigheHome() {
    if (righeHomeEl) return righeHomeEl;
    const griglia = document.querySelector('.griglia-giochi-spc');
    if (!griglia || !griglia.parentNode) return null;
    iniettaStileHome();

    const gruppi = {};
    lista.forEach(g => {
        const k = normChiave(g.categoria);
        (gruppi[k] = gruppi[k] || []).push(g);
    });

    const wrap = document.createElement('div');
    wrap.id = 'righe-home-spc';
    const observer = createImageObserver();
    let primaRiga = true;

    CATEGORIE_HOME.forEach(cat => {
        const giochi = gruppi[normChiave(cat.key)];
        if (!giochi || !giochi.length) return;

        const sezione = document.createElement('section');
        sezione.className = 'riga-home-spc';

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

        [['◀', -1], ['▶', 1]].forEach(([simbolo, dir]) => {
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

        giochi.slice(0, RIGA_MAX).forEach((gioco, idx) => {
            const card = document.createElement('div');
            card.className = 'card-riga-spc';
            card.tabIndex = 0;
            card.dataset.index = String(gioco.__idx);   // posizione in "lista"

            const img = document.createElement('img');
            img.alt = gioco.titolo || 'Gioco';
            img.decoding = 'async';
            img.width = 105;
            img.height = 105;
            const src = ottimizzaImg(gioco.img || '');
            if (gioco.img) img.dataset.orig = gioco.img;
            if (primaRiga && idx < 8) {
                img.src = src || tinyPlaceholder();
            } else {
                img.src = tinyPlaceholder();
                img.dataset.src = src || '';
                observer.observe(img);
            }
            img.onerror = imgErrorHandler;
            card.appendChild(img);
            scroll.appendChild(card);
        });

        const altro = document.createElement('a');
        altro.className = 'card-altro-spc';
        altro.href = cat.url;
        altro.textContent = 'Mostra di più ›';
        scroll.appendChild(altro);

        sezione.appendChild(testata);
        sezione.appendChild(scroll);
        wrap.appendChild(sezione);
        primaRiga = false;
    });

    // utile per capire se qualche categoria dei giochi non ha una riga
    const nonMappate = Object.keys(gruppi).filter(k => !CATEGORIE_HOME.some(c => normChiave(c.key) === k));
    if (nonMappate.length) console.info('[PlayCombo] categorie senza riga in home:', nonMappate);

    if (!wrap.children.length) return null;   // nessuna riga: resta la griglia normale

    const apri = (ev) => {
        const card = ev.target.closest('.card-riga-spc');
        if (!card) return;
        const gioco = lista[Number(card.dataset.index)];
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

