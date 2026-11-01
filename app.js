/**
 * Budjetti Web App - Main Application Controller
 * Minimalist Luxury Architecture & State Engine
 */

class BudjettiApp {
  constructor() {
    this.storage = window.storage;
    this.categories = new CategoryManager(this.storage);
    this.interchange = new DataInterchange(this.storage, this.categories);

    this.transactions = [];
    this.accounts = [];
    this.subscriptions = [];
    this.debts = [];
    this.p2pLoans = [];
    this.receiptInbox = [];

    this.currentView = "viewKoti";
    this.previousView = "viewKoti";
    this.currentLedgerTab = "tx";
    this.currentFilterMode = "all";
    this.currentBudgetsTab = "categories";
    this.currentDebtTab = "debts";
    this.p2pType = "lent";

    this.formType = "expense";
    this.selectedCatId = "ruokakauppa";
    this.tempReceiptData = null;
    this.currentReceiptId = null;
    this.tempQuickReceiptData = null;
    this.activeProcessingInboxId = null;
    this.currentSplittingTx = null;

    this.paydayDay = 20;
    this.freeBalanceManual = null;
  }

  async init() {
    try {
      await this.storage.init();
      await this.categories.init();

      // Ladataan perusasetukset
      this.paydayDay = await this.storage.getSetting("payday", 20);
      this.freeBalanceManual = await this.storage.getSetting("freeBalanceManual", null);

      const target = this.storage.getSyncTarget();
      const dropToken = this.storage.getDropboxToken();
      const dropFolder = this.storage.getDropboxFolder();
      const gdriveToken = this.storage.getGDriveToken();
      const gdriveFolder = this.storage.getGDriveFolder();

      const settingTargetEl = document.getElementById("settingSyncTarget");
      if (settingTargetEl) settingTargetEl.value = target;

      const dropTokenEl = document.getElementById("settingDropboxToken");
      if (dropTokenEl && dropToken) dropTokenEl.value = dropToken;

      const dropFolderEl = document.getElementById("settingDropboxFolder");
      if (dropFolderEl && dropFolder) dropFolderEl.value = dropFolder;

      const gdriveTokenEl = document.getElementById("settingGDriveToken");
      if (gdriveTokenEl && gdriveToken) gdriveTokenEl.value = gdriveToken;

      const gdriveFolderEl = document.getElementById("settingGDriveFolder");
      if (gdriveFolderEl && gdriveFolder) gdriveFolderEl.value = gdriveFolder;

      const dropSec = document.getElementById("dropboxConfigSection");
      if (dropSec) dropSec.style.display = target === "dropbox" ? "block" : "none";

      const gdriveSec = document.getElementById("gdriveConfigSection");
      if (gdriveSec) gdriveSec.style.display = target === "gdrive" ? "block" : "none";

      const receiptsTarget = this.storage.getReceiptsTarget();
      const receiptsFolder = this.storage.getReceiptsFolder();
      const receiptsTargetEl = document.getElementById("settingReceiptsTarget");
      if (receiptsTargetEl) receiptsTargetEl.value = receiptsTarget;
      const receiptsFolderEl = document.getElementById("settingReceiptsFolder");
      if (receiptsFolderEl) receiptsFolderEl.value = receiptsFolder;
      const receiptsFolderSec = document.getElementById("receiptsFolderSection");
      if (receiptsFolderSec) receiptsFolderSec.style.display = receiptsTarget !== "local" ? "block" : "none";

      const paydayEl = document.getElementById("settingPaydayDay");
      if (paydayEl) paydayEl.value = this.paydayDay;

      const balanceEl = document.getElementById("settingFreeBalanceManual");
      if (balanceEl && this.freeBalanceManual !== null) {
        balanceEl.value = this.freeBalanceManual;
      }

      this.updateSyncBadge();

      // Taustasynkka pilvestä (jos määritetty)
      if (target !== "local") {
        this.storage.syncFromCloud(true).then(() => {
          this.refreshData();
        }).catch(() => {
          this.refreshData();
        });
      } else {
        await this.refreshData();
      }

      // Asetetaan nykyinen päivämäärä oletukseksi lomakkeeseen
      const dateEl = document.getElementById("formDate");
      if (dateEl) dateEl.value = new Date().toISOString().split("T")[0];

      // Kiinnitetään kelluvan plus-painikkeen tapahtumakuuntelija varmuudeksi
      const fabBtn = document.getElementById("fabAddBtn") || document.querySelector(".fab-add");
      if (fabBtn) {
        fabBtn.addEventListener("click", (e) => {
          e.preventDefault();
          this.openFabChoice();
        });
      }

    } catch (e) {
      console.error("Sovelluksen alustusvirhe:", e);
    }
  }

  updateSyncBadge() {
    const target = this.storage.getSyncTarget();
    const dropToken = this.storage.getDropboxToken();
    const gdriveToken = this.storage.getGDriveToken();
    const textEl = document.getElementById("syncStatusText");
    const dotEl = document.getElementById("syncDot");

    if (target === "dropbox") {
      textEl.innerText = dropToken ? "DROPBOX" : "DROPBOX (EI AVAINTA)";
      dotEl.style.backgroundColor = dropToken ? "var(--c-olive)" : "var(--c-crimson)";
    } else if (target === "gdrive") {
      textEl.innerText = gdriveToken ? "GOOGLE DRIVE" : "G-DRIVE (EI AVAINTA)";
      dotEl.style.backgroundColor = gdriveToken ? "var(--c-olive)" : "var(--c-crimson)";
    } else {
      textEl.innerText = "LOKAALI";
      dotEl.style.backgroundColor = "var(--c-stone)";
    }
  }

  async refreshData() {
    this.paydayDay = await this.storage.getSetting("payday", 20);
    this.freeBalanceManual = await this.storage.getSetting("freeBalanceManual", null);
    await this.categories.init();

    this.transactions = await this.storage.getAllTransactions();
    this.accounts = await this.storage.getAccounts();
    this.subscriptions = await this.storage.getSubscriptions();
    this.debts = await this.storage.getDebts();
    this.p2pLoans = await this.storage.getP2pLoans();
    this.receiptInbox = await this.storage.getReceiptInbox();

    const paydayEl = document.getElementById("settingPaydayDay");
    if (paydayEl) paydayEl.value = this.paydayDay;
    const balanceEl = document.getElementById("settingFreeBalanceManual");
    if (balanceEl && this.freeBalanceManual !== null) {
      balanceEl.value = this.freeBalanceManual;
    }

    this.populateAccountDropdowns();
    this.renderHeader();
    this.renderDashboard();
    this.filterTransactions();
    this.renderBudgetsView();
    this.renderSubscriptionsView();
    this.renderDebtsView();
    this.renderP2PView();
    this.renderAccountsList();
    this.updateInboxBadges();
  }

  renderHeader() {
    const now = new Date();
    const periodRange = FinanceCalculator.getCurrentPeriodRange(this.paydayDay, now);
    const monthsFi = [
      "Tammikuu", "Helmikuu", "Maaliskuu", "Huhtikuu", "Toukokuu", "Kesäkuu",
      "Heinäkuu", "Elokuu", "Syyskuu", "Lokakuu", "Marraskuu", "Joulukuu"
    ];
    const headerEl = document.getElementById("headerCurrentPeriod");
    if (headerEl) {
      headerEl.innerText = `${monthsFi[now.getMonth()]} ${now.getFullYear()} (${periodRange.label})`;
    }
  }

