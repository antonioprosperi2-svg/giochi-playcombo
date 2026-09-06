// Motore di gioco ottimizzato per grandi liste
const GIOCHI_PER_PAGINA = 80;
let paginaCorrente = 1;
let giochiFiltrati = [];
let categoriaAttuale = 'Tutti';
let _listaNormalizzata = [];

// Observer globale per immagini lazy
const _observerOpzioni = { root: null, rootMargin: '150px 0px', threshold: 0.01 };
const imageObserver = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const img = entry.target;
            if (img.dataset.src) {
                img.src = img.dataset.src;
                img.removeAttribute('data-src');
            }
            obs.unobserve(img);
        }
    });
}, _observerOpzioni);

window.inizializzaGiochi = function () {
    if (typeof listaGiochi !== 'undefined' && Array.isArray(listaGiochi)) {
        // Normalizzare una volta: campi lowercase usati nei filtri
        _listaNormalizzata = listaGiochi.map(g => ({
            ...g,
            titoloLower: g.titolo ? g.titolo.toLowerCase() : '',
            categoriaLower: g.categoria ? g.categoria.toLowerCase() : ''
        }));
        giochiFiltrati = _listaNormalizzata.slice();
        paginaCorrente = 1;
        window.mostraPagina(paginaCorrente);
    }
};

function _clampPagina(p) {
    const totale = Math.max(1, Math.ceil(giochiFiltrati.length / GIOCHI_PER_PAGINA));
    if (p < 1) return 1;
    if (p > totale) return totale;
    return p;
}

window.mostraPagina = function (pagina) {
    pagina = _clampPagina(pagina);
    paginaCorrente = pagina;

    const griglia = document.querySelector('.griglia-giochi-spc');
    if (!griglia) return;
    griglia.innerHTML = '';

    const inizio = (pagina - 1) * GIOCHI_PER_PAGINA;
    const fine = inizio + GIOCHI_PER_PAGINA;
    const giochiDaMostrare = giochiFiltrati.slice(inizio, fine);

    const fragment = document.createDocumentFragment();

    giochiDaMostrare.forEach((gioco, indice) => {
        const div = document.createElement('div');
        div.className = 'scheda-gioco-figura';

        const titoloSicuro = gioco.titolo ? gioco.titolo.replace(/"/g, '&quot;') : 'Gioco';
        const tipoCaricamento = (indice < 15) ? 'eager' : 'lazy';

        const img = document.createElement('img');
        img.alt = titoloSicuro;
        img.decoding = 'async';
        img.style.contentVisibility = 'auto';

        if (tipoCaricamento === 'eager') {
            img.src = gioco.img || '';
            img.setAttribute('loading', 'eager');
            img.setAttribute('data-no-lazy', '1');
            img.className = 'no-lazy';
        } else {
            if (gioco.img) img.dataset.src = gioco.img;
            img.setAttribute('loading', 'lazy');
            imageObserver.observe(img);
        }

        img.onerror = function () {
            this.onerror = null;
            this.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100%" height="100%" fill="%23222"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%23666" font-family="sans-serif" font-size="12">No Img</text></svg>';
        };

        div.appendChild(img);
        div.onclick = function () { window.apriAnteprima(gioco); };
        fragment.appendChild(div);
    });

    griglia.appendChild(fragment);

    const totalePagine = Math.ceil(giochiFiltrati.length / GIOCHI_PER_PAGINA) || 1;
    const infoPagina = document.getElementById('info-pagina');

    if (infoPagina) {
        let htmlNumeri = '';
        for (let i = 1; i <= totalePagine; i++) {
            if (i === 1 || i === totalePagine || (i >= pagina - 2 && i <= pagina + 2)) {
                if (i === pagina) {
                    htmlNumeri += '<strong>' + i + '</strong>';
                } else {
                    htmlNumeri += '<span onclick="window.cambiaPaginaDiretta(' + i + ')">' + i + '</span>';
                }
            } else if (i === pagina - 3 || i === pagina + 3) {
                htmlNumeri += '<span class="puntini">...</span>';
            }
        }
        infoPagina.innerHTML = htmlNumeri;
    }

    const btnPrec = document.getElementById('btn-precedente');
    const btnSucc = document.getElementById('btn-successiva');
    if (btnPrec) btnPrec.disabled = (pagina === 1);
    if (btnSucc) btnSucc.disabled = (pagina === totalePagine);
};

let searchTimeout;
window.filtraGiochi = function () {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        const campo = document.getElementById('campoRicerca');
        const testoCercato = campo ? campo.value.toLowerCase().trim() : '';

        if (!_listaNormalizzata.length) {
            giochiFiltrati = [];
        } else {
            giochiFiltrati = _listaNormalizzata.filter(gioco => {
                const matchTitolo = gioco.titoloLower ? gioco.titoloLower.includes(testoCercato) : false;
                const matchCategoria = (categoriaAttuale === 'Tutti' || (gioco.categoriaLower === (categoriaAttuale || '').toLowerCase()));
                return matchTitolo && matchCategoria;
            });
        }

        paginaCorrente = 1;
        window.mostraPagina(paginaCorrente);
    }, 200);
};

