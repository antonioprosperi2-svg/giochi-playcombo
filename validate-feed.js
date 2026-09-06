#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Leggi il file JSON
const filePath = process.argv[2];

if (!filePath) {
    console.error('❌ Uso: node validate-feed.js <file.json>');
    console.error('Esempio: node validate-feed.js myfeed.json');
    process.exit(1);
}

if (!fs.existsSync(filePath)) {
    console.error(`❌ File non trovato: ${filePath}`);
    process.exit(1);
}

try {
    const contenuto = fs.readFileSync(filePath, 'utf-8');
    const dati = JSON.parse(contenuto);

    let elencoGiochi = [];
    if (Array.isArray(dati)) {
        elencoGiochi = dati;
    } else if (dati.data && Array.isArray(dati.data)) {
        elencoGiochi = dati.data;
    } else if (dati.games && Array.isArray(dati.games)) {
        elencoGiochi = dati.games;
    } else if (dati.items && Array.isArray(dati.items)) {
        elencoGiochi = dati.items;
    } else {
        console.error('❌ Formato JSON non riconosciuto');
        process.exit(1);
    }

    console.log(`\n📊 ANALISI FEED: ${elencoGiochi.length} giochi trovati\n`);

    // Rilevamento problemi
    const problemi = [];
    const titoli = {};
    const urls = {};

    elencoGiochi.forEach((gioco, index) => {
        const titolo = gioco.title || gioco.name || 'Senza titolo';
        const url = gioco.url || gioco.embed_url || '';
        const img = gioco.thumb1 || gioco.thumb || gioco.image || '';

        const problemaGioco = {
            index,
            titolo,
            url,
            problemi: []
        };

        // Doppioni titolo
        const titoloNorm = titolo.toLowerCase().trim();
        if (titoli[titoloNorm]) {
            problemaGioco.problemi.push(`🔴 DUPLICATO TITOLO (anche in riga ${titoli[titoloNorm]})`);
        } else {
            titoli[titoloNorm] = index;
        }

        // Doppioni URL
        if (url) {
            if (urls[url]) {
                problemaGioco.problemi.push(`🔴 DUPLICATO URL (anche in riga ${urls[url]})`);
            } else {
                urls[url] = index;
            }
        }

        // URL mancante
        if (!url || url.trim() === '') {
            problemaGioco.problemi.push(`🟠 MANCANTE: URL`);
        }

        // Immagine mancante
        if (!img || img.trim() === '') {
            problemaGioco.problemi.push(`🟠 MANCANTE: Immagine`);
        }

        // URL non valido
        if (url && !isUrlValido(url)) {
            problemaGioco.problemi.push(`🟡 SOSPETTO: URL malformato`);
        }

        if (problemaGioco.problemi.length > 0) {
            problemi.push(problemaGioco);
        }
    });

    // Stampa risultati
    if (problemi.length > 0) {
        console.log(`⚠️  PROBLEMI RILEVATI: ${problemi.length}\n`);

        problemi.forEach(p => {
            console.log(`📌 Riga ${p.index + 1}: ${p.titolo}`);
            console.log(`   URL: ${p.url || '(nessuno)'}`);
            p.problemi.forEach(pr => console.log(`   ${pr}`));
            console.log();
        });

        // Genera file con giochi validi
        const giociValidi = elencoGiochi.filter((g, idx) =>
            !problemi.some(p => p.index === idx)
        );

        const outputFile = filePath.replace('.json', '_PULITO.json');
        fs.writeFileSync(outputFile, JSON.stringify(giociValidi, null, 2));
        console.log(`✅ File pulito salvato: ${outputFile}`);
        console.log(`   ${giociValidi.length}/${elencoGiochi.length} giochi validi\n`);
    } else {
        console.log('✅ Nessun problema rilevato!\n');
    }

} catch (e) {
    console.error(`❌ Errore: ${e.message}`);
    process.exit(1);
}

function isUrlValido(url) {
    try {
        new URL(url);
        return true;
    } catch {
        return false;
    }
}