  renderDashboard() {
    const now = new Date();
    const periodRange = FinanceCalculator.getCurrentPeriodRange(this.paydayDay, now);

    const stats = FinanceCalculator.calculateStats(
      this.transactions,
      this.categories.getAll(),
      undefined,
      undefined,
      periodRange
    );

    // Lasketaan päivät palkkapäivään
    const daysLeft = FinanceCalculator.getDaysUntilPayday(this.paydayDay, now);
    const nextPaydayStr = FinanceCalculator.getNextPaydayStr(this.paydayDay, now);

    // Määritetään vapaa käyttövara
    let freeBalance = 0;
    if (this.freeBalanceManual !== null && !isNaN(this.freeBalanceManual)) {
      freeBalance = parseFloat(this.freeBalanceManual) - stats.totalExpense;
    } else {
      freeBalance = stats.totalIncome - stats.totalExpense;
    }

    const dailyAllowance = FinanceCalculator.calculateDailyAllowance(freeBalance, daysLeft);

    // Päivitetään Hero KPI -arvot
    const freeBalEl = document.getElementById("kpiFreeBalance");
    if (freeBalEl) freeBalEl.innerText = freeBalance.toLocaleString("fi-FI", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const dailyEl = document.getElementById("kpiDailyAllowance");
    if (dailyEl) dailyEl.innerText = FinanceCalculator.formatCurrency(dailyAllowance);

    const paydayLabel = document.getElementById("kpiPaydayLabel");
    if (paydayLabel) paydayLabel.innerText = `Päiväallokaatio (${nextPaydayStr} saakka)`;

    const daysLeftEl = document.getElementById("kpiDaysLeft");
    if (daysLeftEl) daysLeftEl.innerText = daysLeft;

    const incomeEl = document.getElementById("kpiMonthIncome");
    if (incomeEl) incomeEl.innerText = "+" + FinanceCalculator.formatCurrency(stats.totalIncome);

    const expenseEl = document.getElementById("kpiMonthExpense");
    if (expenseEl) expenseEl.innerText = "-" + FinanceCalculator.formatCurrency(stats.totalExpense);

    const statusBadge = document.getElementById("kpiStatusBadge");
    if (statusBadge) {
      if (freeBalance < 0) {
        statusBadge.innerText = "Ylitetty";
        statusBadge.style.color = "var(--c-crimson)";
        statusBadge.style.borderColor = "var(--c-crimson)";
        statusBadge.style.background = "rgba(166,36,60,0.15)";
      } else if (dailyAllowance < 15) {
        statusBadge.innerText = "Tiukka";
        statusBadge.style.color = "#d4a373";
        statusBadge.style.borderColor = "#d4a373";
        statusBadge.style.background = "rgba(212,163,115,0.15)";
      } else {
        statusBadge.innerText = "Puskuri OK";
        statusBadge.style.color = "#9fbe8e";
        statusBadge.style.borderColor = "rgba(92,106,81,0.4)";
        statusBadge.style.background = "rgba(92,106,81,0.2)";
      }
    }

    this.renderQuickChips();
    this.renderCategoryMeters(stats.categoryTotals);
    this.renderRecentLedger();
  }

  renderQuickChips() {
    const container = document.getElementById("quickChipsContainer");
    if (!container) return;
    container.innerHTML = "";

    const quickCats = this.categories.getQuickActions();
    quickCats.forEach(c => {
      const btn = document.createElement("button");
      btn.className = "quick-chip";
      btn.onclick = () => this.openQuickAddModal({
        categoryId: c.id,
        amount: c.quickAmount,
        vendor: c.name.split(" ")[0]
      });

      btn.innerHTML = `
        <div class="chip-icon">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.35" viewBox="0 0 24 24">
            <path d="M12 4v16m8-8H4"/>
          </svg>
        </div>
        <p class="chip-title">${c.name.split("&")[0].trim()}</p>
        <p class="chip-amount font-num">${(c.quickAmount || 0).toFixed(2).replace(".", ",")} €</p>
      `;
      container.appendChild(btn);
    });
  }

  renderCategoryMeters(categoryTotals) {
    const container = document.getElementById("dashboardCategoryMeters");
    if (!container) return;
    container.innerHTML = "";

    const catsWithBudget = this.categories.getAll().filter(c => c.budgetMonthly > 0 && c.type !== "income");

    if (catsWithBudget.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 14px 0;">
          <p style="font-size: 11px; color: var(--c-stone); margin-bottom: 8px;">Ei asetettuja kuukausitavoitteita.</p>
          <button class="btn-primary" style="width: auto; padding: 6px 14px; font-size: 10px; background: #252527; border: 1px solid var(--c-border); color: var(--c-text-primary);" onclick="app.switchView('viewBudjetit', 'categories')">
            Aseta tavoitteita &rarr;
          </button>
        </div>
      `;
      return;
    }

    catsWithBudget.slice(0, 4).forEach(c => {
      const spent = categoryTotals[c.id] || 0;
      const budget = c.budgetMonthly;
      const pct = Math.min(100, Math.round((spent / budget) * 100));
      const remaining = Math.max(0, budget - spent);

      let barColor = c.color || "var(--c-olive)";
      if (pct > 90) barColor = "var(--c-crimson)";

      const row = document.createElement("div");
      row.className = "meter-row";
      row.style.cursor = "pointer";
      row.title = "Klikkaa muokataksesi tavoitetta";
      row.onclick = () => this.openCategoryModal(c.id);
      row.innerHTML = `
        <div style="display: flex; justify-content: space-between; font-size: 12px;" class="font-num">
          <span style="font-weight: 500; display: flex; align-items: center; gap: 8px;">
            <span style="width: 6px; height: 6px; border-radius: 50%; background-color: ${c.color};"></span>
            ${c.name}
          </span>
          <span>${spent.toFixed(2).replace(".", ",")} € <span style="color: var(--c-stone); font-weight: 300;">/ ${budget.toFixed(0)} €</span></span>
        </div>
        <div class="meter-track">
          <div class="meter-fill" style="width: ${pct}%; background-color: ${barColor};"></div>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 10px; color: var(--c-stone); font-family: ui-monospace, monospace;">
          <span>${pct} % käytetty</span>
          <span>${remaining.toFixed(2).replace(".", ",")} € jäljellä</span>
        </div>
      `;
      container.appendChild(row);
    });
  }

  renderRecentLedger() {
    const container = document.getElementById("dashboardRecentLedger");
    if (!container) return;
    container.innerHTML = "";

    const recent = this.transactions.slice(0, 5);
    if (recent.length === 0) {
      container.innerHTML = `<p style="font-size: 11px; color: var(--c-stone); padding: 10px 0;">Ei kirjattuja tapahtumia.</p>`;
      return;
    }

    recent.forEach(t => {
      const cat = this.categories.getById(t.category);
      const isIncome = t.type === "income";
      const isCredit = t.amount < 0;
      const sign = (isIncome || isCredit) ? "+" : "-";
      const color = (isIncome || isCredit) ? "#9fbe8e" : "#d4566e";
      const displayAmt = Math.abs(t.amount);

      const item = document.createElement("div");
      item.className = "ledger-item";
      item.style.cursor = "pointer";
      item.title = "Klikkaa muokataksesi kirjausta";
      item.onclick = (e) => {
        if (!e.target.closest("button")) this.editTransaction(t.id);
      };
      item.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="width: 32px; height: 32px; border-radius: 8px; background: #252527; color: var(--c-stone); display: flex; align-items: center; justify-content: center; border: 1px solid rgba(165,160,136,0.15);">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.35" viewBox="0 0 24 24">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
            </svg>
          </div>
          <div>
            <p style="font-size: 12px; font-weight: 500; color: var(--c-text-primary);">${t.vendor || cat.name}</p>
            <p style="font-size: 10px; color: var(--c-stone);">
              ${FinanceCalculator.formatDateFi(t.date)} · ${cat.name} ${t.receiptId ? '· 📎' : ''} ${t.splitInfo ? '· <span style="color:#9fbe8e;">Jaettu</span>' : ''}
            </p>
          </div>
        </div>
        <span class="font-num" style="font-size: 12px; font-weight: 500; color: ${color};">
          ${sign}${FinanceCalculator.formatCurrency(displayAmt)}
        </span>
      `;
      container.appendChild(item);
    });
  }

  // --- FILTER & LEDGER RENDERING (Kuukausi & Päivämäärä Haku) ---
  switchFilterSubMode(mode) {
    this.currentFilterMode = mode;
    const btnAll = document.getElementById("btnFilterSubAll");
    const btnMonth = document.getElementById("btnFilterSubMonth");
    const btnDate = document.getElementById("btnFilterSubDate");
    const boxMonth = document.getElementById("filterBoxMonth");
    const boxDate = document.getElementById("filterBoxDate");
    const mPicker = document.getElementById("txMonthPicker");
    const dPicker = document.getElementById("txDatePicker");

    [btnAll, btnMonth, btnDate].forEach(b => { if (b) b.classList.remove("active"); });

    if (mode === "month") {
      if (btnMonth) btnMonth.classList.add("active");
      if (boxMonth) boxMonth.style.display = "flex";
      if (boxDate) boxDate.style.display = "none";
      if (dPicker) dPicker.value = "";
      if (mPicker && !mPicker.value) {
        const now = new Date();
        mPicker.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      }
    } else if (mode === "date") {
      if (btnDate) btnDate.classList.add("active");
      if (boxMonth) boxMonth.style.display = "none";
      if (boxDate) boxDate.style.display = "flex";
      if (mPicker) mPicker.value = "";
      if (dPicker && !dPicker.value) {
        const now = new Date();
        dPicker.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      }
    } else {
      if (btnAll) btnAll.classList.add("active");
      if (boxMonth) boxMonth.style.display = "none";
      if (boxDate) boxDate.style.display = "none";
      if (mPicker) mPicker.value = "";
      if (dPicker) dPicker.value = "";
    }
    this.filterTransactions();
  }

  handleMonthPickerChange() {
    this.filterTransactions();
  }

  handleDatePickerChange() {
    this.filterTransactions();
  }

  resetMonthFilter() {
    this.switchFilterSubMode("all");
  }

  resetDateFilter() {
    this.switchFilterSubMode("all");
  }

  resetTxFilters() {
    const s = document.getElementById("txSearchInput");
    if (s) s.value = "";
    this.switchFilterSubMode("all");
  }