window.filtraCategoria = function (categoria, bottone) {
    categoriaAttuale = categoria;
    document.querySelectorAll('.btn-categoria-spc').forEach(btn => btn.classList.remove('attivo'));
    if (bottone) bottone.classList.add('attivo');
    window.filtraGiochi();
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.cambiaPagina = function (direzione) {
    paginaCorrente = _clampPagina(paginaCorrente + direzione);
    window.mostraPagina(paginaCorrente);
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.cambiaPaginaDiretta = function (numeroPagina) {
    paginaCorrente = _clampPagina(numeroPagina);
    window.mostraPagina(paginaCorrente);
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

let currentUrl = '';
window.apriAnteprima = function (gioco) {
    currentUrl = gioco.url || '';
    let titolo = gioco.titolo || 'Gioco';
    let descrizioneCompleta = gioco.desc || 'Gioca gratis!';
    let contenutoHtml = '<h3>' + titolo + '</h3><div id="box-descrizione">' + descrizioneCompleta + '</div>';

    const spazioInfo = document.getElementById('spazio-info');
    if (spazioInfo) spazioInfo.innerHTML = contenutoHtml;

    const btnAvvia = document.getElementById('btn-avvia');
    if (btnAvvia) btnAvvia.style.display = 'block';

    const spazioGioco = document.getElementById('spazio-gioco');
    if (spazioGioco) spazioGioco.style.display = 'none';

    const areaContenuto = document.getElementById('area-contenuto');
    if (areaContenuto) areaContenuto.style.display = 'flex';

    const corniceGioco = document.getElementById('cornice-gioco');
    if (corniceGioco) corniceGioco.style.display = 'flex';
};

window.avviaGioco = function () {
    const areaContenuto = document.getElementById('area-contenuto');
    if (areaContenuto) areaContenuto.style.display = 'none';

    const gameDiv = document.getElementById('spazio-gioco');
    if (gameDiv) {
        gameDiv.innerHTML = '<iframe src="' + currentUrl + '" width="100%" height="100%" frameborder="0" allowfullscreen loading="lazy"></iframe>';
        gameDiv.style.display = 'block';
    }
};

window.chiudiGiocatore = function () {
    const corniceGioco = document.getElementById('cornice-gioco');
    if (corniceGioco) corniceGioco.style.display = 'none';

    const gameDiv = document.getElementById('spazio-gioco');
    if (gameDiv) gameDiv.innerHTML = '';
};

// Se listaGiochi è già definita in pagina, inizializza
if (typeof listaGiochi !== 'undefined' && listaGiochi.length > 0) {
    window.inizializzaGiochi();
}
