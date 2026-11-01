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
    this.currentView = "viewKoti";
    this.formType = "expense";
    this.selectedCatId = "ruokakauppa";
    this.tempReceiptData = null;
    this.paydayDay = 20;
    this.freeBalanceManual = null;
  }

  async init() {
    try {
      await this.storage.init();
      await this.categories.init();

      // Ladataan asetukset
      this.paydayDay = await this.storage.getSetting("payday", 20);
      this.freeBalanceManual = await this.storage.getSetting("freeBalanceManual", null);

      const target = this.storage.getSyncTarget();
      const token = this.storage.getDropboxToken();
      const folder = this.storage.getDropboxFolder();

      const settingTargetEl = document.getElementById("settingSyncTarget");
      if (settingTargetEl) settingTargetEl.value = target;

      const tokenEl = document.getElementById("settingDropboxToken");
      if (tokenEl && token) tokenEl.value = token;

      const folderEl = document.getElementById("settingDropboxFolder");
      if (folderEl && folder) folderEl.value = folder;

      const receiptsTarget = this.storage.getReceiptsTarget();
      const receiptsFolder = this.storage.getReceiptsFolder();
      const receiptsTargetEl = document.getElementById("settingReceiptsTarget");
      if (receiptsTargetEl) receiptsTargetEl.value = receiptsTarget;
      const receiptsFolderEl = document.getElementById("settingReceiptsFolder");
      if (receiptsFolderEl) receiptsFolderEl.value = receiptsFolder;
      const receiptsFolderSec = document.getElementById("receiptsFolderSection");
      if (receiptsFolderSec) receiptsFolderSec.style.display = receiptsTarget === "dropbox" ? "block" : "none";

      const paydayEl = document.getElementById("settingPaydayDay");
      if (paydayEl) paydayEl.value = this.paydayDay;

      const balanceEl = document.getElementById("settingFreeBalanceManual");
      if (balanceEl && this.freeBalanceManual !== null) {
        balanceEl.value = this.freeBalanceManual;
      }

      this.updateSyncBadge();

      // Taustasynkka pilvestä (jos määritetty)
      if (target === "dropbox" && token) {
        this.storage.syncFromCloud(true).then(() => {
          this.refreshData();
        }).catch(() => {
          this.refreshData();
        });
      } else {
        await this.refreshData();
      }

      // Asetetaan nykyinen päivämäärä lomakkeeseen
      const dateEl = document.getElementById("formDate");
      if (dateEl) dateEl.value = new Date().toISOString().split("T")[0];

    } catch (e) {
      console.error("Sovelluksen alustusvirhe:", e);
    }
  }

  updateSyncBadge() {
    const target = this.storage.getSyncTarget();
    const token = this.storage.getDropboxToken();
    const textEl = document.getElementById("syncStatusText");
    const dotEl = document.getElementById("syncDot");

    if (target === "dropbox") {
      textEl.innerText = token ? "DROPBOX" : "DROPBOX (EI AVAINTA)";
      dotEl.style.backgroundColor = token ? "var(--c-olive)" : "var(--c-crimson)";
    } else {
      textEl.innerText = "LOKAALI";
      dotEl.style.backgroundColor = "var(--c-stone)";
    }
  }

  async refreshData() {
    this.transactions = await this.storage.getAllTransactions();
    this.renderHeader();
    this.renderDashboard();
    this.filterTransactions();
    this.renderBudgetsView();
  }

  renderHeader() {
    const now = new Date();
    const monthsFi = [
      "Tammikuu", "Helmikuu", "Maaliskuu", "Huhtikuu", "Toukokuu", "Kesäkuu",
      "Heinäkuu", "Elokuu", "Syyskuu", "Lokakuu", "Marraskuu", "Joulukuu"
    ];
    const headerEl = document.getElementById("headerCurrentPeriod");
    if (headerEl) {
      headerEl.innerText = `${monthsFi[now.getMonth()]} ${now.getFullYear()}`;
    }
  }

  renderDashboard() {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    const stats = FinanceCalculator.calculateStats(
      this.transactions,
      this.categories.getAll(),
      currentYear,
      currentMonth
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

    // Näytetään keskeisimmät kategoriat, joilla on asetettu tavoite
    const catsWithBudget = this.categories.getAll().filter(c => c.budgetMonthly > 0 && c.type !== "income");

    if (catsWithBudget.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 14px 0;">
          <p style="font-size: 11px; color: var(--c-stone); margin-bottom: 8px;">Ei asetettuja kuukausitavoitteita.</p>
          <button class="btn-primary" style="width: auto; padding: 6px 14px; font-size: 10px; background: #252527; border: 1px solid var(--c-border); color: var(--c-text-primary);" onclick="app.switchView('viewBudjetit')">
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
              ${FinanceCalculator.formatDateFi(t.date)} · ${cat.name} ${t.receiptId ? '· <span style="text-decoration: underline;">Tosite 📎</span>' : ''}
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

  filterTransactions() {
    const listContainer = document.getElementById("fullLedgerList");
    const emptyState = document.getElementById("ledgerEmptyState");
    if (!listContainer) return;

    const searchInput = document.getElementById("txSearchInput");
    const query = searchInput ? searchInput.value.toLowerCase().trim() : "";
    const monthFilter = document.getElementById("txMonthFilter");
    const monthMode = monthFilter ? monthFilter.value : "current";

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    const filtered = this.transactions.filter(t => {
      const d = new Date(t.date);
      if (monthMode === "current") {
        if (d.getFullYear() !== currentYear || d.getMonth() !== currentMonth) return false;
      }
      if (query) {
        const cat = this.categories.getById(t.category);
        const matchVendor = t.vendor && t.vendor.toLowerCase().includes(query);
        const matchDesc = t.desc && t.desc.toLowerCase().includes(query);
        const matchCat = cat.name.toLowerCase().includes(query);
        if (!matchVendor && !matchDesc && !matchCat) return false;
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

      const row = document.createElement("div");
      row.className = "ledger-item";
      row.style.cursor = "pointer";
      row.title = "Klikkaa muokataksesi kirjausta";
      row.onclick = (e) => {
        if (!e.target.closest("button")) this.editTransaction(t.id);
      };
      row.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px;">
          <div>
            <p style="font-size: 13px; font-weight: 500; color: var(--c-text-primary);">${t.vendor || cat.name}</p>
            <p style="font-size: 11px; color: var(--c-stone);">
              ${FinanceCalculator.formatDateFi(t.date)} · ${cat.name} ${t.desc ? '· ' + t.desc : ''} ${t.receiptId ? '· 📎' : ''}
            </p>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
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

  renderBudgetsView() {
    const container = document.getElementById("categoryGroupsContainer");
    if (!container) return;
    container.innerHTML = "";

    const groups = this.categories.getGroups();
    groups.forEach(g => {
      const groupCats = this.categories.getByGroup(g.id);
      const groupCard = document.createElement("div");
      groupCard.className = "luxury-card";
      groupCard.style.padding = "16px";

      let catsHtml = "";
      groupCats.forEach(c => {
        catsHtml += `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid rgba(165,160,136,0.1);">
            <div style="display: flex; align-items: center; gap: 8px; cursor: pointer;" onclick="app.openCategoryModal('${c.id}')">
              <span style="width: 8px; height: 8px; border-radius: 50%; background-color: ${c.color};"></span>
              <span style="font-size: 13px; font-weight: 500;">${c.name}</span>
              ${c.quickAction ? '<span style="font-size: 9px; padding: 1px 5px; border-radius: 4px; background: rgba(166,36,60,0.2); color: var(--c-crimson);">PIKA</span>' : ''}
            </div>
            <div style="display: flex; align-items: center; gap: 10px;" class="font-num">
              <span style="font-size: 12px; color: var(--c-stone); cursor: pointer;" onclick="app.openCategoryModal('${c.id}')">
                ${c.budgetMonthly > 0 ? c.budgetMonthly.toFixed(0) + ' €' : '<span style="color: rgba(165,160,136,0.5);">Ei tavoitetta</span>'}
              </span>
              <button onclick="app.openCategoryModal('${c.id}')" title="Muokkaa kategoriaa ja tavoitetta" style="background: none; border: none; color: var(--c-stone); cursor: pointer; padding: 3px;">
                <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                  <path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
                </svg>
              </button>
              <button onclick="app.deleteCategory('${c.id}')" title="Poista kategoria" style="background: none; border: none; color: var(--c-stone); cursor: pointer; padding: 3px; font-size: 15px;">&times;</button>
            </div>
          </div>
        `;
      });

      groupCard.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
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

  // --- VIEWS & NAVIGATION ---
  switchView(viewId) {
    const views = ["viewKoti", "viewTapahtumat", "viewBudjetit", "viewAsetukset"];
    views.forEach(v => {
      const el = document.getElementById(v);
      if (el) el.style.display = v === viewId ? "block" : "none";
    });

    const navs = ["navKoti", "navTapahtumat", "navBudjetit", "navAsetukset"];
    navs.forEach(n => {
      const el = document.getElementById(n);
      if (el) el.classList.remove("active");
    });

    const activeNav = document.getElementById("nav" + viewId.replace("view", ""));
    if (activeNav) activeNav.classList.add("active");

    this.currentView = viewId;
  }

  // --- MODALS & QUICK ADD ---
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
      receiptId: tx.receiptId
    });
  }

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove("active");
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
      updatedAt: new Date().toISOString()
    };

    await this.storage.saveTransaction(tx);
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

  // --- ASETUKSET & SYNKRONOINTI ---
  handleSyncTargetChange() {
    const target = document.getElementById("settingSyncTarget").value;
    this.storage.setSyncTarget(target);
    const dropSec = document.getElementById("dropboxConfigSection");
    if (dropSec) dropSec.style.display = target === "dropbox" ? "block" : "none";
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
    if (folderSec) folderSec.style.display = target === "dropbox" ? "block" : "none";
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

  saveDropboxToken() {
    this.saveDropboxConfig();
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
