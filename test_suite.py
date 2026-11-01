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
        if (sp.getDropboxFolder() !== "/Apps/Budjetti-Jussi") throw new Error("Oletuskansio väärin: " + sp.getDropboxFolder());
        if (sp.getDataFilePath() !== "/Apps/Budjetti-Jussi/budjetti_data.json") throw new Error("Datafile path väärin");

        // Räätälöity kansio
        sp.setDropboxFolder("OmaTalous/2026");
        if (sp.getDropboxFolder() !== "/OmaTalous/2026") throw new Error("Slash-lisäys epäonnistui: " + sp.getDropboxFolder());
        if (sp.getDataFilePath() !== "/OmaTalous/2026/budjetti_data.json") throw new Error("Custom path väärin");

        // Juurikansio (app token)
        sp.setDropboxFolder("/");
        if (sp.getDataFilePath() !== "/budjetti_data.json") throw new Error("Root path väärin: " + sp.getDataFilePath());

        // Dropbox URL syötetty vahingossa
        sp.setDropboxFolder("https://www.dropbox.com/scl/fo/yp7t3v0er6by2w14atioz/ABG3GRDAdrqv7WXpBOeKHIE?rlkey=h6ti13xi04bf3jdcjs262m4bq&dl=0");
        if (sp.getDropboxFolder() !== "/Apps/Budjetti-Jussi") throw new Error("URL-puhdistus epäonnistui: " + sp.getDropboxFolder());

        console.log("OK");
        """
        res = subprocess.run(["node", "-e", storage_test_js], capture_output=True, text=True)
        self.assertEqual(res.returncode, 0, f"Dropbox-kansiotesti epäonnistui:\n{res.stderr}")
        self.assertIn("OK", res.stdout)

if __name__ == "__main__":
    unittest.main()