  filterTransactions() {
    const listContainer = document.getElementById("fullLedgerList");
    const emptyState = document.getElementById("ledgerEmptyState");
    if (!listContainer) return;

    const searchInput = document.getElementById("txSearchInput");
    const query = searchInput ? searchInput.value.toLowerCase().trim() : "";
    const monthPicker = document.getElementById("txMonthPicker")?.value;
    const datePicker = document.getElementById("txDatePicker")?.value;

    const now = new Date();
    const periodRange = FinanceCalculator.getCurrentPeriodRange(this.paydayDay, now);

    const filtered = this.transactions.filter(t => {
      // 1. Tarkka päivämäärähaku
      if (datePicker) {
        if (t.date !== datePicker) return false;
      }
      // 2. Kuukausihaku (YYYY-MM)
      else if (monthPicker) {
        if (!t.date || !t.date.startsWith(monthPicker)) return false;
      }
      // 3. Tekstihaku
      if (query) {
        const cat = this.categories.getById(t.category);
        const matchVendor = t.vendor && t.vendor.toLowerCase().includes(query);
        const matchDesc = t.desc && t.desc.toLowerCase().includes(query);
        const matchCat = cat && cat.name.toLowerCase().includes(query);
        const matchSplit = t.splitInfo && t.splitInfo.person && t.splitInfo.person.toLowerCase().includes(query);
        if (!matchVendor && !matchDesc && !matchCat && !matchSplit) return false;
      }
      return true;
    });

    listContainer.innerHTML = "";
    if (filtered.length === 0) {
      if (emptyState) emptyState.style.display = "block";
      return;
    }
    if (emptyState) emptyState.style.display = "none";

    filtered.forEach(t => {
      const cat = this.categories.getById(t.category);
      const isIncome = t.type === "income";
      const isCredit = t.amount < 0;
      const sign = (isIncome || isCredit) ? "+" : "-";
      const color = (isIncome || isCredit) ? "#9fbe8e" : "#d4566e";
      const displayAmt = Math.abs(t.amount);
      const acc = this.accounts.find(a => a.id === t.accountId);

      const row = document.createElement("div");
      row.className = "ledger-item";
      row.style.cursor = "pointer";
      row.title = "Klikkaa muokataksesi kirjausta";
      row.onclick = (e) => {
        if (!e.target.closest("button")) this.editTransaction(t.id);
      };

      let splitHtml = "";
      if (t.splitInfo) {
        splitHtml = `<span class="tag-badge olive" style="margin-left: 6px;">Jaettu: ${t.splitInfo.person} ${(t.splitInfo.amount || 0).toFixed(2).replace(".", ",")} €</span>`;
      }

      row.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px; min-width: 0;">
          <div style="min-width: 0;">
            <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
              <p style="font-size: 13px; font-weight: 500; color: var(--c-text-primary);">${t.vendor || cat.name}</p>
              ${acc ? `<span class="tag-badge stone" style="font-size: 8px;">${acc.name}</span>` : ''}
              ${splitHtml}
            </div>
            <p style="font-size: 11px; color: var(--c-stone);">
              ${FinanceCalculator.formatDateFi(t.date)} · ${cat.name} ${t.desc ? '· ' + t.desc : ''} ${t.receiptId ? '· 📎' : ''}
            </p>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
          <span class="font-num" style="font-size: 13px; font-weight: 500; color: ${color};">
            ${sign}${FinanceCalculator.formatCurrency(displayAmt)}
          </span>
          <button onclick="app.editTransaction('${t.id}')" title="Muokkaa kirjausta" style="background: none; border: none; color: var(--c-stone); cursor: pointer; padding: 4px;">
            <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
              <path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
            </svg>
          </button>
          <button onclick="app.deleteTransaction('${t.id}')" title="Poista kirjaus" style="background: none; border: none; color: var(--c-stone); cursor: pointer; padding: 4px; font-size: 15px;">
            &times;
          </button>
        </div>
      `;
      listContainer.appendChild(row);
    });
  }

  // --- KUITTI-INBOX (Pikakuitti) ---
  switchLedgerTab(tab) {
    this.currentLedgerTab = tab;
    const tabTx = document.getElementById("tabLedgerTx");
    const tabInbox = document.getElementById("tabLedgerInbox");
    const subTx = document.getElementById("subviewLedgerTx");
    const subInbox = document.getElementById("subviewLedgerInbox");

    if (tab === "inbox") {
      if (tabTx) tabTx.classList.remove("active");
      if (tabInbox) tabInbox.classList.add("active");
      if (subTx) subTx.style.display = "none";
      if (subInbox) subInbox.style.display = "block";
      this.renderInbox();
    } else {
      if (tabInbox) tabInbox.classList.remove("active");
      if (tabTx) tabTx.classList.add("active");
      if (subInbox) subInbox.style.display = "none";
      if (subTx) subTx.style.display = "block";
      this.filterTransactions();
    }
  }

  openQuickReceiptModal() {
    this.tempQuickReceiptData = null;
    const preview = document.getElementById("quickReceiptPreview");
    if (preview) preview.style.display = "none";
    const statusText = document.getElementById("quickReceiptStatusText");
    if (statusText) statusText.innerText = "Valitse kuva tai ota valokuva kameralla:";
    const saveBtn = document.getElementById("btnSaveQuickReceipt");
    if (saveBtn) saveBtn.style.display = "none";
    const notes = document.getElementById("quickReceiptNotes");
    if (notes) notes.value = "";

    const modal = document.getElementById("modalQuickReceipt");
    if (modal) modal.classList.add("active");
  }

  async handleQuickReceiptSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    try {
      const statusText = document.getElementById("quickReceiptStatusText");
      if (statusText) statusText.innerText = "Tiivistetään kuvaa...";
      const compressed = await StorageProvider.compressImage(file, 1600, 0.8);
      this.tempQuickReceiptData = compressed;

      const previewImg = document.getElementById("quickReceiptPreviewImg");
      const preview = document.getElementById("quickReceiptPreview");
      if (previewImg && preview) {
        previewImg.src = compressed;
        preview.style.display = "block";
      }

      if (statusText) statusText.innerText = `Kuva valmis (${file.name || 'kamera'})`;
      const saveBtn = document.getElementById("btnSaveQuickReceipt");
      if (saveBtn) saveBtn.style.display = "block";
    } catch (e) {
      console.error("Kuvan tiivistysvirhe:", e);
      alert("Kuvan tiivistys epäonnistui.");
    }
  }

  async saveQuickReceiptToInbox() {
    if (!this.tempQuickReceiptData) {
      alert("Valitse ensin kuva.");
      return;
    }
    const receiptId = "rec_" + Date.now();
    await this.storage.saveReceipt(receiptId, this.tempQuickReceiptData);
    const notes = document.getElementById("quickReceiptNotes")?.value.trim() || "";

    const inboxItem = {
      id: receiptId,
      receiptId: receiptId,
      date: new Date().toISOString().split("T")[0],
      notes: notes,
      thumbnail: this.tempQuickReceiptData,
      createdAt: new Date().toISOString(),
      processed: false
    };

    this.receiptInbox.unshift(inboxItem);
    await this.storage.saveReceiptInbox(this.receiptInbox);

    this.closeModal("modalQuickReceipt");
    this.updateInboxBadges();
    if (this.currentLedgerTab === "inbox") {
      this.renderInbox();
    }
    alert("✅ Kuitti tallennettu Kuitti-Inboxiin! Voit käsitellä sen milloin vain.");
  }

  updateInboxBadges() {
    const count = this.receiptInbox.filter(r => !r.processed).length;
    const banner = document.getElementById("inboxAlertBanner");
    const countEl = document.getElementById("inboxAlertCount");
    const ledgerBadge = document.getElementById("ledgerInboxBadge");

    if (banner && countEl) {
      banner.style.display = count > 0 ? "flex" : "none";
      countEl.innerText = count;
    }
    if (ledgerBadge) {
      ledgerBadge.style.display = count > 0 ? "inline-block" : "none";
      ledgerBadge.innerText = count;
    }
  }

  renderInbox() {
    const container = document.getElementById("inboxReceiptsList");
    const emptyState = document.getElementById("inboxEmptyState");
    if (!container) return;
    container.innerHTML = "";

    const unprocessed = this.receiptInbox.filter(r => !r.processed);
    if (unprocessed.length === 0) {
      if (emptyState) emptyState.style.display = "block";
      return;
    }
    if (emptyState) emptyState.style.display = "none";

    unprocessed.forEach(item => {
      const card = document.createElement("div");
      card.className = "luxury-card";
      card.style.display = "flex";
      card.style.alignItems = "center";
      card.style.justifyContent = "space-between";
      card.style.gap = "12px";
      card.style.padding = "12px 14px";

      card.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px; min-width: 0;">
          <div class="receipt-thumb" style="background-image: url('${item.thumbnail || ''}');">
            ${!item.thumbnail ? '📎' : ''}
          </div>
          <div style="min-width: 0;">
            <p style="font-size: 13px; font-weight: 500; color: var(--c-text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              ${item.notes || 'Nimeämätön kuitti'}
            </p>
            <p style="font-size: 10px; color: var(--c-stone);" class="font-num">
              Tallennettu ${FinanceCalculator.formatDateFi(item.date)}
            </p>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
          <button class="btn-primary" style="width: auto; padding: 6px 10px; font-size: 9px;" onclick="app.processInboxReceipt('${item.id}')">
            Käsittele &rarr;
          </button>
          <button style="background: none; border: none; color: var(--c-stone); font-size: 16px; cursor: pointer; padding: 4px;" onclick="app.deleteInboxReceipt('${item.id}')" title="Poista kuitti">
            &times;
          </button>
        </div>
      `;
      container.appendChild(card);
    });
  }

  processInboxReceipt(id) {
    const item = this.receiptInbox.find(r => r.id === id);
    if (!item) return;
    this.openQuickAddModal({
      receiptId: item.receiptId || item.id,
      date: item.date,
      desc: item.notes || ""
    });
    this.activeProcessingInboxId = id;
  }

  async deleteInboxReceipt(id) {
    if (confirm("Haluatko poistaa tämän kuitin inboxista?")) {
      this.receiptInbox = this.receiptInbox.filter(r => r.id !== id);
      await this.storage.saveReceiptInbox(this.receiptInbox);
      this.updateInboxBadges();
      this.renderInbox();
    }
  }

  // --- KUUKAUSIPALVELUT (Subscriptions) ---
  switchBudgetsTab(tab) {
    this.currentBudgetsTab = tab;
    const btnSub = document.getElementById("btnSubTabSubscriptions");
    const btnCat = document.getElementById("btnSubTabCategories");
    const subSubscriptions = document.getElementById("subviewSubscriptions");
    const subCategories = document.getElementById("subviewCategories");

    if (tab === "categories") {
      if (btnSub) btnSub.classList.remove("active");
      if (btnCat) btnCat.classList.add("active");
      if (subSubscriptions) subSubscriptions.style.display = "none";
      if (subCategories) subCategories.style.display = "block";
      this.renderBudgetsView();
    } else {
      if (btnCat) btnCat.classList.remove("active");
      if (btnSub) btnSub.classList.add("active");
      if (subCategories) subCategories.style.display = "none";
      if (subSubscriptions) subSubscriptions.style.display = "block";
      this.renderSubscriptionsView();
    }
  }

