# Float → Tustena CRM Automation

[![Tests](https://github.com/Redy1908/Tustena-Automation/actions/workflows/test.yml/badge.svg)](https://github.com/Redy1908/Tustena-Automation/actions/workflows/test.yml)
[![codecov](https://codecov.io/gh/Redy1908/Tustena-Automation/graph/badge.svg)](https://codecov.io/gh/Redy1908/Tustena-Automation)

Strumento per creare automaticamente i **Voucher Intervento** su **Tustena CRM** a partire dalle allocazioni **Float**. Elimina la compilazione manuale dei rapportini: importa le allocazioni, rivedi i voucher e confermali in un click.

## Avvio rapido

```bash
docker compose up --build -d
```

L'app sarà disponibile su `http://localhost:5001`.

### Variabili d'ambiente (opzionali)

Permettono di pre-compilare i campi nell'UI al primo avvio:

| Variabile         | Descrizione                  | Dove si trova                                                 |
| ----------------- | ---------------------------- | ------------------------------------------------------------- |
| `TUSTENA_API_KEY` | API Key del CRM Tustena      | Tustena CRM → Setup → Gestione Account → Web API Keys → Nuova |
| `FLOAT_ICAL_URL`  | URL del feed iCal di Float   | Personal → Calendar Integrations → Copy the link              |

```bash
export TUSTENA_API_KEY=la-tua-key
export FLOAT_ICAL_URL=https://ical.float.com/...
docker compose up --build -d
```

## Come si usa

1. Inserisci la tua **API Key Tustena** e l'**URL del feed iCal** di Float nelle Impostazioni e salva. La configurazione viene memorizzata nel browser e non è necessario reinserirla.
2. La dashboard mostra le allocazioni della settimana corrente, raggruppate per giorno. Usa le frecce per navigare tra le settimane.
3. Clicca **Crea** sul singolo voucher per inviarlo a Tustena.

> Dopo la creazione, invia manualmente la mail di rapportino da Tustena CRM.

## Risoluzione mismatch nomi

Alcuni voucher potrebbero andare in errore perché il nome azienda o servizio su Float non corrisponde a quello su Tustena. Usa la ricerca inline direttamente sul voucher per trovare il nome corretto e mapparlo: il mapping viene salvato automaticamente nelle Impostazioni e riapplicato alle sessioni successive.

## Note tecniche

### Orari voucher

Il primo voucher del giorno parte alle `09:00`, i successivi vengono incatenati:

```
Voucher A: 09:00 → 13:00
Voucher B: 13:00 → 17:00
```

Gli orari sono modificabili nell'anteprima prima della creazione se necessario.
