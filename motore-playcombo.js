const GIOCHI_PER_PAGINA = 60;
const EAGER_COUNT = 6;                 // poche immagini caricate subito
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

function imgErrorHandler() {
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
            img.style.contentVisibility = 'auto';
            img.style.width = '100%';
            img.style.height = 'auto';
            img.loading = (idx < EAGER_COUNT) ? 'eager' : 'lazy';

            const src = gioco.img || '';
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

    if ('requestIdleCallback' in window) {
        requestIdleCallback(() => work(), { timeout: 500 });
    } else {
        setTimeout(work, 0);
    }
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
    lista = normalizeList(Array.isArray(window.listaGiochi) ? window.listaGiochi : []);
    giochiFiltrati = lista.slice();
    createImageObserver();
    setupDelegation();
    mostraPagina(paginaCorrente);
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
    // schedule init in idle to avoid blocking main thread during page load
    if ('requestIdleCallback' in window) requestIdleCallback(window.inizializzaGiochi, { timeout: 500 });
    else setTimeout(window.inizializzaGiochi, 50);
}