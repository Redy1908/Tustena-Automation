# Float → Tustena CRM Automation

Strumento per creare automaticamente i **Voucher Intervento** su **Tustena CRM** a partire dalle allocazioni **Float**. Elimina la compilazione manuale dei rapportini: importa le allocazioni, rivedi i voucher e confermali in un click.

## Avvio rapido

```bash
docker compose up --build -d
```

L'app sarà disponibile su `http://localhost`.

### Variabili d'ambiente (opzionali)

Permettono di pre-compilare i campi nell'UI al primo avvio:

| Variabile         | Descrizione                                 |
| ----------------- | ------------------------------------------- |
| `TUSTENA_API_KEY` | API Key Tustena (da SETUP > UTENTI nel CRM) |
| `FLOAT_API_KEY`   | API Key Float (Al momento non disponibile)  |

```bash
export TUSTENA_API_KEY=la-tua-key
export FLOAT_API_KEY=la-tua-float-key
docker compose up --build -d
```

## Come si usa

### Flusso Tustena (CSV)

Usa l'export CSV di Float. Non richiede l'API Key di Float.

1. Inserisci la tua **API Key Tustena**
2. Assicurati che il chip **Tustena** sia selezionato
3. Esporta le allocazioni da Float: **Filtra "Me" → Share → Export .csv → Day**
4. Carica il file CSV (il più recente in `~/Downloads` viene caricato automaticamente)
5. Seleziona il periodo (**Giorno** per filtrare su una data, **Tutti** per importare tutto)
5. Clicca **Anteprima** e rivedi i voucher
6. Compila il contenuto del rapportino per ogni voucher
7. Clicca **Crea Voucher**

> Dopo la creazione, invia manualmente la mail di rapportino da Tustena CRM.

### Flusso Tustena+Float (API)

Usa le API Float per recuperare le allocazioni in tempo reale. Permette anche di marcare le allocazioni come completate in Float.

1. Inserisci la tua **API Key Tustena**
2. Seleziona il chip **Tustena+Float** e inserisci la **API Key Float**
3. Seleziona il periodo (**Giorno** o **Periodo**)
4. Clicca **Anteprima** e rivedi i voucher
5. Compila il contenuto del rapportino per ogni voucher
6. Clicca **Crea Voucher**

Al termine le allocazioni Float vengono automaticamente marcate come **completate**.

> Dopo la creazione, invia manualmente la mail di rapportino da Tustena CRM.

## Risoluzione mismatch nomi

Se nell'anteprima compaiono voucher **con errore**, significa che il nome azienda o servizio su Float non corrisponde esattamente a quello su Tustena. Usa la ricerca integrata nel banner dell'app per trovare il nome corretto, poi aggiorna i file nella cartella `mappings/`:

| File | Scopo |
|------|-------|
| `mappings/company_mapping.json` | Mappa i nomi azienda Float → Tustena |
| `mappings/service_mapping.json` | Mappa i nomi servizio Float → Tustena |

## Note tecniche

### Orari voucher

Il primo voucher del giorno parte alle `09:00`, i successivi vengono incatenati:

```
Voucher A: 09:00 → 13:00
Voucher B: 13:00 → 17:00
```

Gli orari sono modificabili nell'anteprima prima della creazione se necessario.

## Sviluppi futuri

- **Calendario iCal**: importazione diretta dal link iCal personale di Float, senza dover esportare manualmente il CSV
- **Invio email automatico**: invio automatico della mail di rapportino da Tustena al termine della creazione dei voucher.
