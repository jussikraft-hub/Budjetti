/**
 * Budjetti Web App - Storage & Cloud Synchronization Layer
 * Offline-first IndexedDB + Dropbox API v2 taustasynkka + Kuvatallennus
 */

const DB_NAME = "BudjettiDB";
const DB_VERSION = 1;
const DROPBOX_TOKEN_KEY = "budjetti_dropbox_token";
const DROPBOX_FOLDER_KEY = "budjetti_dropbox_folder";
const GDRIVE_TOKEN_KEY = "budjetti_gdrive_token";
const GDRIVE_FOLDER_KEY = "budjetti_gdrive_folder";
const SYNC_TARGET_KEY = "budjetti_sync_target"; // 'local', 'dropbox', 'gdrive'
const RECEIPTS_TARGET_KEY = "budjetti_receipts_target"; // 'dropbox', 'gdrive', 'local'
const RECEIPTS_FOLDER_KEY = "budjetti_receipts_folder";

class StorageProvider {
  constructor() {
    this.db = null;
    this.syncTimeout = null;
  }

  // Alustetaan IndexedDB
  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains("transactions")) {
          const txStore = db.createObjectStore("transactions", { keyPath: "id" });
          txStore.createIndex("date", "date", { unique: false });
          txStore.createIndex("category", "category", { unique: false });
        }
        if (!db.objectStoreNames.contains("settings")) {
          db.createObjectStore("settings", { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains("receipts")) {
          db.createObjectStore("receipts", { keyPath: "id" });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error("IndexedDB virhe:", event.target.error);
        reject(event.target.error);
      };
    });
  }

  // --- ASETUKSET (Settings) ---
  async getSetting(key, defaultValue = null) {
    if (!this.db) await this.init();
    return new Promise((resolve) => {
      const tx = this.db.transaction("settings", "readonly");
      const store = tx.objectStore("settings");
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result ? req.result.value : defaultValue);
      req.onerror = () => resolve(defaultValue);
    });
  }

  async setSetting(key, value) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction("settings", "readwrite");
      const store = tx.objectStore("settings");
      const req = store.put({ key, value });
      req.onsuccess = () => resolve(true);
      req.onerror = (e) => reject(e);
    });
  }

  // --- TAPAHTUMAT (Transactions) ---
  async getAllTransactions() {
    if (!this.db) await this.init();
    return new Promise((resolve) => {
      const tx = this.db.transaction("transactions", "readonly");
      const store = tx.objectStore("transactions");
      const req = store.getAll();
      req.onsuccess = () => {
        const items = req.result || [];
        // Järjestetään oletuksena uusimmasta vanhimpaan:
        // Ensisijainen: päivämäärä (uusin päivä ensin)
        // Toissijainen: kirjausaika / luontiaikaleima (uusin kirjaus ylimpänä saman päivän sisällä)
        items.sort((a, b) => {
          const dateDiff = (b.date || "").localeCompare(a.date || "");
          if (dateDiff !== 0) return dateDiff;
          const getStamp = (t) => {
            if (t.createdAt) {
              const ms = new Date(t.createdAt).getTime();
              if (!isNaN(ms)) return ms;
            }
            if (t.updatedAt) {
              const ms = new Date(t.updatedAt).getTime();
              if (!isNaN(ms)) return ms;
            }
            if (t.id && typeof t.id === "string" && t.id.startsWith("tx_")) {
              const num = parseInt(t.id.replace("tx_", ""), 10);
              if (!isNaN(num)) return num;
            }
            return 0;
          };
          return getStamp(b) - getStamp(a);
        });
        resolve(items);
      };
      req.onerror = () => resolve([]);
    });
  }

  async saveTransaction(transaction) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction("transactions", "readwrite");
      const store = tx.objectStore("transactions");
      const req = store.put(transaction);
      req.onsuccess = () => {
        this.triggerBackgroundSync();
        resolve(transaction);
      };
      req.onerror = (e) => reject(e);
    });
  }

  async deleteTransaction(id) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction("transactions", "readwrite");
      const store = tx.objectStore("transactions");
      const req = store.delete(id);
      req.onsuccess = () => {
        this.triggerBackgroundSync();
        resolve(true);
      };
      req.onerror = (e) => reject(e);
    });
  }

  async bulkSaveTransactions(transactionsList) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction("transactions", "readwrite");
      const store = tx.objectStore("transactions");
      transactionsList.forEach((item) => store.put(item));
      tx.oncomplete = () => {
        this.triggerBackgroundSync();
        resolve(true);
      };
      tx.onerror = (e) => reject(e);
    });
  }

  // --- KUITTIKUVAT (Receipt Blobs) ---
  async saveReceipt(id, blobOrDataUrl) {
    if (!this.db) await this.init();
    await new Promise((resolve, reject) => {
      const tx = this.db.transaction("receipts", "readwrite");
      const store = tx.objectStore("receipts");
      const req = store.put({ id, data: blobOrDataUrl, createdAt: new Date().toISOString() });
      req.onsuccess = () => resolve(id);
      req.onerror = (e) => reject(e);
    });

    // Jos tallennuskohteena on Dropbox tai Google Drive ja kuva on DataURL, viedään taustalla pilveen
    if (this.getReceiptsTarget() === "dropbox" && typeof blobOrDataUrl === "string" && blobOrDataUrl.startsWith("data:")) {
      this.uploadReceiptToDropbox(id, blobOrDataUrl).catch(e => console.warn("Kuitti-upload taustavirhe:", e));
    } else if (this.getReceiptsTarget() === "gdrive" && typeof blobOrDataUrl === "string" && blobOrDataUrl.startsWith("data:")) {
      this.uploadReceiptToGoogleDrive(id, blobOrDataUrl).catch(e => console.warn("Kuitti-upload Drive-taustavirhe:", e));
    }
    return id;
  }

  async uploadReceiptToDropbox(id, dataUrl) {
    const token = this.getDropboxToken();
    if (!token) return null;
    try {
      const u8 = StorageProvider.dataUrlToUint8Array(dataUrl);
      const folder = this.getReceiptsFolder();
      const path = `${folder}/${id}.jpg`;
      const res = await this.uploadDropboxFile(token, path, u8);
      if (!res.ok) {
        console.warn(`Kuittikuvan Dropbox-tallennus (${path}) epäonnistui:`, res.status);
      } else {
        console.log(`✅ Kuittikuva tallennettu Dropboxiin: ${path}`);
      }
    } catch (e) {
      console.warn("Kuittikuvan Dropbox-tallennusvirhe:", e);
    }
  }

  async uploadReceiptToGoogleDrive(id, dataUrl) {
    const token = this.getGDriveToken();
    if (!token) return null;
    try {
      const parts = dataUrl.split(",");
      const mime = (parts[0].match(/:(.*?);/) || [])[1] || "image/jpeg";
      const u8 = StorageProvider.dataUrlToUint8Array(dataUrl);
      const fileName = `${id}.jpg`;
      const res = await this.uploadGDriveFile(token, fileName, u8, mime);
      if (res && res.ok) {
        console.log(`✅ Kuittikuva tallennettu Google Driveen: ${fileName}`);
      }
    } catch (e) {
      console.warn("Kuittikuvan Drive-tallennusvirhe:", e);
    }
  }

  static dataUrlToUint8Array(dataUrl) {
    const parts = dataUrl.split(",");
    const byteString = atob(parts[1] || parts[0]);
    const u8 = new Uint8Array(byteString.length);
    for (let i = 0; i < byteString.length; i++) {
      u8[i] = byteString.charCodeAt(i);
    }
    return u8;
  }

  async getReceipt(id) {
    if (!this.db) await this.init();
    return new Promise((resolve) => {
      const tx = this.db.transaction("receipts", "readonly");
      const store = tx.objectStore("receipts");
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result ? req.result.data : null);
      req.onerror = () => resolve(null);
    });
  }

  // --- KUVANKÄSITTELY JA TIIVISTYS (Client-side Canvas Compression) ---
  static async compressImage(file, maxDimension = 1600, quality = 0.8) {
    // 1. PDF-tiedostojen suora vektorirenderöinti valkoiselle taustalle PDF.js:llä
    if ((file.type === "application/pdf" || (file.name && file.name.toLowerCase().endsWith(".pdf"))) && typeof window !== "undefined" && window.pdfjsLib) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = window.pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(1);
        const unscaledViewport = page.getViewport({ scale: 1.0 });

        let scale = 1.5;
        const maxPageDim = Math.max(unscaledViewport.width, unscaledViewport.height);
        if (maxPageDim > 0) {
          scale = Math.min(2.5, maxDimension / maxPageDim);
        }

        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        const ctx = canvas.getContext("2d");

        // Pakotetaan AINA puhtaan valkoinen tausta ennen renderöintiä!
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({ canvasContext: ctx, viewport }).promise;
        return canvas.toDataURL("image/jpeg", quality);
      } catch (pdfErr) {
        console.warn("PDF.js renderointi epaonnistui, kokeillaan Image-fallbackia:", pdfErr);
      }
    }

    // 2. Kuvankäsittely / Safari WebKit natiivi PDF-kuvalataus
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let width = img.width;
          let height = img.height;

          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");

          // PAKOTETAAN PUHTAAN VALKOINEN TAUSTA:
          // Läpinäkyvät PDF:t ja PNG:t muuttuvat mustiksi JPEG-muunnoksessa ilman tätä!
          ctx.fillStyle = "#FFFFFF";
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);

          // Muunnetaan tiivistetyksi JPEG-dataksi
          const dataUrl = canvas.toDataURL("image/jpeg", quality);
          resolve(dataUrl);
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // --- DROPBOX API V2 SYNC ---
  getDropboxToken() {
    return localStorage.getItem(DROPBOX_TOKEN_KEY) || "";
  }

  setDropboxToken(token) {
    localStorage.setItem(DROPBOX_TOKEN_KEY, token.trim());
  }

  getDropboxFolder() {
    const saved = localStorage.getItem(DROPBOX_FOLDER_KEY);
    if (saved !== null && saved !== undefined) {
      return saved.trim();
    }
    return "/Apps/Budjetti";
  }

  setDropboxFolder(folder) {
    if (!folder) {
      localStorage.setItem(DROPBOX_FOLDER_KEY, "/Apps/Budjetti");
      return;
    }
    let clean = folder.trim();
    // Jos käyttäjä liittää Dropbox jako-linkin
    if (clean.includes("dropbox.com/")) {
      clean = "/Apps/Budjetti";
    }
    if (clean && !clean.startsWith("/")) {
      clean = "/" + clean;
    }
    if (clean.length > 1 && clean.endsWith("/")) {
      clean = clean.slice(0, -1);
    }
    localStorage.setItem(DROPBOX_FOLDER_KEY, clean);
  }

  getDataFilePath() {
    const folder = this.getDropboxFolder();
    if (!folder || folder === "/") {
      return "/budjetti_data.json";
    }
    return `${folder}/budjetti_data.json`;
  }

  getReceiptsFolderPath() {
    const folder = this.getDropboxFolder();
    if (!folder || folder === "/") {
      return "/Kuitit";
    }
    return `${folder}/Kuitit`;
  }

  getReceiptsTarget() {
    return localStorage.getItem(RECEIPTS_TARGET_KEY) || (this.getSyncTarget() === "dropbox" ? "dropbox" : "local");
  }

  setReceiptsTarget(target) {
    localStorage.setItem(RECEIPTS_TARGET_KEY, target);
  }

  getReceiptsFolder() {
    const saved = localStorage.getItem(RECEIPTS_FOLDER_KEY);
    if (saved !== null && saved !== undefined && saved.trim()) {
      return saved.trim();
    }
    return this.getReceiptsFolderPath();
  }

  setReceiptsFolder(folder) {
    if (!folder) {
      localStorage.removeItem(RECEIPTS_FOLDER_KEY);
      return;
    }
    let clean = folder.trim();
    if (clean.includes("dropbox.com/")) {
      clean = this.getDropboxFolder() + "/Kuitit";
    }
    if (clean && !clean.startsWith("/")) {
      clean = "/" + clean;
    }
    if (clean.length > 1 && clean.endsWith("/")) {
      clean = clean.slice(0, -1);
    }
    localStorage.setItem(RECEIPTS_FOLDER_KEY, clean);
  }

  getSyncTarget() {
    return localStorage.getItem(SYNC_TARGET_KEY) || "dropbox";
  }

  setSyncTarget(target) {
    localStorage.setItem(SYNC_TARGET_KEY, target);
  }

  // Taustasynkan liipaisin (debounced)
  triggerBackgroundSync() {
    if (this.syncTimeout) clearTimeout(this.syncTimeout);
    this.syncTimeout = setTimeout(() => {
      this.syncToCloud(true);
    }, 1500);
  }

  // --- GOOGLE DRIVE SYNC SETTINGS ---
  getGDriveToken() {
    return localStorage.getItem(GDRIVE_TOKEN_KEY) || "";
  }

  setGDriveToken(token) {
    localStorage.setItem(GDRIVE_TOKEN_KEY, (token || "").trim());
  }

  getGDriveFolder() {
    const saved = localStorage.getItem(GDRIVE_FOLDER_KEY);
    if (saved !== null && saved !== undefined && saved.trim()) {
      return saved.trim();
    }
    return "/Budjetti";
  }

  setGDriveFolder(folder) {
    if (!folder) {
      localStorage.setItem(GDRIVE_FOLDER_KEY, "/Budjetti");
      return;
    }
    let clean = folder.trim();
    if (clean && !clean.startsWith("/") && !clean.startsWith("root") && clean.length < 25) {
      clean = "/" + clean;
    }
    if (clean.length > 1 && clean.endsWith("/")) {
      clean = clean.slice(0, -1);
    }
    localStorage.setItem(GDRIVE_FOLDER_KEY, clean);
  }

  // --- ENTITY HELPERS (Accounts, Subscriptions, Debts, P2P, Receipt Inbox) ---
  async getAccounts() {
    const defaultAccounts = [
      { id: "acc_kayttotili", name: "Käyttötili", type: "bank", color: "#BFB99E" },
      { id: "acc_kateinen", name: "Käteinen", type: "cash", color: "#5C6A51" },
      { id: "acc_luottokortti", name: "Luottokortti", type: "credit", color: "#A6243C" },
      { id: "acc_puhelinlasku", name: "Puhelinlasku", type: "bill", color: "#683F26" }
    ];
    return await this.getSetting("accounts", defaultAccounts);
  }

  async saveAccounts(accounts) {
    await this.setSetting("accounts", accounts);
    this.triggerBackgroundSync();
  }

  async getSubscriptions() {
    return await this.getSetting("subscriptions", []);
  }

  async saveSubscriptions(subscriptions) {
    await this.setSetting("subscriptions", subscriptions);
    this.triggerBackgroundSync();
  }

  async getDebts() {
    return await this.getSetting("debts", []);
  }

  async saveDebts(debts) {
    await this.setSetting("debts", debts);
    this.triggerBackgroundSync();
  }

  async getP2pLoans() {
    return await this.getSetting("p2pLoans", []);
  }

  async saveP2pLoans(p2pLoans) {
    await this.setSetting("p2pLoans", p2pLoans);
    this.triggerBackgroundSync();
  }

  async getReceiptInbox() {
    return await this.getSetting("receiptInbox", []);
  }

  async saveReceiptInbox(inbox) {
    await this.setSetting("receiptInbox", inbox);
    this.triggerBackgroundSync();
  }

  async exportFullPayload() {
    const transactions = await this.getAllTransactions();
    const settings = {
      payday: await this.getSetting("payday", 20),
      recurring: await this.getSetting("recurring", []),
      categories: await this.getSetting("categories", null),
      freeBalanceManual: await this.getSetting("freeBalanceManual", null),
      accounts: await this.getAccounts(),
      subscriptions: await this.getSubscriptions(),
      debts: await this.getDebts(),
      p2pLoans: await this.getP2pLoans(),
      ulosotto: await this.getSetting("ulosotto", null),
      salary: await this.getSetting("salary", null),
      receiptInbox: await this.getReceiptInbox(),
      dropboxFolder: this.getDropboxFolder(),
      gdriveFolder: this.getGDriveFolder(),
      receiptsTarget: this.getReceiptsTarget(),
      receiptsFolder: this.getReceiptsFolder(),
      themeMode: await this.getSetting("theme_mode", "dark"),
      activeTheme: await this.getSetting("active_theme", null),
      customThemes: await this.getSetting("custom_themes", [])
    };

    return {
      version: "1.1",
      updated_at: new Date().toISOString(),
      settings,
      accounts: settings.accounts,
      subscriptions: settings.subscriptions,
      debts: settings.debts,
      p2pLoans: settings.p2pLoans,
      ulosotto: settings.ulosotto,
      salary: settings.salary,
      transactions,
    };
  }

  async importFullPayload(payload) {
    if (!payload || !payload.transactions) {
      throw new Error("Virheellinen JSON-varmuuskopiotiedosto.");
    }
    if (payload.settings) {
      if (payload.settings.payday) await this.setSetting("payday", payload.settings.payday);
      if (payload.settings.recurring) await this.setSetting("recurring", payload.settings.recurring);
      if (payload.settings.categories) await this.setSetting("categories", payload.settings.categories);
      if (payload.settings.accounts || payload.accounts) await this.setSetting("accounts", payload.settings.accounts || payload.accounts);
      if (payload.settings.subscriptions || payload.subscriptions) await this.setSetting("subscriptions", payload.settings.subscriptions || payload.subscriptions);
      if (payload.settings.debts || payload.debts) await this.setSetting("debts", payload.settings.debts || payload.debts);
      if (payload.settings.p2pLoans || payload.p2pLoans) await this.setSetting("p2pLoans", payload.settings.p2pLoans || payload.p2pLoans);
      if (payload.settings.ulosotto || payload.ulosotto) await this.setSetting("ulosotto", payload.settings.ulosotto || payload.ulosotto);
      if (payload.settings.salary || payload.salary) await this.setSetting("salary", payload.settings.salary || payload.salary);
      if (payload.settings.receiptInbox) await this.setSetting("receiptInbox", payload.settings.receiptInbox);
      if (payload.settings.dropboxFolder) this.setDropboxFolder(payload.settings.dropboxFolder);
      if (payload.settings.gdriveFolder) this.setGDriveFolder(payload.settings.gdriveFolder);
      if (payload.settings.receiptsTarget) this.setReceiptsTarget(payload.settings.receiptsTarget);
      if (payload.settings.receiptsFolder) this.setReceiptsFolder(payload.settings.receiptsFolder);
      if (payload.settings.freeBalanceManual !== undefined) {
        await this.setSetting("freeBalanceManual", payload.settings.freeBalanceManual);
      }
      if (payload.settings.themeMode) await this.setSetting("theme_mode", payload.settings.themeMode);
      if (payload.settings.activeTheme) await this.setSetting("active_theme", payload.settings.activeTheme);
      if (payload.settings.customThemes) await this.setSetting("custom_themes", payload.settings.customThemes);
    }
    await this.bulkSaveTransactions(payload.transactions);
    return true;
  }

  async uploadDropboxFile(token, path, content) {
    return fetch("https://content.dropboxapi.com/2/files/upload", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Dropbox-API-Arg": JSON.stringify({
          path: path,
          mode: "overwrite",
          autorename: false,
          mute: true,
          strict_conflict: false,
        }),
        "Content-Type": "application/octet-stream",
      },
      body: content,
    });
  }

  async downloadDropboxFile(token, path) {
    return fetch("https://content.dropboxapi.com/2/files/download", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Dropbox-API-Arg": JSON.stringify({
          path: path,
        }),
      },
    });
  }

  // --- CLOUD SYNC ROUTING ---
  async syncToCloud(silent = false) {
    const target = this.getSyncTarget();
    if (target === "dropbox") {
      return this.syncToDropbox(silent);
    } else if (target === "gdrive") {
      return this.syncToGoogleDrive(silent);
    }
  }

  async syncFromCloud(silent = false) {
    const target = this.getSyncTarget();
    if (target === "dropbox") {
      return this.syncFromDropbox(silent);
    } else if (target === "gdrive") {
      return this.syncFromGoogleDrive(silent);
    }
  }

  // --- DROPBOX SYNC IMPLEMENTATION ---
  async syncToDropbox(silent = false) {
    const token = this.getDropboxToken();
    if (!token) {
      if (!silent) console.warn("Dropbox-avainta ei ole määritetty asetuksissa.");
      return;
    }

    try {
      const payload = await this.exportFullPayload();
      const content = JSON.stringify(payload, null, 2);
      let targetPath = this.getDataFilePath();

      let res = await this.uploadDropboxFile(token, targetPath, content);

      // Jos polkuvirhe (esim. App folder -tokenilla kansio on jo sovellusjuuri)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (targetPath !== "/budjetti_data.json") {
          console.warn(`Polku ${targetPath} epäonnistui (${err.error_summary || "error"}), kokeillaan juureen /budjetti_data.json...`);
          const fallbackRes = await this.uploadDropboxFile(token, "/budjetti_data.json", content);
          if (fallbackRes.ok) {
            this.setDropboxFolder("/");
            res = fallbackRes;
          }
        }
        if (!res.ok) {
          throw new Error(err.error_summary || res.statusText);
        }
      }

      if (!silent) console.log(`✅ Synkronoitu Dropboxiin onnistuneesti (${targetPath})!`);
      return true;
    } catch (e) {
      console.error("Dropbox synkronointivirhe:", e);
      if (!silent) throw e;
    }
  }

  async syncFromDropbox(silent = false) {
    const token = this.getDropboxToken();
    if (!token) return;

    try {
      let targetPath = this.getDataFilePath();
      let res = await this.downloadDropboxFile(token, targetPath);

      // Jos polku ei löytynyt, kokeillaan juurta /budjetti_data.json
      if (!res.ok && targetPath !== "/budjetti_data.json") {
        const fallbackRes = await this.downloadDropboxFile(token, "/budjetti_data.json");
        if (fallbackRes.ok) {
          res = fallbackRes;
          this.setDropboxFolder("/");
        }
      }

      if (!res.ok) {
        if (res.status === 409) {
          // Tiedostoa ei vielä ole Dropboxissa, ladataan lokaali sinne
          return this.syncToDropbox(true);
        }
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error_summary || res.statusText);
      }

      const payload = await res.json();
      await this.importFullPayload(payload);
      if (!silent) console.log("✅ Ladattu ja päivitetty Dropboxista!");
      return payload;
    } catch (e) {
      console.error("Dropbox latausvirhe:", e);
      if (!silent) throw e;
    }
  }

  // --- GOOGLE DRIVE API V3 SYNC ---
  async findGDriveFileId(token, fileName) {
    const q = `name = '${fileName}' and trashed = false`;
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`;
    const res = await fetch(url, {
      headers: { Authorization: "Bearer " + token }
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.files && data.files.length > 0) {
      return data.files[0].id;
    }
    return null;
  }

  async uploadGDriveFile(token, fileName, content, mimeType = "application/json") {
    const existingId = await this.findGDriveFileId(token, fileName);
    if (existingId) {
      // Päivitetään olemassa oleva tiedosto
      return fetch(`https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=media`, {
        method: "PATCH",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": mimeType
        },
        body: content
      });
    } else {
      // Luodaan uusi tiedosto käyttäen multipart-latausta
      const metadata = { name: fileName, mimeType: mimeType };
      const boundary = "-------BudjettiBoundary" + Date.now();
      const delimiter = "\r\n--" + boundary + "\r\n";
      const closeDelim = "\r\n--" + boundary + "--";

      let multipartBody = delimiter +
        "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
        JSON.stringify(metadata) +
        delimiter +
        `Content-Type: ${mimeType}\r\n\r\n` +
        content +
        closeDelim;

      return fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "multipart/related; boundary=" + boundary
        },
        body: multipartBody
      });
    }
  }

  async downloadGDriveFile(token, fileName) {
    const fileId = await this.findGDriveFileId(token, fileName);
    if (!fileId) {
      return { ok: false, status: 404, statusText: "File not found in Google Drive" };
    }
    return fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { Authorization: "Bearer " + token }
    });
  }

  async syncToGoogleDrive(silent = false) {
    const token = this.getGDriveToken();
    if (!token) {
      if (!silent) console.warn("Google Drive -avainta ei ole määritetty asetuksissa.");
      return;
    }

    try {
      const payload = await this.exportFullPayload();
      const content = JSON.stringify(payload, null, 2);
      const res = await this.uploadGDriveFile(token, "budjetti_data.json", content, "application/json");

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || res.statusText);
      }

      if (!silent) console.log("✅ Synkronoitu Google Driveen onnistuneesti!");
      return true;
    } catch (e) {
      console.error("Google Drive synkronointivirhe:", e);
      if (!silent) throw e;
    }
  }

  async syncFromGoogleDrive(silent = false) {
    const token = this.getGDriveToken();
    if (!token) return;

    try {
      const res = await this.downloadGDriveFile(token, "budjetti_data.json");
      if (!res.ok) {
        if (res.status === 404) {
          // Tiedostoa ei vielä löydy Drivesta -> viedään lokaali sinne
          return this.syncToGoogleDrive(true);
        }
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || res.statusText);
      }

      const payload = await res.json();
      await this.importFullPayload(payload);
      if (!silent) console.log("✅ Ladattu ja päivitetty Google Drivesta!");
      return payload;
    } catch (e) {
      console.error("Google Drive latausvirhe:", e);
      if (!silent) throw e;
    }
  }
}

if (typeof window !== "undefined") {
  window.StorageProvider = StorageProvider;
  window.storage = new StorageProvider();
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = { StorageProvider };
}
