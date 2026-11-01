/**
 * Budjetti Web App - Data Interchange Layer
 * JSON täysvarmuuskopio & Universaali CSV vienti/tuonti (PapaParse)
 */

class DataInterchange {
  constructor(storage, categoryManager) {
    this.storage = storage;
    this.categoryManager = categoryManager;
  }

  // --- JSON EXPORT ---
  async exportJSON() {
    const payload = await this.storage.exportFullPayload();
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(payload, null, 2));
    const downloadAnchor = document.createElement("a");
    const dateStr = new Date().toISOString().split("T")[0];
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `budjetti_backup_${dateStr}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  }

  // --- JSON IMPORT ---
  async importJSON(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const payload = JSON.parse(e.target.result);
          await this.storage.importFullPayload(payload);
          resolve(payload);
        } catch (err) {
          reject(new Error("Virheellinen JSON-tiedosto: " + err.message));
        }
      };
      reader.onerror = () => reject(new Error("Tiedoston lukeminen epäonnistui"));
      reader.readAsText(file);
    });
  }

  // --- CSV EXPORT ---
  async exportCSV(filterYear, filterMonth) {
    const transactions = await this.storage.getAllTransactions();
    const filtered = transactions.filter(t => {
      const d = new Date(t.date);
      if (filterYear !== undefined && d.getFullYear() !== filterYear) return false;
      if (filterMonth !== undefined && d.getMonth() !== filterMonth) return false;
      return true;
    });

    if (filtered.length === 0) {
      throw new Error("Ei vietäviä tapahtumia valitulla jaksolla.");
    }

    const rows = filtered.map(t => {
      const cat = this.categoryManager.getById(t.category);
      return {
        "Päivämäärä": t.date,
        "Tyyppi": t.type === "income" ? "Tulo" : "Meno",
        "Kategoria": cat.name,
        "KategoriaID": t.category,
        "Summa": (parseFloat(t.amount) || 0).toFixed(2).replace(".", ","),
        "Kauppa / Saaja": t.vendor || "",
        "Kuvaus": t.desc || "",
        "Kuittitosite": t.receiptId ? "Kyllä" : "Ei"
      };
    });

    // Käytetään puolipistettä suomalaisessa Excel/Sheets -ympäristössä
    const csvContent = typeof Papa !== "undefined" 
      ? Papa.unparse(rows, { delimiter: ";" })
      : this.simpleUnparse(rows);

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const downloadAnchor = document.createElement("a");
    const dateStr = new Date().toISOString().split("T")[0];
    downloadAnchor.setAttribute("href", url);
    downloadAnchor.setAttribute("download", `budjetti_tapahtumat_${dateStr}.csv`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    URL.revokeObjectURL(url);
  }

  // --- CSV IMPORT ---
  async importCSV(file) {
    return new Promise((resolve, reject) => {
      if (typeof Papa === "undefined") {
        reject(new Error("PapaParse-kirjastoa ei löytynyt."));
        return;
      }

      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: async (results) => {
          try {
            const parsed = [];
            const rows = results.data;

            for (const row of rows) {
              // Etsitään sarakkeet joustavasti
              const dateRaw = row["Päivämäärä"] || row["Pvm"] || row["Date"] || row["date"];
              const amountRaw = row["Summa"] || row["Määrä"] || row["Amount"] || row["amount"];
              const typeRaw = row["Tyyppi"] || row["Type"] || row["type"];
              const vendorRaw = row["Kauppa / Saaja"] || row["Kauppa"] || row["Saaja"] || row["Vendor"] || row["vendor"];
              const catRaw = row["KategoriaID"] || row["Kategoria"] || row["Category"] || row["category"];
              const descRaw = row["Kuvaus"] || row["Selite"] || row["Description"] || row["desc"];

              if (!dateRaw || !amountRaw) continue;

              // Muotoillaan pvm YYYY-MM-DD
              let dateFormatted = dateRaw.trim();
              if (dateFormatted.includes(".")) {
                const parts = dateFormatted.split(".");
                if (parts.length === 3) {
                  const day = parts[0].padStart(2, "0");
                  const month = parts[1].padStart(2, "0");
                  const year = parts[2].length === 2 ? "20" + parts[2] : parts[2];
                  dateFormatted = `${year}-${month}-${day}`;
                }
              }

              // Muotoillaan summa
              const cleanAmount = parseFloat(amountRaw.toString().replace(",", ".").replace(/[^\d.-]/g, "")) || 0;
              const isIncome = typeRaw && (typeRaw.toLowerCase().includes("tulo") || typeRaw.toLowerCase().includes("income"));

              // Kategoria
              let categoryId = "muut";
              if (catRaw) {
                const found = this.categoryManager.getAll().find(c => 
                  c.id.toLowerCase() === catRaw.toLowerCase() || 
                  c.name.toLowerCase() === catRaw.toLowerCase()
                );
                if (found) categoryId = found.id;
              }

              parsed.push({
                id: "tx_csv_" + Date.now() + "_" + Math.random().toString(36).substr(2, 6),
                date: dateFormatted,
                type: isIncome ? "income" : "expense",
                category: categoryId,
                amount: Math.abs(cleanAmount),
                vendor: vendorRaw ? vendorRaw.trim() : "",
                desc: descRaw ? descRaw.trim() : "",
                importedAt: new Date().toISOString()
              });
            }

            if (parsed.length === 0) {
              throw new Error("Yhtään kelvollista tapahtumariviä ei voitu lukea CSV-tiedostosta.");
            }

            await this.storage.bulkSaveTransactions(parsed);
            resolve(parsed.length);
          } catch (e) {
            reject(e);
          }
        },
        error: (err) => reject(new Error("CSV-parsaus epäonnistui: " + err.message))
      });
    });
  }

  simpleUnparse(rows) {
    if (!rows.length) return "";
    const headers = Object.keys(rows[0]);
    const lines = [headers.join(";")];
    for (const r of rows) {
      lines.push(headers.map(h => `"${(r[h] || "").toString().replace(/"/g, '""')}"`).join(";"));
    }
    return lines.join("\r\n");
  }
}

if (typeof window !== "undefined") {
  window.DataInterchange = DataInterchange;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = { DataInterchange };
}