  renderSubscriptionsView() {
    const container = document.getElementById("subscriptionsList");
    const totalEl = document.getElementById("subTotalMonthly");
    const breakdownEl = document.getElementById("subAccountBreakdown");
    if (!container) return;
    container.innerHTML = "";

    let totalMonthly = 0;
    const accountTotals = {};

    this.subscriptions.forEach(sub => {
      if (sub.active !== false) {
        totalMonthly += sub.amount || 0;
        const accId = sub.accountId || "acc_kayttotili";
        accountTotals[accId] = (accountTotals[accId] || 0) + (sub.amount || 0);
      }
    });

    if (totalEl) totalEl.innerText = FinanceCalculator.formatCurrency(totalMonthly);

    if (breakdownEl) {
      breakdownEl.innerHTML = "";
      Object.keys(accountTotals).forEach(accId => {
        const acc = this.accounts.find(a => a.id === accId) || { name: "Muu tili", color: "var(--c-stone)" };
        const chip = document.createElement("span");
        chip.className = "tag-badge stone";
        chip.style.borderColor = acc.color || "var(--c-border)";
        chip.innerHTML = `<span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:${acc.color}; margin-right:5px;"></span> ${acc.name}: ${FinanceCalculator.formatCurrency(accountTotals[accId])}`;
        breakdownEl.appendChild(chip);
      });
    }

    if (this.subscriptions.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 28px 14px; background: var(--c-card); border-radius: 12px; border: 1px dashed var(--c-border); font-size: 11px; color: var(--c-stone);">
          Ei kuukausitilauksia kirjattuna. Klikkaa yltä "+ Uusi kuukausipalvelu".
        </div>
      `;
      return;
    }

    this.subscriptions.forEach(sub => {
      const acc = this.accounts.find(a => a.id === sub.accountId) || { name: "Ei määritetty" };
      const card = document.createElement("div");
      card.className = "luxury-card";
      card.style.display = "flex";
      card.style.justifyContent = "space-between";
      card.style.alignItems = "center";
      card.style.padding = "12px 14px";
      card.style.opacity = sub.active !== false ? "1" : "0.5";

      card.innerHTML = `
        <div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <p style="font-size: 13px; font-weight: 500; color: var(--c-text-primary);">${sub.name}</p>
            <span class="tag-badge ${sub.active !== false ? 'olive' : 'stone'}">${sub.active !== false ? 'Aktiivinen' : 'Tauolla'}</span>
          </div>
          <p style="font-size: 10px; color: var(--c-stone); margin-top: 2px;">
            Veloitus joka kuun ${sub.billingDay}. pv · ${acc.name} ${sub.notes ? '· ' + sub.notes : ''}
          </p>
        </div>
        <div style="display: flex; align-items: center; gap: 10px;">
          <span class="font-num" style="font-size: 13px; font-weight: 500; color: var(--c-text-primary);">
            ${FinanceCalculator.formatCurrency(sub.amount || 0)} / kk
          </span>
          <button onclick="app.openSubscriptionModal('${sub.id}')" title="Muokkaa" style="background: none; border: none; color: var(--c-stone); cursor: pointer; padding: 4px;">
            <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
              <path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
            </svg>
          </button>
          <button onclick="app.deleteSubscription('${sub.id}')" title="Poista" style="background: none; border: none; color: var(--c-stone); cursor: pointer; padding: 4px; font-size: 15px;">
            &times;
          </button>
        </div>
      `;
      container.appendChild(card);
    });
  }

  openSubscriptionModal(subId = null) {
    this.populateAccountDropdowns();
    const catSelect = document.getElementById("subFormCategory");
    if (catSelect) {
      catSelect.innerHTML = "";
      this.categories.getAll().forEach(c => {
        const opt = document.createElement("option");
        opt.value = c.id;
        opt.innerText = c.name;
        catSelect.appendChild(opt);
      });
    }

    const titleEl = document.getElementById("modalSubTitle");
    const idInput = document.getElementById("subFormId");
    const nameInput = document.getElementById("subFormName");
    const amtInput = document.getElementById("subFormAmount");
    const dayInput = document.getElementById("subFormBillingDay");
    const accSelect = document.getElementById("subFormAccount");
    const notesInput = document.getElementById("subFormNotes");
    const activeCheck = document.getElementById("subFormActive");

    if (subId) {
      const sub = this.subscriptions.find(s => s.id === subId);
      if (titleEl) titleEl.innerText = "Muokkaa kuukausipalvelua";
      if (idInput) idInput.value = sub.id;
      if (nameInput) nameInput.value = sub.name;
      if (amtInput) amtInput.value = sub.amount;
      if (dayInput) dayInput.value = sub.billingDay || 1;
      if (accSelect) accSelect.value = sub.accountId || "";
      if (catSelect && sub.categoryId) catSelect.value = sub.categoryId;
      if (notesInput) notesInput.value = sub.notes || "";
      if (activeCheck) activeCheck.checked = sub.active !== false;
    } else {
      if (titleEl) titleEl.innerText = "Uusi kuukausipalvelu";
      if (idInput) idInput.value = "";
      if (nameInput) nameInput.value = "";
      if (amtInput) amtInput.value = "";
      if (dayInput) dayInput.value = 1;
      if (notesInput) notesInput.value = "";
      if (activeCheck) activeCheck.checked = true;
    }

    const modal = document.getElementById("modalSubscription");
    if (modal) modal.classList.add("active");
  }

  async handleSubscriptionSubmit(event) {
    event.preventDefault();
    const id = document.getElementById("subFormId").value || ("sub_" + Date.now());
    const name = document.getElementById("subFormName").value.trim();
    const amount = parseFloat(document.getElementById("subFormAmount").value) || 0;
    const billingDay = parseInt(document.getElementById("subFormBillingDay").value, 10) || 1;
    const accountId = document.getElementById("subFormAccount").value;
    const categoryId = document.getElementById("subFormCategory").value;
    const notes = document.getElementById("subFormNotes").value.trim();
    const active = document.getElementById("subFormActive").checked;

    const sub = { id, name, amount, billingDay, accountId, categoryId, notes, active };
    const existingIndex = this.subscriptions.findIndex(s => s.id === id);
    if (existingIndex >= 0) {
      this.subscriptions[existingIndex] = sub;
    } else {
      this.subscriptions.push(sub);
    }

    await this.storage.saveSubscriptions(this.subscriptions);
    this.closeModal("modalSubscription");
    this.renderSubscriptionsView();
  }

  async deleteSubscription(subId) {
    if (confirm("Haluatko poistaa tämän kuukausitilauksen?")) {
      this.subscriptions = this.subscriptions.filter(s => s.id !== subId);
      await this.storage.saveSubscriptions(this.subscriptions);
      this.renderSubscriptionsView();
    }
  }

  // --- KATEGORIAT & KUUKAUSIBUDJETIT ---
  renderBudgetsView() {
    const container = document.getElementById("categoryGroupsContainer");
    if (!container) return;
    container.innerHTML = "";

    const now = new Date();
    const periodRange = FinanceCalculator.getCurrentPeriodRange(this.paydayDay, now);
    const stats = FinanceCalculator.calculateStats(
      this.transactions,
      this.categories.getAll(),
      undefined,
      undefined,
      periodRange
    );
    const categoryTotals = stats.categoryTotals || {};

    let totalBudget = 0;
    let totalSpent = 0;

    const allCats = this.categories.getAll();
    allCats.forEach(c => {
      if (c.type !== "income") {
        totalBudget += (c.budgetMonthly || 0);
        totalSpent += (categoryTotals[c.id] || 0);
      }
    });

    const totalRemaining = Math.max(0, totalBudget - totalSpent);

    const elBudget = document.getElementById("catTotalBudgetMonthly");
    if (elBudget) elBudget.innerText = FinanceCalculator.formatCurrency(totalBudget);
    const elSpent = document.getElementById("catTotalSpentMonthly");
    if (elSpent) elSpent.innerText = FinanceCalculator.formatCurrency(totalSpent);
    const elRemaining = document.getElementById("catTotalRemainingMonthly");
    if (elRemaining) elRemaining.innerText = FinanceCalculator.formatCurrency(totalRemaining);

    const groups = this.categories.getGroups();
    groups.forEach(g => {
      const groupCats = this.categories.getByGroup(g.id);
      const groupCard = document.createElement("div");
      groupCard.className = "luxury-card";
      groupCard.style.padding = "16px";

      let catsHtml = "";
      groupCats.forEach(c => {
        const spent = categoryTotals[c.id] || 0;
        const budget = c.budgetMonthly || 0;
        const hasBudget = budget > 0;
        const pct = hasBudget ? Math.min(100, Math.round((spent / budget) * 100)) : 0;
        let barColor = c.color || "var(--c-olive)";
        if (pct > 90) barColor = "var(--c-crimson)";

        catsHtml += `
          <div style="padding: 10px 0; border-bottom: 1px solid rgba(165,160,136,0.1);">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div style="display: flex; align-items: center; gap: 8px; cursor: pointer;" onclick="app.openCategoryModal('${c.id}')">
                <span style="width: 8px; height: 8px; border-radius: 50%; background-color: ${c.color}; flex-shrink: 0;"></span>
                <span style="font-size: 13px; font-weight: 500;">${c.name}</span>
                ${c.quickAction ? '<span style="font-size: 9px; padding: 1px 5px; border-radius: 4px; background: rgba(166,36,60,0.2); color: var(--c-crimson); font-family: ui-monospace, monospace;">PIKA</span>' : ''}
              </div>
              <div style="display: flex; align-items: center; gap: 8px;" class="font-num">
                <span style="font-size: 12px; color: ${hasBudget ? 'var(--c-text-primary)' : 'var(--c-stone)'}; cursor: pointer;" onclick="app.openCategoryModal('${c.id}')">
                  ${spent.toFixed(2).replace(".", ",")} € ${hasBudget ? '<span style="color: var(--c-stone); font-size: 11px;">/ ' + budget.toFixed(0) + ' €</span>' : '<span style="color: rgba(165,160,136,0.5); font-size: 10px;">(ei tavoitetta)</span>'}
                </span>
                <button onclick="app.openCategoryModal('${c.id}')" title="Muokkaa kategoriaa ja tavoitetta" style="background: none; border: none; color: var(--c-stone); cursor: pointer; padding: 3px;">
                  <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                    <path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
                  </svg>
                </button>
                <button onclick="app.deleteCategory('${c.id}')" title="Poista kategoria" style="background: none; border: none; color: var(--c-stone); cursor: pointer; padding: 3px; font-size: 15px; line-height: 1;">&times;</button>
              </div>
            </div>
            ${hasBudget ? `
              <div class="meter-track" style="margin-top: 6px; height: 4px; background: rgba(255,255,255,0.06); border-radius: 2px;">
                <div class="meter-fill" style="width: ${pct}%; height: 100%; border-radius: 2px; background-color: ${barColor};"></div>
              </div>
              <div style="display: flex; justify-content: space-between; font-size: 9px; color: var(--c-stone); margin-top: 3px; font-family: ui-monospace, monospace;">
                <span>${pct} % käytetty</span>
                <span>${Math.max(0, budget - spent).toFixed(2).replace(".", ",")} € jäljellä</span>
              </div>
            ` : ''}
          </div>
        `;
      });

      groupCard.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <span class="card-label" style="margin: 0; color: ${g.color};">${g.name}</span>
          <button onclick="app.openCategoryModal(null, '${g.id}')" style="background: none; border: none; font-size: 11px; color: var(--c-stone); cursor: pointer; text-transform: uppercase; letter-spacing: 0.08em;">
            + Lisää
          </button>
        </div>
        <div style="display: flex; flex-direction: column;">
          ${catsHtml || '<p style="font-size: 11px; color: var(--c-stone); padding: 8px 0;">Ei kategorioita tässä ryhmässä.</p>'}
        </div>
      `;
      container.appendChild(groupCard);
    });
  }

  // --- VELAT & SITOUMUKSET ---
  switchDebtTab(tab) {
    this.currentDebtTab = tab;
    const btnDebt = document.getElementById("btnDebtTabDebts");
    const btnP2P = document.getElementById("btnDebtTabP2P");
    const subDebts = document.getElementById("subviewDebts");
    const subP2P = document.getElementById("subviewP2P");

    if (tab === "p2p") {
      if (btnDebt) btnDebt.classList.remove("active");
      if (btnP2P) btnP2P.classList.add("active");
      if (subDebts) subDebts.style.display = "none";
      if (subP2P) subP2P.style.display = "block";
      this.renderP2PView();
    } else {
      if (btnP2P) btnP2P.classList.remove("active");
      if (btnDebt) btnDebt.classList.add("active");
      if (subP2P) subP2P.style.display = "none";
      if (subDebts) subDebts.style.display = "block";
      this.renderDebtsView();
    }
  }

  renderDebtsView() {
    const container = document.getElementById("debtsList");
    const remainingEl = document.getElementById("debtTotalRemaining");
    const monthlyEl = document.getElementById("debtTotalMonthly");
    const salaryEl = document.getElementById("debtFromSalary");
    const selfEl = document.getElementById("debtFromSelf");
    if (!container) return;
    container.innerHTML = "";

    let totalRemaining = 0;
    let totalMonthly = 0;
    let salaryMonthly = 0;
    let selfMonthly = 0;

    this.debts.forEach(d => {
      totalRemaining += d.remainingAmount || 0;
      totalMonthly += d.monthlyPayment || 0;
      if (d.paymentSource === "salary") {
        salaryMonthly += d.monthlyPayment || 0;
      } else {
        selfMonthly += d.monthlyPayment || 0;
      }
    });

    if (remainingEl) remainingEl.innerText = FinanceCalculator.formatCurrency(totalRemaining);
    if (monthlyEl) monthlyEl.innerText = FinanceCalculator.formatCurrency(totalMonthly);
    if (salaryEl) salaryEl.innerText = FinanceCalculator.formatCurrency(salaryMonthly);
    if (selfEl) selfEl.innerText = FinanceCalculator.formatCurrency(selfMonthly);

    if (this.debts.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 28px 14px; background: var(--c-card); border-radius: 12px; border: 1px dashed var(--c-border); font-size: 11px; color: var(--c-stone);">
          Ei velkoja tai sitoumuksia kirjattuna. Klikkaa yltä "+ Uusi velka / sitoumus".
        </div>
      `;
      return;
    }

    this.debts.forEach(d => {
      const total = d.totalAmount || d.remainingAmount || 0;
      const rem = d.remainingAmount || 0;
      const pctPaid = total > 0 ? Math.min(100, Math.round(((total - rem) / total) * 100)) : 0;
      const sourceLabel = d.paymentSource === "salary" ? "Palkasta suoraan" : (d.paymentSource === "self_account" ? "Käyttötililtä" : "Muu");

      const card = document.createElement("div");
      card.className = "luxury-card";
      card.style.padding = "14px";

      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <h4 style="font-size: 13px; font-weight: 500; color: var(--c-text-primary);">${d.name}</h4>
            <span class="tag-badge ${d.paymentSource === 'salary' ? 'crimson' : 'stone'}">${sourceLabel}</span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <button onclick="app.openDebtModal('${d.id}')" title="Muokkaa" style="background: none; border: none; color: var(--c-stone); cursor: pointer; padding: 3px;">
              <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                <path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
              </svg>
            </button>
            <button onclick="app.deleteDebt('${d.id}')" title="Poista" style="background: none; border: none; color: var(--c-stone); cursor: pointer; padding: 3px; font-size: 15px;">&times;</button>
          </div>
        </div>

        <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px;" class="font-num">
          <span style="color: var(--c-stone);">Jäljellä: <b style="color: #d4566e;">${FinanceCalculator.formatCurrency(rem)}</b></span>
          <span style="color: var(--c-stone);">Alkuperäinen: ${FinanceCalculator.formatCurrency(total)}</span>
        </div>

        <div class="meter-track" style="margin-bottom: 8px;">
          <div class="meter-fill" style="width: ${pctPaid}%; background-color: var(--c-olive);"></div>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: var(--c-stone);">
          <span>Lyhennys: <b class="font-num" style="color: var(--c-text-primary);">${FinanceCalculator.formatCurrency(d.monthlyPayment || 0)}/kk</b> (erä ${d.dueDay || 20}. pv)</span>
          <button class="btn-primary" style="width: auto; padding: 5px 10px; font-size: 9px; background: #252527; border: 1px solid var(--c-border); color: var(--c-text-primary);" onclick="app.recordDebtPaymentPrompt('${d.id}')">
            Kirjaa lyhennys &rarr;
          </button>
        </div>
      `;
      container.appendChild(card);
    });
  }

  openDebtModal(debtId = null) {
    const titleEl = document.getElementById("modalDebtTitle");
    const idInput = document.getElementById("debtFormId");
    const nameInput = document.getElementById("debtFormName");
    const totalInput = document.getElementById("debtFormTotal");
    const remInput = document.getElementById("debtFormRemaining");
    const monthlyInput = document.getElementById("debtFormMonthly");
    const dayInput = document.getElementById("debtFormDueDay");
    const sourceSelect = document.getElementById("debtFormPaymentSource");
    const notesInput = document.getElementById("debtFormNotes");

    if (debtId) {
      const d = this.debts.find(item => item.id === debtId);
      if (titleEl) titleEl.innerText = "Muokkaa velkaa / sitoumusta";
      if (idInput) idInput.value = d.id;
      if (nameInput) nameInput.value = d.name;
      if (totalInput) totalInput.value = d.totalAmount || "";
      if (remInput) remInput.value = d.remainingAmount;
      if (monthlyInput) monthlyInput.value = d.monthlyPayment || "";
      if (dayInput) dayInput.value = d.dueDay || 20;
      if (sourceSelect) sourceSelect.value = d.paymentSource || "salary";
      if (notesInput) notesInput.value = d.notes || "";
    } else {
      if (titleEl) titleEl.innerText = "Uusi velka / sitoumus";
      if (idInput) idInput.value = "";
      if (nameInput) nameInput.value = "";
      if (totalInput) totalInput.value = "";
      if (remInput) remInput.value = "";
      if (monthlyInput) monthlyInput.value = "";
      if (dayInput) dayInput.value = 20;
      if (sourceSelect) sourceSelect.value = "salary";
      if (notesInput) notesInput.value = "";
    }

    const modal = document.getElementById("modalDebt");
    if (modal) modal.classList.add("active");
  }

  async handleDebtSubmit(event) {
    event.preventDefault();
    const id = document.getElementById("debtFormId").value || ("debt_" + Date.now());
    const name = document.getElementById("debtFormName").value.trim();
    const totalAmount = parseFloat(document.getElementById("debtFormTotal").value) || 0;
    const remainingAmount = parseFloat(document.getElementById("debtFormRemaining").value) || 0;
    const monthlyPayment = parseFloat(document.getElementById("debtFormMonthly").value) || 0;
    const dueDay = parseInt(document.getElementById("debtFormDueDay").value, 10) || 20;
    const paymentSource = document.getElementById("debtFormPaymentSource").value;
    const notes = document.getElementById("debtFormNotes").value.trim();

    const d = { id, name, totalAmount: totalAmount || remainingAmount, remainingAmount, monthlyPayment, dueDay, paymentSource, notes };
    const existingIndex = this.debts.findIndex(item => item.id === id);
    if (existingIndex >= 0) {
      this.debts[existingIndex] = d;
    } else {
      this.debts.push(d);
    }

    await this.storage.saveDebts(this.debts);
    this.closeModal("modalDebt");
    this.renderDebtsView();
  }

  async recordDebtPaymentPrompt(debtId) {
    const d = this.debts.find(item => item.id === debtId);
    if (!d) return;
    const defaultAmt = d.monthlyPayment || 100;
    const input = prompt(`Kirjaa lyhennys kohteelle "${d.name}" (€):`, defaultAmt);
    if (input === null) return;
    const amt = parseFloat(input);
    if (isNaN(amt) || amt <= 0) {
      alert("Virheellinen summa.");
      return;
    }
    d.remainingAmount = Math.max(0, (d.remainingAmount || 0) - amt);
    await this.storage.saveDebts(this.debts);

    if (confirm(`Lyhennys ${FinanceCalculator.formatCurrency(amt)} kirjattu saldosta! Haluatko luoda myös kulu-kirjauksen Päiväkirjaan?`)) {
      const tx = {
        id: "tx_" + Date.now(),
        date: new Date().toISOString().split("T")[0],
        type: "expense",
        category: "laskut",
        amount: amt,
        vendor: d.name,
        desc: "Velan lyhennys",
        updatedAt: new Date().toISOString()
      };
      await this.storage.saveTransaction(tx);
      await this.refreshData();
    } else {
      this.renderDebtsView();
    }
  }

  async deleteDebt(debtId) {
    if (confirm("Haluatko poistaa tämän velan seurannasta?")) {
      this.debts = this.debts.filter(d => d.id !== debtId);
      await this.storage.saveDebts(this.debts);
      this.renderDebtsView();
    }
  }

  // --- LAINAT & SAATAVAT (P2P) ---
  setP2PType(type) {
    this.p2pType = type;
    const btnLent = document.getElementById("btnP2PLent");
    const btnBorrowed = document.getElementById("btnP2PBorrowed");
    if (type === "lent") {
      btnLent.style.backgroundColor = "var(--c-olive)";
      btnLent.style.color = "var(--c-text-primary)";
      btnBorrowed.style.backgroundColor = "var(--c-card)";
      btnBorrowed.style.color = "var(--c-stone)";
    } else {
      btnBorrowed.style.backgroundColor = "var(--c-crimson)";
      btnBorrowed.style.color = "var(--c-text-primary)";
      btnLent.style.backgroundColor = "var(--c-card)";
      btnLent.style.color = "var(--c-stone)";
    }
  }

  renderP2PView() {
    const container = document.getElementById("p2pList");
    const recEl = document.getElementById("p2pTotalReceivable");
    const payEl = document.getElementById("p2pTotalPayable");
    if (!container) return;
    container.innerHTML = "";

    let totalRec = 0;
    let totalPay = 0;

    this.p2pLoans.forEach(p => {
      if (!p.settled) {
        if (p.type === "lent") {
          totalRec += p.amount || 0;
        } else {
          totalPay += p.amount || 0;
        }
      }
    });

    if (recEl) recEl.innerText = "+" + FinanceCalculator.formatCurrency(totalRec);
    if (payEl) payEl.innerText = "-" + FinanceCalculator.formatCurrency(totalPay);

    if (this.p2pLoans.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 28px 14px; background: var(--c-card); border-radius: 12px; border: 1px dashed var(--c-border); font-size: 11px; color: var(--c-stone);">
          Ei lainoja tai saatavia kirjattuna. Klikkaa yltä "+ Uusi laina / saatava".
        </div>
      `;
      return;
    }

    this.p2pLoans.forEach(p => {
      const isLent = p.type === "lent";
      const card = document.createElement("div");
      card.className = "luxury-card";
      card.style.display = "flex";
      card.style.justifyContent = "space-between";
      card.style.alignItems = "center";
      card.style.padding = "12px 14px";
      card.style.opacity = p.settled ? "0.45" : "1";

      card.innerHTML = `
        <div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <p style="font-size: 13px; font-weight: 500; color: var(--c-text-primary);">${p.person}</p>
            <span class="tag-badge ${p.settled ? 'stone' : (isLent ? 'olive' : 'crimson')}">
              ${p.settled ? 'Kuitattu' : (isLent ? 'Saatava' : 'Velkaa')}
            </span>
          </div>
          <p style="font-size: 10px; color: var(--c-stone); margin-top: 2px;">
            ${FinanceCalculator.formatDateFi(p.date)} ${p.dueDate ? '· Eräpv ' + FinanceCalculator.formatDateFi(p.dueDate) : ''} ${p.notes ? '· ' + p.notes : ''}
          </p>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span class="font-num" style="font-size: 13px; font-weight: 500; color: ${p.settled ? 'var(--c-stone)' : (isLent ? '#9fbe8e' : '#d4566e')};">
            ${isLent ? '+' : '-'}${FinanceCalculator.formatCurrency(p.amount || 0)}
          </span>
          <button class="btn-primary" style="width: auto; padding: 5px 8px; font-size: 9px; background: #252527; border: 1px solid var(--c-border); color: var(--c-text-primary);" onclick="app.toggleP2PSettled('${p.id}')">
            ${p.settled ? 'Avaa' : 'Kuittaa'}
          </button>
          <button onclick="app.openP2PModal('${p.id}')" title="Muokkaa" style="background: none; border: none; color: var(--c-stone); cursor: pointer; padding: 3px;">
            <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
              <path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
            </svg>
          </button>
          <button onclick="app.deleteP2P('${p.id}')" title="Poista" style="background: none; border: none; color: var(--c-stone); cursor: pointer; padding: 3px; font-size: 15px;">&times;</button>
        </div>
      `;
      container.appendChild(card);
    });
  }

  openP2PModal(p2pId = null) {
    const titleEl = document.getElementById("modalP2PTitle");
    const idInput = document.getElementById("p2pFormId");
    const personInput = document.getElementById("p2pFormPerson");
    const amtInput = document.getElementById("p2pFormAmount");
    const dateInput = document.getElementById("p2pFormDate");
    const dueInput = document.getElementById("p2pFormDueDate");
    const notesInput = document.getElementById("p2pFormNotes");

    if (p2pId) {
      const p = this.p2pLoans.find(item => item.id === p2pId);
      if (titleEl) titleEl.innerText = "Muokkaa lainaa / saatavaa";
      if (idInput) idInput.value = p.id;
      if (personInput) personInput.value = p.person;
      if (amtInput) amtInput.value = p.amount;
      if (dateInput) dateInput.value = p.date || new Date().toISOString().split("T")[0];
      if (dueInput) dueInput.value = p.dueDate || "";
      if (notesInput) notesInput.value = p.notes || "";
      this.setP2PType(p.type || "lent");
    } else {
      if (titleEl) titleEl.innerText = "Uusi laina / saatava";
      if (idInput) idInput.value = "";
      if (personInput) personInput.value = "";
      if (amtInput) amtInput.value = "";
      if (dateInput) dateInput.value = new Date().toISOString().split("T")[0];
      if (dueInput) dueInput.value = "";
      if (notesInput) notesInput.value = "";
      this.setP2PType("lent");
    }

    const modal = document.getElementById("modalP2P");
    if (modal) modal.classList.add("active");
  }

  async handleP2PSubmit(event) {
    event.preventDefault();
    const id = document.getElementById("p2pFormId").value || ("p2p_" + Date.now());
    const person = document.getElementById("p2pFormPerson").value.trim();
    const amount = parseFloat(document.getElementById("p2pFormAmount").value) || 0;
    const date = document.getElementById("p2pFormDate").value;
    const dueDate = document.getElementById("p2pFormDueDate").value;
    const notes = document.getElementById("p2pFormNotes").value.trim();

    const p = { id, person, type: this.p2pType, amount, date, dueDate, notes, settled: false };
    const existingIndex = this.p2pLoans.findIndex(item => item.id === id);
    if (existingIndex >= 0) {
      p.settled = this.p2pLoans[existingIndex].settled;
      this.p2pLoans[existingIndex] = p;
    } else {
      this.p2pLoans.push(p);
    }

    await this.storage.saveP2pLoans(this.p2pLoans);
    this.closeModal("modalP2P");
    this.renderP2PView();
  }

  async toggleP2PSettled(p2pId) {
    const p = this.p2pLoans.find(item => item.id === p2pId);
    if (!p) return;
    p.settled = !p.settled;
    await this.storage.saveP2pLoans(this.p2pLoans);
    this.renderP2PView();
  }

  async deleteP2P(p2pId) {
    if (confirm("Haluatko poistaa tämän merkinnän?")) {
      this.p2pLoans = this.p2pLoans.filter(p => p.id !== p2pId);
      await this.storage.saveP2pLoans(this.p2pLoans);
      this.renderP2PView();
    }
  }

  // --- KULUJEN JAKO (SPLIT EXPENSE) ---
  openSplitModalForCurrentTx() {
    const txId = document.getElementById("formTxId")?.value;
    if (!txId) return;
    const tx = this.transactions.find(t => t.id === txId);
    if (!tx) return;

    this.currentSplittingTx = tx;
    const totalEl = document.getElementById("splitModalTotalAmt");
    const vendorEl = document.getElementById("splitModalVendor");
    const personInput = document.getElementById("splitPersonName");
    const personAmtInput = document.getElementById("splitPersonAmount");
    const myAmtInput = document.getElementById("splitMyAmount");

    if (totalEl) totalEl.innerText = FinanceCalculator.formatCurrency(tx.amount);
    if (vendorEl) vendorEl.innerText = tx.vendor || tx.category;

    if (tx.splitInfo) {
      if (personInput) personInput.value = tx.splitInfo.person || "";
      if (personAmtInput) personAmtInput.value = tx.splitInfo.amount || "";
      if (myAmtInput) myAmtInput.value = (tx.amount - (tx.splitInfo.amount || 0)).toFixed(2);
    } else {
      const half = (tx.amount / 2).toFixed(2);
      if (personInput) personInput.value = "";
      if (personAmtInput) personAmtInput.value = half;
      if (myAmtInput) myAmtInput.value = (tx.amount - half).toFixed(2);
    }

    const modal = document.getElementById("modalSplitExpense");
    if (modal) modal.classList.add("active");
  }

  calculateSplitRemainder() {
    if (!this.currentSplittingTx) return;
    const total = this.currentSplittingTx.amount || 0;
    const personAmt = parseFloat(document.getElementById("splitPersonAmount")?.value) || 0;
    const myAmt = Math.max(0, total - personAmt);
    const myInput = document.getElementById("splitMyAmount");
    if (myInput) myInput.value = myAmt.toFixed(2);
  }

  setEqualSplit() {
    if (!this.currentSplittingTx) return;
    const half = (this.currentSplittingTx.amount / 2).toFixed(2);
    const personInput = document.getElementById("splitPersonAmount");
    const myInput = document.getElementById("splitMyAmount");
    if (personInput) personInput.value = half;
    if (myInput) myInput.value = (this.currentSplittingTx.amount - half).toFixed(2);
  }

  async confirmSplitExpense() {
    if (!this.currentSplittingTx) return;
    const person = document.getElementById("splitPersonName")?.value.trim();
    if (!person) {
      alert("Syötä henkilön nimi.");
      return;
    }
    const personAmt = parseFloat(document.getElementById("splitPersonAmount")?.value) || 0;
    if (personAmt <= 0) {
      alert("Syötä jaettava summa.");
      return;
    }

    this.currentSplittingTx.splitInfo = { person, amount: personAmt };
    await this.storage.saveTransaction(this.currentSplittingTx);

    const autoP2P = document.getElementById("splitAutoAddP2P")?.checked;
    if (autoP2P) {
      const p2pEntry = {
        id: "p2p_" + Date.now(),
        person: person,
        type: "lent",
        amount: personAmt,
        date: this.currentSplittingTx.date || new Date().toISOString().split("T")[0],
        notes: "Kulujaettu: " + (this.currentSplittingTx.vendor || "Ostos"),
        settled: false,
        transactionId: this.currentSplittingTx.id
      };
      this.p2pLoans.push(p2pEntry);
      await this.storage.saveP2pLoans(this.p2pLoans);
    }

    this.closeModal("modalSplitExpense");
    this.closeModal("modalQuickAdd");
    await this.refreshData();
    alert(`✅ Kulu jaettu! ${person}:n osuus ${FinanceCalculator.formatCurrency(personAmt)} lisätty saatavaksi.`);
  }

  // --- TILIT & MAKSUTAVAT (Accounts) ---
  populateAccountDropdowns() {
    const formAcc = document.getElementById("formAccount");
    const subAcc = document.getElementById("subFormAccount");

    const populate = (selectEl) => {
      if (!selectEl) return;
      const currentVal = selectEl.value;
      selectEl.innerHTML = "";
      this.accounts.forEach(acc => {
        const opt = document.createElement("option");
        opt.value = acc.id;
        opt.innerText = acc.name;
        selectEl.appendChild(opt);
      });
      if (currentVal && selectEl.querySelector(`option[value="${currentVal}"]`)) {
        selectEl.value = currentVal;
      }
    };

    populate(formAcc);
    populate(subAcc);
  }

  renderAccountsList() {
    const container = document.getElementById("accountsList");
    if (!container) return;
    container.innerHTML = "";

    const typeLabels = {
      bank: "Pankkitili",
      cash: "Käteinen",
      credit: "Luottokortti",
      bill: "Laskutus",
      other: "Muu"
    };

    this.accounts.forEach(acc => {
      const row = document.createElement("div");
      row.className = "luxury-card";
      row.style.display = "flex";
      row.style.justifyContent = "space-between";
      row.style.alignItems = "center";
      row.style.padding = "10px 14px";

      row.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="width: 8px; height: 8px; border-radius: 50%; background-color: ${acc.color || '#BFB99E'};"></span>
          <span style="font-size: 13px; font-weight: 500;">${acc.name}</span>
          <span class="tag-badge stone">${typeLabels[acc.type] || 'Tili'}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <button onclick="app.openAccountModal('${acc.id}')" title="Muokkaa" style="background: none; border: none; color: var(--c-stone); cursor: pointer; padding: 3px;">
            <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
              <path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
            </svg>
          </button>
          <button onclick="app.deleteAccount('${acc.id}')" title="Poista" style="background: none; border: none; color: var(--c-stone); cursor: pointer; padding: 3px; font-size: 15px;">&times;</button>
        </div>
      `;
      container.appendChild(row);
    });
  }

  openAccountModal(accId = null) {
    const titleEl = document.getElementById("modalAccountTitle");
    const idInput = document.getElementById("accountFormId");
    const nameInput = document.getElementById("accountFormName");
    const typeSelect = document.getElementById("accountFormType");
    const colorInput = document.getElementById("accountFormColor");
    const hexInput = document.getElementById("accountFormColorHex");

    if (accId) {
      const acc = this.accounts.find(a => a.id === accId);
      if (titleEl) titleEl.innerText = "Muokkaa tiliä / maksutapaa";
      if (idInput) idInput.value = acc.id;
      if (nameInput) nameInput.value = acc.name;
      if (typeSelect) typeSelect.value = acc.type || "bank";
      if (colorInput) colorInput.value = acc.color || "#BFB99E";
      if (hexInput) hexInput.value = acc.color || "#BFB99E";
    } else {
      if (titleEl) titleEl.innerText = "Uusi tili / maksutapa";
      if (idInput) idInput.value = "";
      if (nameInput) nameInput.value = "";
      if (typeSelect) typeSelect.value = "bank";
      if (colorInput) colorInput.value = "#BFB99E";
      if (hexInput) hexInput.value = "#BFB99E";
    }

    const modal = document.getElementById("modalAccount");
    if (modal) modal.classList.add("active");
  }

  async handleAccountSubmit(event) {
    event.preventDefault();
    const id = document.getElementById("accountFormId").value || ("acc_" + Date.now());
    const name = document.getElementById("accountFormName").value.trim();
    const type = document.getElementById("accountFormType").value;
    const color = document.getElementById("accountFormColor").value;

    const acc = { id, name, type, color };
    const existingIndex = this.accounts.findIndex(a => a.id === id);
    if (existingIndex >= 0) {
      this.accounts[existingIndex] = acc;
    } else {
      this.accounts.push(acc);
    }

    await this.storage.saveAccounts(this.accounts);
    this.closeModal("modalAccount");
    this.populateAccountDropdowns();
    this.renderAccountsList();
  }

  async deleteAccount(accId) {
    if (this.accounts.length <= 1) {
      alert("Ainakin yksi tili tai maksutapa tulee säilyttää.");
      return;
    }
    if (confirm("Haluatko poistaa tämän tilin / maksutavan?")) {
      this.accounts = this.accounts.filter(a => a.id !== accId);
      await this.storage.saveAccounts(this.accounts);
      this.populateAccountDropdowns();
      this.renderAccountsList();
    }
  }

  // --- VIEWS & NAVIGATION ---
  switchView(viewId, subTab = null) {
    const views = ["viewKoti", "viewTapahtumat", "viewBudjetit", "viewVelat", "viewAsetukset"];
    views.forEach(v => {
      const el = document.getElementById(v);
      if (el) el.style.display = v === viewId ? "block" : "none";
    });

    const navs = ["navKoti", "navTapahtumat", "navBudjetit", "navVelat"];
    navs.forEach(n => {
      const el = document.getElementById(n);
      if (el) el.classList.remove("active");
    });

    const activeNav = document.getElementById("nav" + viewId.replace("view", ""));
    if (activeNav) activeNav.classList.add("active");

    const btnSettings = document.getElementById("btnHeaderSettings");
    if (btnSettings) {
      if (viewId === "viewAsetukset") {
        btnSettings.classList.add("active");
      } else {
        btnSettings.classList.remove("active");
      }
    }

    if (this.currentView !== "viewAsetukset") {
      this.previousView = this.currentView;
    }
    this.currentView = viewId;

    if (subTab) {
      if (viewId === "viewTapahtumat") {
        this.switchLedgerTab(subTab);
      } else if (viewId === "viewBudjetit") {
        this.switchBudgetsTab(subTab);
      } else if (viewId === "viewVelat") {
        this.switchDebtTab(subTab);
      }
    } else {
      if (viewId === "viewBudjetit") {
        if (!this.currentBudgetsTab) this.currentBudgetsTab = "categories";
        this.switchBudgetsTab(this.currentBudgetsTab);
      }
    }
  }

  toggleSettingsView() {
    if (this.currentView === "viewAsetukset") {
      this.switchView(this.previousView || "viewKoti");
    } else {
      this.previousView = this.currentView;
      this.switchView("viewAsetukset");
    }
  }

  // --- MODALS & QUICK ADD ---
  openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add("active");
  }

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove("active");
  }

  openFabChoice() {
    this.openModal("modalFabChoice");
  }

  chooseFabAction(action) {
    this.closeModal("modalFabChoice");
    if (action === "receipt") {
      this.openQuickReceiptModal();
    } else {
      this.openQuickAddModal();
    }
  }

  openQuickAddModal(prefill = {}) {
    const modal = document.getElementById("modalQuickAdd");
    if (!modal) return;

    this.tempReceiptData = null;
    this.currentReceiptId = prefill.receiptId || null;

    const modalTitle = document.getElementById("modalFormTitle");
    if (modalTitle) modalTitle.innerText = prefill.id ? "Muokkaa kirjausta" : "Uusi kirjaus";

    const nameEl = document.getElementById("receiptFileName");
    const removeBtn = document.getElementById("btnRemoveReceipt");
    if (prefill.receiptId) {
      if (nameEl) nameEl.innerText = "Kuitti tallennettu 📎";
      if (removeBtn) removeBtn.style.display = "inline";
    } else {
      if (nameEl) nameEl.innerText = "Liitä kuitti (valinnainen)";
      if (removeBtn) removeBtn.style.display = "none";
    }

    document.getElementById("formTxId").value = prefill.id || "";
    document.getElementById("formAmount").value = prefill.amount ? prefill.amount.toFixed(2) : "";
    document.getElementById("formVendor").value = prefill.vendor || "";
    document.getElementById("formDate").value = prefill.date || new Date().toISOString().split("T")[0];
    document.getElementById("formDesc").value = prefill.desc || "";

    // Maksutapa / Tili dropdown
    this.populateAccountDropdowns();
    const accSelect = document.getElementById("formAccount");
    if (accSelect && prefill.accountId) {
      accSelect.value = prefill.accountId;
    }

    // Split expense action button
    const splitRow = document.getElementById("splitExpenseActionRow");
    if (splitRow) {
      splitRow.style.display = prefill.id ? "block" : "none";
    }

    this.setFormType(prefill.type || "expense");
    this.renderCategoryPills(prefill.categoryId || this.selectedCatId);

    modal.classList.add("active");
    setTimeout(() => {
      document.getElementById("formAmount").focus();
    }, 200);
  }

  clearReceipt() {
    this.tempReceiptData = null;
    this.currentReceiptId = null;
    const nameEl = document.getElementById("receiptFileName");
    if (nameEl) nameEl.innerText = "Liitä kuitti (valinnainen)";
    const removeBtn = document.getElementById("btnRemoveReceipt");
    if (removeBtn) removeBtn.style.display = "none";
    const cam = document.getElementById("formReceiptCamera");
    if (cam) cam.value = "";
    const file = document.getElementById("formReceiptFile");
    if (file) file.value = "";
  }

  editTransaction(id) {
    const tx = this.transactions.find(t => t.id === id);
    if (!tx) return;
    this.openQuickAddModal({
      id: tx.id,
      amount: tx.amount,
      vendor: tx.vendor,
      date: tx.date,
      desc: tx.desc,
      type: tx.type,
      categoryId: tx.category,
      receiptId: tx.receiptId,
      accountId: tx.accountId
    });
  }

  setFormType(type) {
    this.formType = type;
    const btnExp = document.getElementById("btnTypeExpense");
    const btnInc = document.getElementById("btnTypeIncome");
    if (type === "expense") {
      btnExp.style.backgroundColor = "var(--c-crimson)";
      btnExp.style.color = "var(--c-text-primary)";
      btnInc.style.backgroundColor = "var(--c-card)";
      btnInc.style.color = "var(--c-stone)";
    } else {
      btnInc.style.backgroundColor = "var(--c-olive)";
      btnInc.style.color = "var(--c-text-primary)";
      btnExp.style.backgroundColor = "var(--c-card)";
      btnExp.style.color = "var(--c-stone)";
    }
  }

  renderCategoryPills(activeCatId) {
    const container = document.getElementById("modalCategoryPills");
    if (!container) return;
    container.innerHTML = "";

    const cats = this.categories.getAll().filter(c => {
      return this.formType === "income" ? c.type === "income" : c.type !== "income";
    });

    cats.forEach(c => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "form-input";
      btn.style.padding = "8px 10px";
      btn.style.fontSize = "11px";
      btn.style.textAlign = "left";
      btn.style.cursor = "pointer";

      const isSelected = c.id === activeCatId;
      if (isSelected) {
        btn.style.borderColor = c.color;
        btn.style.backgroundColor = "#2d2d30";
      }

      btn.onclick = () => {
        this.selectedCatId = c.id;
        this.renderCategoryPills(c.id);
      };

      btn.innerHTML = `
        <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background-color: ${c.color}; margin-right: 6px;"></span>
        ${c.name}
      `;
      container.appendChild(btn);
    });

    if (cats.length > 0 && !cats.find(c => c.id === activeCatId)) {
      this.selectedCatId = cats[0].id;
    }
  }

  async handleReceiptSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
      document.getElementById("receiptFileName").innerText = "Tiivistetään kuvaa...";
      const compressedDataUrl = await StorageProvider.compressImage(file, 1600, 0.8);
      this.tempReceiptData = compressedDataUrl;
      document.getElementById("receiptFileName").innerText = `Kuva liitetty (${file.name || 'kamera'})`;
      const removeBtn = document.getElementById("btnRemoveReceipt");
      if (removeBtn) removeBtn.style.display = "inline";
    } catch (e) {
      console.error("Kuvan tiivistys epäonnistui:", e);
      alert("Kuvan tiivistys epäonnistui.");
      document.getElementById("receiptFileName").innerText = "Virhe kuvan käsittelyssä";
    }
  }

  async handleFormSubmit(event) {
    event.preventDefault();

    const id = document.getElementById("formTxId").value || "tx_" + Date.now();
    const amount = parseFloat(document.getElementById("formAmount").value) || 0;
    const vendor = document.getElementById("formVendor").value.trim();
    const date = document.getElementById("formDate").value;
    const desc = document.getElementById("formDesc").value.trim();
    const accountId = document.getElementById("formAccount")?.value || null;

    let receiptId = this.currentReceiptId || null;
    if (this.tempReceiptData) {
      receiptId = receiptId || ("rec_" + Date.now());
      await this.storage.saveReceipt(receiptId, this.tempReceiptData);
    }

    const tx = {
      id,
      date,
      type: this.formType,
      category: this.selectedCatId,
      amount,
      vendor,
      desc,
      receiptId,
      accountId,
      updatedAt: new Date().toISOString()
    };

    // Jos olemassa oleva kirjaus ja sillä oli splitInfo, säilytetään se
    const existing = this.transactions.find(t => t.id === id);
    if (existing && existing.splitInfo) {
      tx.splitInfo = existing.splitInfo;
    }

    await this.storage.saveTransaction(tx);

    // Jos käsittelimme Kuitti-Inboxista tulleen kuitin, poistetaan se inboxista
    if (this.activeProcessingInboxId) {
      this.receiptInbox = this.receiptInbox.filter(r => r.id !== this.activeProcessingInboxId);
      await this.storage.saveReceiptInbox(this.receiptInbox);
      this.activeProcessingInboxId = null;
      this.updateInboxBadges();
    }

    this.closeModal("modalQuickAdd");
    await this.refreshData();
  }

  async deleteTransaction(id) {
    if (confirm("Haluatko varmasti poistaa tämän kirjauksen?")) {
      await this.storage.deleteTransaction(id);
      await this.refreshData();
    }
  }

  // --- KATEGORIAN MUOKKAUS & LISÄYS ---
  openCategoryModal(catId = null, prefillGroupId = null) {
    const groupSelect = document.getElementById("catFormGroup");
    groupSelect.innerHTML = "";
    this.categories.getGroups().forEach(g => {
      const opt = document.createElement("option");
      opt.value = g.id;
      opt.innerText = g.name;
      groupSelect.appendChild(opt);
    });

    const titleEl = document.getElementById("modalCatTitle");
    const idInput = document.getElementById("catFormId");
    const nameInput = document.getElementById("catFormName");
    const budgetInput = document.getElementById("catFormBudget");
    const quickCheck = document.getElementById("catFormQuickAction");
    const quickAmountInput = document.getElementById("catFormQuickAmount");
    const quickRow = document.getElementById("catQuickAmountRow");

    if (catId) {
      const cat = this.categories.getById(catId);
      if (titleEl) titleEl.innerText = "Muokkaa kategoriaa & tavoitetta";
      if (idInput) idInput.value = cat.id;
      if (nameInput) nameInput.value = cat.name;
      if (groupSelect) groupSelect.value = cat.groupId || "arki";
      if (budgetInput) budgetInput.value = cat.budgetMonthly > 0 ? cat.budgetMonthly : "";
      if (quickCheck) quickCheck.checked = !!cat.quickAction;
      if (quickAmountInput) quickAmountInput.value = cat.quickAmount > 0 ? cat.quickAmount : "";
      if (quickRow) quickRow.style.display = cat.quickAction ? "block" : "none";
    } else {
      if (titleEl) titleEl.innerText = "Uusi kategoria";
      if (idInput) idInput.value = "";
      if (nameInput) nameInput.value = "";
      if (groupSelect) groupSelect.value = prefillGroupId || "arki";
      if (budgetInput) budgetInput.value = "";
      if (quickCheck) quickCheck.checked = false;
      if (quickAmountInput) quickAmountInput.value = "";
      if (quickRow) quickRow.style.display = "none";
    }

    const modal = document.getElementById("modalCategory");
    if (modal) modal.classList.add("active");
  }

  async handleCategorySubmit(event) {
    event.preventDefault();
    const id = document.getElementById("catFormId")?.value;
    const name = document.getElementById("catFormName").value.trim();
    const groupId = document.getElementById("catFormGroup").value;
    const budget = parseFloat(document.getElementById("catFormBudget").value) || 0;
    const quickAction = document.getElementById("catFormQuickAction")?.checked || false;
    const quickAmount = parseFloat(document.getElementById("catFormQuickAmount")?.value) || 0;

    if (id) {
      await this.categories.updateCategory(id, {
        name,
        groupId,
        budgetMonthly: budget,
        quickAction,
        quickAmount
      });
    } else {
      await this.categories.addCategory({
        name,
        groupId,
        budgetMonthly: budget,
        quickAction,
        quickAmount
      });
    }

    this.closeModal("modalCategory");
    await this.refreshData();
    this.storage.triggerBackgroundSync();
  }

  async deleteCategory(id) {
    if (confirm("Haluatko poistaa tämän kategorian?")) {
      await this.categories.deleteCategory(id);
      await this.refreshData();
    }
  }

  // --- KANSIO-VALITSIN & ASETUKSET ---
  async pickDirectory(inputId) {
    if (window.showDirectoryPicker) {
      try {
        const handle = await window.showDirectoryPicker();
        if (handle && handle.name) {
          const input = document.getElementById(inputId);
          if (input) {
            input.value = "/" + handle.name;
            input.dispatchEvent(new Event("change"));
          }
        }
      } catch (err) {
        if (err.name !== "AbortError") {
          console.warn("showDirectoryPicker virhe:", err);
        }
      }
    } else {
      const current = document.getElementById(inputId)?.value || "";
      const path = prompt("Syötä kansion polku (selaimessasi ei ole suoraa File System Access -tukea):", current);
      if (path !== null) {
        const input = document.getElementById(inputId);
        if (input) {
          input.value = path.trim();
          input.dispatchEvent(new Event("change"));
        }
      }
    }
  }

  handleSyncTargetChange() {
    const target = document.getElementById("settingSyncTarget").value;
    this.storage.setSyncTarget(target);
    const dropSec = document.getElementById("dropboxConfigSection");
    if (dropSec) dropSec.style.display = target === "dropbox" ? "block" : "none";
    const gdriveSec = document.getElementById("gdriveConfigSection");
    if (gdriveSec) gdriveSec.style.display = target === "gdrive" ? "block" : "none";
    this.updateSyncBadge();
  }

  handleReceiptsConfigChange() {
    const target = document.getElementById("settingReceiptsTarget").value;
    this.storage.setReceiptsTarget(target);
    const folderInput = document.getElementById("settingReceiptsFolder");
    if (folderInput) {
      this.storage.setReceiptsFolder(folderInput.value);
    }
    const folderSec = document.getElementById("receiptsFolderSection");
    if (folderSec) folderSec.style.display = target !== "local" ? "block" : "none";
  }

  async resetBudgetsToZero() {
    if (confirm("Haluatko varmasti nollata kaikki kuukausitavoitteet puhtaaksi (0 €)?")) {
      const allCats = this.categories.getAll();
      for (const c of allCats) {
        c.budgetMonthly = 0;
        c.quickAction = false;
        c.quickAmount = 0;
      }
      await this.categories.save();
      await this.refreshData();
      await this.storage.syncToCloud(true);
      alert("✅ Kaikki kuukausitavoitteet on nollattu puhtaaksi (0 €)!");
    }
  }

  saveDropboxConfig() {
    const tokenEl = document.getElementById("settingDropboxToken");
    const folderEl = document.getElementById("settingDropboxFolder");
    if (tokenEl) {
      this.storage.setDropboxToken(tokenEl.value.trim());
    }
    if (folderEl) {
      this.storage.setDropboxFolder(folderEl.value.trim());
      folderEl.value = this.storage.getDropboxFolder();
    }
    this.updateSyncBadge();
    alert("Dropbox-asetukset tallennettu selaimeen!");
    this.storage.syncToCloud(true);
  }

  saveDropboxFolder() {
    const folderEl = document.getElementById("settingDropboxFolder");
    if (folderEl) {
      this.storage.setDropboxFolder(folderEl.value.trim());
      folderEl.value = this.storage.getDropboxFolder();
    }
  }

  saveGDriveConfig() {
    const tokenEl = document.getElementById("settingGDriveToken");
    const folderEl = document.getElementById("settingGDriveFolder");
    if (tokenEl) {
      this.storage.setGDriveToken(tokenEl.value.trim());
    }
    if (folderEl) {
      this.storage.setGDriveFolder(folderEl.value.trim());
      folderEl.value = this.storage.getGDriveFolder();
    }
    this.updateSyncBadge();
    alert("Google Drive -asetukset tallennettu!");
    this.storage.syncToCloud(true);
  }

  saveGDriveFolder() {
    const folderEl = document.getElementById("settingGDriveFolder");
    if (folderEl) {
      this.storage.setGDriveFolder(folderEl.value.trim());
      folderEl.value = this.storage.getGDriveFolder();
    }
  }

  async savePaydaySetting() {
    const val = parseInt(document.getElementById("settingPaydayDay").value, 10) || 20;
    this.paydayDay = val;
    await this.storage.setSetting("payday", val);
    this.renderDashboard();
  }

  async saveBalanceSetting() {
    const val = parseFloat(document.getElementById("settingFreeBalanceManual").value);
    this.freeBalanceManual = isNaN(val) ? null : val;
    await this.storage.setSetting("freeBalanceManual", this.freeBalanceManual);
    this.renderDashboard();
  }

  async manualSync(direction) {
    try {
      if (direction === "upload") {
        await this.storage.syncToCloud(false);
        alert("✅ Tallennettu pilveen onnistuneesti!");
      } else {
        await this.storage.syncFromCloud(false);
        await this.refreshData();
        alert("✅ Ladattu ja synkronoitu pilvestä!");
      }
    } catch (e) {
      alert("Synkronointivirhe: " + e.message);
    }
  }

  // --- VIENTI & TUONTI ---
  async exportJSON() {
    await this.interchange.exportJSON();
  }

  async exportCSV() {
    try {
      await this.interchange.exportCSV();
    } catch (e) {
      alert(e.message);
    }
  }

  async handleJSONFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    try {
      await this.interchange.importJSON(file);
      await this.refreshData();
      alert("✅ JSON-varmuuskopio palautettu onnistuneesti!");
    } catch (e) {
      alert("Tuontivirhe: " + e.message);
    }
  }

  async handleCSVFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    try {
      const count = await this.interchange.importCSV(file);
      await this.refreshData();
      alert(`✅ Tuotu ${count} tapahtumaa CSV-tiedostosta!`);
    } catch (e) {
      alert("CSV-tuontivirhe: " + e.message);
    }
  }
}

// Käynnistetään sovellus kun DOM on valmis
window.app = new BudjettiApp();
document.addEventListener("DOMContentLoaded", () => {
  window.app.init();
});
