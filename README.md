# 💳 Budjetti – Pääkirja & Kassavirta

Minimalistinen, yksityinen ja nopea budjetti- ja talousseurantasovellus (PWA / Web App) mobiilille, iPadille ja työpöydälle.

## Ominaisuudet
- **Minimalist Luxury Aesthetic:** Hiili- ja norsunluuteema (`#1F1F20`, `#BFB99E`), hienostuneet 1.35px monoline-vektori-ikonit ja sveitsiläinen typografia ilman ylimääräistä hälyä.
- **Safe-to-Spend & Päiväallokaatio:** Reaaliaikainen vapaa käyttövara ja dynaaminen päiväbudjetti seuraavaan palkkapäivään (esim. 20. pv).
- **Arjen pika-allokaatiot:** 1-kosketuksen pikakirjaus useimmin toistuville kuluille (Tarvikkeet, Lounas, Kulkuyhteydet).
- **2-tasoinen budjetointi:** Pääryhmät ja muokattavat alikategoriat visuaalisilla edistymispalkeilla ja kuukausirajoilla.
- **Offline-First & Pilvisynkka:** Tiedot tallentuvat laitteen IndexedDB-muistiin ilman verkkopakkoa; valinnainen automaattinen taustasynkronointi omaan Dropboxiin (`/budjetti_data.json`).
- **Kamerakuitit:** Kuittikuvien automaattinen selaintiivistys (max 1600 px, 80 % JPEG) liitteeksi tapahtumiin.
- **Täysi Data Ownership:** Täysi JSON-varmuuskopiointi (vienti & palautus) ja universaali CSV-siirto (Excel / Google Sheets).
- **PWA-valmis:** Asennettavissa iPhonen ja iPadin Koti-valikkoon natiivisovelluksen tavoin ilman selaimen kehyksiä.

## Käyttö ja paikallinen testaus
```bash
python3 server.py
```
Palvelin tulostaa lähiverkon Wi-Fi IP:n ja QR-koodin, jonka voi lukea suoraan iPhonen kameralla.

## GitHub Pages
Julkaistu ja käytettävissä suoraan staattisena sovelluksena:
👉 https://jussikraft-hub.github.io/Budjetti/
