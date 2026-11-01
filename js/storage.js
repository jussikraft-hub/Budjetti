/**
 * Budjetti Web App - Storage & Cloud Synchronization Layer
 * Offline-first IndexedDB + Dropbox API v2 taustasynkka + Kuvatallennus
 */

const DB_NAME = "BudjettiDB";
const DB_VERSION = 1;
const DROPBOX_TOKEN_KEY = "budjetti_dropbox_token";
const DROPBOX_FOLDER_KEY = "budjetti_dropbox_folder";
const SYNC_TARGET_KEY = "budjetti_sync_target"; // 'local', 'dropbox', 'gdrive'

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
        // Järjestetään oletuksena uusimmasta vanhimpaan
        items.sort((a, b) => new Date(b.date) - new Date(a.date));
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
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction("receipts", "readwrite");
      const store = tx.objectStore("receipts");
      const req = store.put({ id, data: blobOrDataUrl, createdAt: new Date().toISOString() });
      req.onsuccess = () => resolve(id);
      req.onerror = (e) => reject(e);
    });
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
    return "/Apps/Budjetti-Jussi";
  }

  setDropboxFolder(folder) {
    if (!folder) {
      localStorage.setItem(DROPBOX_FOLDER_KEY, "/Apps/Budjetti-Jussi");
      return;
    }
    let clean = folder.trim();
    // Jos käyttäjä liittää Dropbox jako-linkin
    if (clean.includes("dropbox.com/")) {
      clean = "/Apps/Budjetti-Jussi";
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

  async exportFullPayload() {
    const transactions = await this.getAllTransactions();
    const settings = {
      payday: await this.getSetting("payday", 20),
      recurring: await this.getSetting("recurring", []),
      categories: await this.getSetting("categories", null),
      freeBalanceManual: await this.getSetting("freeBalanceManual", null),
      dropboxFolder: this.getDropboxFolder()
    };

    return {
      version: "1.0",
      updated_at: new Date().toISOString(),
      settings,
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
      if (payload.settings.dropboxFolder) this.setDropboxFolder(payload.settings.dropboxFolder);
      if (payload.settings.freeBalanceManual !== undefined) {
        await this.setSetting("freeBalanceManual", payload.settings.freeBalanceManual);
      }
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

  async syncToCloud(silent = false) {
    const target = this.getSyncTarget();
    if (target !== "dropbox") return;

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

  async syncFromCloud(silent = false) {
    const target = this.getSyncTarget();
    if (target !== "dropbox") return;

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
          return this.syncToCloud(true);
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
}

if (typeof window !== "undefined") {
  window.StorageProvider = StorageProvider;
  window.storage = new StorageProvider();
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = { StorageProvider };
}
