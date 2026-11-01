#!/usr/bin/env python3
"""
Budjetti Web App - Automated Test Suite & Regression Guard
Validates HTML, CSS color tokens, JavaScript syntax, calculations, and PWA manifest.
"""
import os
import json
import unittest
import subprocess
from datetime import datetime

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

class TestBudjettiApp(unittest.TestCase):
    def test_01_manifest_valid(self):
        """Varmistaa että manifest.json on kelvollista JSONia ja sisältää PWA-avainkentät."""
        manifest_path = os.path.join(SCRIPT_DIR, "manifest.json")
        self.assertTrue(os.path.isfile(manifest_path), "manifest.json puuttuu!")
        with open(manifest_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        self.assertEqual(data.get("name"), "Budjetti – Pääkirja & Kassavirta")
        self.assertEqual(data.get("theme_color"), "#1F1F20")
        self.assertEqual(data.get("display"), "standalone")

    def test_02_html_structure(self):
        """Varmistaa että index.html sisältää tarvittavat näkymät, modaalit ja skriptit."""
        index_path = os.path.join(SCRIPT_DIR, "index.html")
        self.assertTrue(os.path.isfile(index_path), "index.html puuttuu!")
        with open(index_path, "r", encoding="utf-8") as f:
            content = f.read()
        
        # Tarkistetaan perusnäkymät
        required_elements = [
          'id="viewKoti"',
          'id="viewTapahtumat"',
          'id="viewBudjetit"',
          'id="viewAsetukset"',
          'id="modalQuickAdd"',
          'id="kpiFreeBalance"',
          'id="kpiDailyAllowance"',
          'id="quickChipsContainer"',
          'js/storage.js',
          'js/categories.js',
          'js/calculator.js',
          'js/exportImport.js',
          'app.js'
        ]
        for elem in required_elements:
            self.assertIn(elem, content, f"Pakollinen elementti puuttuu index.html:stä: {elem}")

    def test_03_css_palette(self):
        """Varmistaa että style.css sisältää tarkat käyttäjän hyväksymät värit."""
        css_path = os.path.join(SCRIPT_DIR, "style.css")
        self.assertTrue(os.path.isfile(css_path), "style.css puuttuu!")
        with open(css_path, "r", encoding="utf-8") as f:
            css = f.read()

        colors = [
            "#1F1F20", # Hiili
            "#A6243C", # Crimson
            "#A5A088", # Stone
            "#5C6A51", # Olive
            "#683F26", # Earth
            "#BFB99E"  # Ivory text
        ]
        for c in colors:
            self.assertIn(c, css, f"Värikoodi puuttuu style.css:stä: {c}")

    def test_04_js_syntax_node(self):
        """Tarkistaa JavaScript-tiedostojen syntaksin ajamalla node -c."""
        js_files = [
            "js/storage.js",
            "js/categories.js",
            "js/calculator.js",
            "js/exportImport.js",
            "app.js"
        ]
        for js_rel in js_files:
            js_path = os.path.join(SCRIPT_DIR, js_rel)
            self.assertTrue(os.path.isfile(js_path), f"JS-tiedosto puuttuu: {js_rel}")
            res = subprocess.run(["node", "-c", js_path], capture_output=True, text=True)
            self.assertEqual(res.returncode, 0, f"Syntaksivirhe tiedostossa {js_rel}:\n{res.stderr}")

    def test_05_calculator_math(self):
        """Testaa päiväbudjetin ja taitepäivän laskentalogiikkaa node-skriptillä."""
        calc_test_js = """
        const { FinanceCalculator } = require('""" + os.path.join(SCRIPT_DIR, "js/calculator.js") + """');

        // Testi 1: Päivät palkkapäivään kun tänään on 1.11. ja palkka 20.11.
        const d1 = new Date(2026, 10, 1); // 1.11.
        const days1 = FinanceCalculator.getDaysUntilPayday(20, d1);
        if (days1 !== 19) throw new Error("Päivien laskenta väärin: " + days1 + " (odotettu 19)");

        // Testi 2: Päivät kun tänään on 20.11. (palkkapäivä -> seuraava 20.12. = 30 pv)
        const d2 = new Date(2026, 10, 20);
        const days2 = FinanceCalculator.getDaysUntilPayday(20, d2);
        if (days2 !== 30) throw new Error("Seuraavan kuun päivät väärin: " + days2 + " (odotettu 30)");

        // Testi 3: Safe-to-Spend päiväallokaatio
        const daily = FinanceCalculator.calculateDailyAllowance(642.80, 19);
        if (daily !== 33.83) throw new Error("Päiväallokaatio väärin: " + daily + " (odotettu 33.83)");

        // Testi 4: Palkkakauden päivämäärävälin laskenta
        const range1 = FinanceCalculator.getCurrentPeriodRange(20, d1);
        if (range1.startStr !== "2026-10-20" || range1.endStr !== "2026-11-19") {
          throw new Error("Palkkakausi väärin 1.11.: " + JSON.stringify(range1));
        }

        console.log("OK");
        """
        res = subprocess.run(["node", "-e", calc_test_js], capture_output=True, text=True)
        self.assertEqual(res.returncode, 0, f"Laskentalogiikkatesti epäonnistui:\n{res.stderr}")
        self.assertIn("OK", res.stdout)

    def test_06_dropbox_folder_config(self):
        """Testaa Dropbox-kansion polun muotoilua ja URL-puhdistuslogiikkaa."""
        storage_test_js = """
        global.localStorage = {
          _data: {},
          getItem(k) { return this._data[k] || null; },
          setItem(k, v) { this._data[k] = String(v); }
        };
        const { StorageProvider } = require('""" + os.path.join(SCRIPT_DIR, "js/storage.js") + """');
        const sp = new StorageProvider();

        // Oletuskansio
        if (sp.getDropboxFolder() !== "/Apps/Budjetti") throw new Error("Oletuskansio väärin: " + sp.getDropboxFolder());
        if (sp.getDataFilePath() !== "/Apps/Budjetti/budjetti_data.json") throw new Error("Datafile path väärin");

        // Räätälöity kansio
        sp.setDropboxFolder("OmaTalous/2026");
        if (sp.getDropboxFolder() !== "/OmaTalous/2026") throw new Error("Slash-lisäys epäonnistui: " + sp.getDropboxFolder());
        if (sp.getDataFilePath() !== "/OmaTalous/2026/budjetti_data.json") throw new Error("Custom path väärin");

        // Juurikansio (app token)
        sp.setDropboxFolder("/");
        if (sp.getDataFilePath() !== "/budjetti_data.json") throw new Error("Root path väärin: " + sp.getDataFilePath());

        // Dropbox URL syötetty vahingossa
        sp.setDropboxFolder("https://www.dropbox.com/scl/fo/yp7t3v0er6by2w14atioz/ABG3GRDAdrqv7WXpBOeKHIE?rlkey=h6ti13xi04bf3jdcjs262m4bq&dl=0");
        if (sp.getDropboxFolder() !== "/Apps/Budjetti") throw new Error("URL-puhdistus epäonnistui: " + sp.getDropboxFolder());

        console.log("OK");
        """
        res = subprocess.run(["node", "-e", storage_test_js], capture_output=True, text=True)
        self.assertEqual(res.returncode, 0, f"Dropbox-kansiotesti epäonnistui:\n{res.stderr}")
        self.assertIn("OK", res.stdout)

    def test_07_empty_state_and_category_edit(self):
        """Varmistaa että oletuskategorioiden budjetit ovat tyhjässä perustilassa (0 €) ja että muokkaus toimii."""
        cat_test_js = """
        const { DEFAULT_CATEGORIES, CategoryManager } = require('""" + os.path.join(SCRIPT_DIR, "js/categories.js") + """');
        
        // Varmistetaan että kaikissa oletuskategorioissa kuukausibudjetti on 0 eikä pikasummia ole
        for (const c of DEFAULT_CATEGORIES) {
          if (c.budgetMonthly !== 0) throw new Error("Oletuskategorialla " + c.name + " on ei-nollasumma: " + c.budgetMonthly);
          if (c.quickAction) throw new Error("Oletuskategorialla " + c.name + " on quickAction päällä");
        }

        // Testataan kategorian muokkauslogiikka mock-storagella
        const mockStorage = {
          _data: {},
          async getSetting(k, d) { return this._data[k] || d; },
          async setSetting(k, v) { this._data[k] = v; return true; }
        };
        const cm = new CategoryManager(mockStorage);
        cm.updateCategory("ruokakauppa", { budgetMonthly: 400, name: "Supermarket" }).then(updated => {
          if (updated.budgetMonthly !== 400) throw new Error("Kategorian budjetin päivitys epäonnistui");
          if (updated.name !== "Supermarket") throw new Error("Kategorian nimen päivitys epäonnistui");
          console.log("OK");
        });
        """
        res = subprocess.run(["node", "-e", cat_test_js], capture_output=True, text=True)
        self.assertEqual(res.returncode, 0, f"Kategoria- ja nollatilalogiikkatesti epäonnistui:\n{res.stderr}")
        self.assertIn("OK", res.stdout)

    def test_08_ios_safe_area_and_receipt_buttons(self):
        """Varmistaa että iOS Safe Area ja erilliset kamera/tiedosto -painikkeet löytyvät tiedostoista."""
        # 1. HTML tarkistus
        with open(os.path.join(SCRIPT_DIR, "index.html"), "r", encoding="utf-8") as f:
            html = f.read()
        self.assertIn('viewport-fit=cover', html)
        self.assertIn('id="formReceiptCamera"', html)
        self.assertIn('id="formReceiptFile"', html)
        self.assertIn('id="settingReceiptsTarget"', html)
        self.assertIn('id="modalCatTitle"', html)
        self.assertIn('id="kpiDaysLeft"', html)

        # 2. CSS Safe Area tarkistus
        with open(os.path.join(SCRIPT_DIR, "style.css"), "r", encoding="utf-8") as f:
            css = f.read()
        self.assertIn('safe-area-inset-top', css)
        self.assertIn('safe-area-inset-bottom', css)

    def test_09_revision_4_features(self):
        """Varmistaa Revisio 4:n uudet näkymät, modaalit, suodattimet ja Google Drive -synkronoinnin."""
        with open(os.path.join(SCRIPT_DIR, "index.html"), "r", encoding="utf-8") as f:
            html = f.read()

        # Uudet näkymät ja modaalit
        new_elements = [
            'id="viewVelat"',
            'id="modalSubscription"',
            'id="modalDebt"',
            'id="modalP2P"',
            'id="modalSplitExpense"',
            'id="modalAccount"',
            'id="modalQuickReceipt"',
            'id="txMonthPicker"',
            'id="txDatePicker"',
            'id="settingGDriveToken"',
            'id="settingGDriveFolder"',
            'id="accountsList"',
            'id="subviewSubscriptions"',
            'id="subviewDebts"',
            'id="subviewP2P"',
            'id="inboxAlertBanner"',
            'id="ledgerInboxBadge"'
        ]
        for elem in new_elements:
            self.assertIn(elem, html, f"Uusi Revisio 4 -elementti puuttuu: {elem}")

        # Varmistetaan että käyttäjän yksityinen Dropbox-kansionimi ei esiinny missään koodissa
        for fname in ["index.html", "js/storage.js", "app.js", "style.css"]:
            with open(os.path.join(SCRIPT_DIR, fname), "r", encoding="utf-8") as f:
                c = f.read()
            self.assertNotIn("Budjetti-Jussi", c, f"Yksityinen Dropbox-kansionimi löytyi tiedostosta {fname}!")

        # Testataan Google Drive & entity-tallennuslogiikka Node.js:llä
        storage_test_js = """
        global.localStorage = {
          _data: {},
          getItem(k) { return this._data[k] || null; },
          setItem(k, v) { this._data[k] = String(v); },
          removeItem(k) { delete this._data[k]; }
        };
        const { StorageProvider } = require('""" + os.path.join(SCRIPT_DIR, "js/storage.js") + """');
        const sp = new StorageProvider();

        // GDrive-token ja oletuskansio
        sp.setGDriveToken("ya29.test_token_123");
        if (sp.getGDriveToken() !== "ya29.test_token_123") throw new Error("GDrive token väärin");
        if (sp.getGDriveFolder() !== "/Budjetti") throw new Error("GDrive oletuskansio väärin: " + sp.getGDriveFolder());

        sp.setGDriveFolder("OmatTiedostot/Budjetti");
        if (sp.getGDriveFolder() !== "/OmatTiedostot/Budjetti") throw new Error("GDrive polku väärin: " + sp.getGDriveFolder());

        // Mock IndexedDB ja exportFullPayload testaus
        sp.db = {
          transaction() {
            return {
              objectStore() {
                return {
                  getAll() {
                    const req = { onsuccess: null, onerror: null };
                    setTimeout(() => { req.result = []; if (req.onsuccess) req.onsuccess(); }, 0);
                    return req;
                  },
                  get(key) {
                    const req = { onsuccess: null, onerror: null };
                    setTimeout(() => { req.result = null; if (req.onsuccess) req.onsuccess(); }, 0);
                    return req;
                  }
                };
              }
            };
          }
        };

        sp.exportFullPayload().then(payload => {
          if (!payload.settings) throw new Error("Asetukset puuttuvat payloadista");
          if (!Array.isArray(payload.settings.accounts)) throw new Error("Tilit puuttuvat payloadista");
          if (!Array.isArray(payload.settings.subscriptions)) throw new Error("Tilaukset puuttuvat payloadista");
          if (!Array.isArray(payload.settings.debts)) throw new Error("Velat puuttuvat payloadista");
          if (!Array.isArray(payload.settings.p2pLoans)) throw new Error("P2P-lainat puuttuvat payloadista");
          if (!Array.isArray(payload.settings.receiptInbox)) throw new Error("Kuitti-inbox puuttuu payloadista");
          console.log("OK");
        });
        """
        res = subprocess.run(["node", "-e", storage_test_js], capture_output=True, text=True)
        self.assertEqual(res.returncode, 0, f"Revisio 4 -tallennustesti epäonnistui:\n{res.stderr}")
        self.assertIn("OK", res.stdout)

if __name__ == "__main__":
    unittest.main()
