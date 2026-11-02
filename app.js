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
    this.currentDebtTab = "p2p";
    this.p2pType = "lent";

    this.formType = "expense";
    this.selectedCatId = "ruokakauppa";
    this.tempReceiptData = null;
    this.currentReceiptId = null;
    this.tempQuickReceiptData = null;
    this.activeProcessingInboxId = null;
    this.currentSplittingTx = null;

    // Laskin, kulujen pikajako & jäännösosuuksien allokointi
    this.calcTokens = ["0"];
    this.calcSplitDesc = null;
    this.calcBaseTotal = 0;
    this.calcSplitPartsCount = 1;
    this.calcSplitPercentVal = 100;
    this.pendingSplitAllocations = [];
    this.activeOverlayReceiptId = null;

    this.paydayDay = 20;
    this.freeBalanceManual = null;

    // Teemat & Ulkoasu (Copilot / Apple Clean Light & Dark)
    this.activeTheme = "original";
    this.customThemes = [];
    this.themeMode = "light"; // "light" | "dark" | "auto"

    // Master-Detail Bottom Sheet & Task Wizard
    this.activeBottomSheetCategoryId = null;
    this.currentWizardStep = 1;

    // Järjestelmädialogit (In-App Modals)
    this.activeDialogType = null;
    this.dialogResolver = null;
  }

  static get DEFAULT_THEMES() {
    const cleanLight = {
      bg: "#F6F8FA",
      surface: "#F6F8FA",
      surfaceLow: "#F1F5F9",
      card: "#FFFFFF",
      cardSub: "#F1F5F9",
      cardElevated: "#FFFFFF",
      border: "#E2E8F0",
      borderActive: "#2563EB",
      primary: "#2563EB",
      primaryHover: "#1D4ED8",
      text: "#0F172A",
      muted: "#64748B",
      olive: "#10B981",
      income: "#10B981",
      expense: "#EF4444",
      inputBg: "#F8FAFC"
    };
    const cleanDark = {
      bg: "#0F1115",
      surface: "#0F1115",
      surfaceLow: "#13161C",
      card: "#181B22",
      cardSub: "#212631",
      cardElevated: "#252B37",
      border: "#262B36",
      borderActive: "#3B82F6",
      primary: "#3B82F6",
      primaryHover: "#60A5FA",
      text: "#F8FAFC",
      muted: "#94A3B8",
      olive: "#34D399",
      income: "#34D399",
      expense: "#F87171",
      inputBg: "#1D212A"
    };
    const sysFont = "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', 'Segoe UI', Roboto, sans-serif";
    return [
      {
        id: "original",
        name: "Original Kraft",
        tag: "Copilot / Apple Clean",
        isOriginal: true,
        font: sysFont,
        dark: { ...cleanDark },
        light: { ...cleanLight },
        colors: { ...cleanLight }
      },
      {
        id: "midnight_executive",
        name: "Midnight Executive",
        tag: "Copilot Dark",
        font: sysFont,
        dark: { ...cleanDark },
        light: { ...cleanLight },
        colors: { ...cleanDark }
      },
      {
        id: "studio_white",
        name: "Studio Minimal White",
        tag: "Copilot Light",
        font: sysFont,
        dark: { ...cleanDark },
        light: { ...cleanLight },
        colors: { ...cleanLight }
      },
      {
        id: "emerald_wealth",
        name: "Emerald Wealth",
        tag: "Copilot Clean",
        font: sysFont,
        dark: { ...cleanDark },
        light: { ...cleanLight },
        colors: { ...cleanLight }
      },
      {
        id: "monochrome_pure",
        name: "Monochrome Pure",
        tag: "Apple Wallet Clean",
        font: sysFont,
        dark: { ...cleanDark },
        light: { ...cleanLight },
        colors: { ...cleanLight }
      },
      {
        id: "warm_cashmere",
        name: "Warm Cashmere",
        tag: "Copilot Clean",
        font: sysFont,
        dark: { ...cleanDark },
        light: { ...cleanLight },
        colors: { ...cleanLight }
      }
    ];
  }

  // Universaali summan parsinta: hyväksyy sekä 12,50 että 12.50
  parseAmount(val) {
    if (typeof val === "number") return isNaN(val) ? 0 : val;
    if (!val) return 0;
    const clean = String(val).trim().replace(/\s/g, "").replace(",", ".");
    const num = parseFloat(clean);
    return isNaN(num) ? 0 : num;
  }

  // Muotoilu suomalaiseen näyttömuotoon: 12,50 €
  formatEuro(val) {
    const num = typeof val === "number" ? val : this.parseAmount(val);
    return num.toFixed(2).replace(".", ",") + " €";
  }

  async init() {
    try {
      if (typeof window !== "undefined" && window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      }

      await this.storage.init();
      await this.categories.init();
      await this.initTheme();

      // Ladataan perusasetukset
      this.paydayDay = await this.storage.getSetting("payday", 20);
      this.freeBalanceManual = await this.storage.getSetting("freeBalanceManual", null);

      const target = this.storage.getSyncTarget();
      const dropToken = this.storage.getDropboxToken();
      const dropFolder = this.storage.getDropboxFolder();
      const dropAppKey = this.storage.getDropboxAppKey();
      const dropRefreshToken = this.storage.getDropboxRefreshToken();
      const dropAppSecret = this.storage.getDropboxAppSecret();
      const gdriveToken = this.storage.getGDriveToken();
      const gdriveFolder = this.storage.getGDriveFolder();

      const settingTargetEl = document.getElementById("settingSyncTarget");
      if (settingTargetEl) settingTargetEl.value = target;

      const dropTokenEl = document.getElementById("settingDropboxToken");
      if (dropTokenEl && dropToken) dropTokenEl.value = dropToken;

      const dropAppKeyEl = document.getElementById("settingDropboxAppKey");
      if (dropAppKeyEl && dropAppKey) dropAppKeyEl.value = dropAppKey;

      const dropRefreshTokenEl = document.getElementById("settingDropboxRefreshToken");
      if (dropRefreshTokenEl && dropRefreshToken) dropRefreshTokenEl.value = dropRefreshToken;

      const dropAppSecretEl = document.getElementById("settingDropboxAppSecret");
      if (dropAppSecretEl && dropAppSecret) dropAppSecretEl.value = dropAppSecret;

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

      // Ladataan allokaationäkymän preferenssit
      const savedAlloc = await this.storage.getSetting("alloc_config", null);
      this.allocAggregation = savedAlloc?.aggregation || "groups";
      this.allocMetric = savedAlloc?.metric || "spent";
      this.allocCurrentSlide = 0;
      const aggEl = document.getElementById("allocDataAggregation");
      if (aggEl) aggEl.value = this.allocAggregation;
      const metricEl = document.getElementById("allocDataMetric");
      if (metricEl) metricEl.value = this.allocMetric;

      this.updateSyncBadge();

      // Tarkistetaan mahdollisesti palattu Dropbox OAuth PKCE -valtuutuskoodi
      if (typeof window !== "undefined" && window.location && window.location.search && window.location.search.includes("code=")) {
        this.storage.handleDropboxAuthCallback().then(async (success) => {
          if (success) {
            this.updateSyncBadge();
            await this.storage.syncFromCloud(false);
            await this.refreshData();
            await this.showDialog({
              title: "Dropbox yhdistetty",
              message: "Yhteys Dropboxiin on valmis ja tiedot synkronoituvat.",
              type: "alert",
              icon: "cloud"
            });
          }
        }).catch(async (err) => {
          console.warn("Dropbox OAuth callback -virhe:", err);
          await this.showDialog({
            title: "Dropbox-valtuutus epäonnistui",
            message: err.message || String(err),
            type: "alert",
            icon: "warning"
          });
        });
      }

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

      // Lukitaan kaikki modaalit tiukasti pystysuuntaisiksi: nollataan mahdollinen vaakavieritys
      if (typeof document !== "undefined") {
        document.querySelectorAll(".modal-content, .modal-overlay").forEach(el => {
          el.addEventListener("scroll", (e) => {
            if (e.currentTarget.scrollLeft !== 0) {
              e.currentTarget.scrollLeft = 0;
            }
          }, { passive: true });
        });
      }

    } catch (e) {
      console.error("Sovelluksen alustusvirhe:", e);
    }
  }

  updateSyncBadge() {
    const target = this.storage.getSyncTarget();
    const dropToken = this.storage.getDropboxToken();
    const dropRefreshToken = this.storage.getDropboxRefreshToken();
    const gdriveToken = this.storage.getGDriveToken();
    const textEl = document.getElementById("syncStatusText");
    const dotEl = document.getElementById("syncDot");

    if (textEl && dotEl) {
      if (target === "dropbox") {
        if (dropRefreshToken) {
          textEl.innerText = "DROPBOX";
          dotEl.style.backgroundColor = "var(--c-olive)";
        } else if (dropToken) {
          textEl.innerText = "DROPBOX (VARATOKEN)";
          dotEl.style.backgroundColor = "#D97706"; // oranssi varoitus vanhenemisesta
        } else {
          textEl.innerText = "DROPBOX (EI YHTEYTTÄ)";
          dotEl.style.backgroundColor = "var(--c-crimson)";
        }
      } else if (target === "gdrive") {
        textEl.innerText = gdriveToken ? "GOOGLE DRIVE" : "G-DRIVE (EI YHTEYTTÄ)";
        dotEl.style.backgroundColor = gdriveToken ? "var(--c-olive)" : "var(--c-crimson)";
      } else {
        textEl.innerText = "PAIKALLINEN";
        dotEl.style.backgroundColor = "var(--c-stone)";
      }
    }

    // Päivitetään myös Asetus-sivun Dropbox-tilabox
    const dbxDot = document.getElementById("dropboxStatusDot");
    const dbxText = document.getElementById("dropboxStatusText");
    const dbxBtn = document.getElementById("btnDropboxConnectPKCE");

    if (dbxDot && dbxText) {
      if (dropRefreshToken) {
        dbxDot.style.backgroundColor = "var(--c-olive)";
        dbxText.innerText = "Yhteys aktiivinen";
        dbxText.style.color = "var(--c-income)";
        if (dbxBtn) dbxBtn.innerText = "Yhdistä uudelleen";
      } else if (dropToken) {
        dbxDot.style.backgroundColor = "#D97706";
        dbxText.innerText = "Väliaikainen varatoken käytössä";
        dbxText.style.color = "#D97706";
        if (dbxBtn) dbxBtn.innerText = "Yhdistä Dropbox";
      } else {
        dbxDot.style.backgroundColor = "var(--c-stone)";
        dbxText.innerText = "Ei yhdistetty Dropboxiin";
        dbxText.style.color = "var(--c-stone)";
        if (dbxBtn) dbxBtn.innerText = "Yhdistä Dropbox";
      }
    }
  }

  sortTransactionsDesc(a, b) {
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
  }

  async refreshData() {
    this.paydayDay = await this.storage.getSetting("payday", 20);
    this.freeBalanceManual = await this.storage.getSetting("freeBalanceManual", null);
    await this.categories.init();

    this.transactions = await this.storage.getAllTransactions();
    if (Array.isArray(this.transactions)) {
      this.transactions.sort((a, b) => this.sortTransactionsDesc(a, b));
    }
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
    this.renderInbox();
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
        statusBadge.style.color = "var(--c-expense)";
        statusBadge.style.borderColor = "rgba(239, 68, 68, 0.3)";
        statusBadge.style.background = "rgba(239, 68, 68, 0.12)";
      } else if (dailyAllowance < 15) {
        statusBadge.innerText = "Tiukka";
        statusBadge.style.color = "#D97706";
        statusBadge.style.borderColor = "rgba(245, 158, 11, 0.35)";
        statusBadge.style.background = "rgba(245, 158, 11, 0.12)";
      } else {
        statusBadge.innerText = "Puskuri OK";
        statusBadge.style.color = "var(--c-income)";
        statusBadge.style.borderColor = "rgba(16, 185, 129, 0.25)";
        statusBadge.style.background = "rgba(16, 185, 129, 0.12)";
      }
    }

    // Päivitetään Hero KPI -etenemispalkki
    const periodMeterFill = document.getElementById("kpiPeriodMeterFill");
    if (periodMeterFill) {
      const totalAvail = (this.freeBalanceManual !== null && !isNaN(this.freeBalanceManual))
        ? parseFloat(this.freeBalanceManual)
        : stats.totalIncome;
      let usedPct = 0;
      if (totalAvail > 0) {
        usedPct = Math.min(100, Math.max(0, Math.round((stats.totalExpense / totalAvail) * 100)));
      } else if (stats.totalExpense > 0) {
        usedPct = 100;
      }
      periodMeterFill.style.width = `${usedPct}%`;
      periodMeterFill.style.backgroundColor = usedPct > 90 ? "var(--c-expense)" : "var(--c-primary)";
    }

    this.renderQuickChips();
    this.lastCategoryTotals = stats.categoryTotals || {};
    this.renderCategoryMeters(this.lastCategoryTotals);
    this.renderAllocationCharts(this.lastCategoryTotals);
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

  // --- ALLOKAATIONÄKYMÄT & KAAVIOT (Palkit / Piirakka / Pylväät) ---
  setAllocationView(view) {
    if (view === 0 || view === "bars") view = "bars";
    else if (view === 1 || view === "pie") view = "pie";
    else if (view === 2 || view === "bar") view = "bar";
    else view = "bars";

    this.allocCurrentView = view;
    this.allocCurrentSlide = view === "bars" ? 0 : (view === "pie" ? 1 : 2);

    const paneBars = document.getElementById("allocPaneBars");
    const panePie = document.getElementById("allocPanePie");
    const paneBar = document.getElementById("allocPaneBar");

    if (paneBars) paneBars.style.display = view === "bars" ? "block" : "none";
    if (panePie) panePie.style.display = view === "pie" ? "block" : "none";
    if (paneBar) paneBar.style.display = view === "bar" ? "block" : "none";

    const btnBars = document.getElementById("btnAllocViewBars");
    const btnPie = document.getElementById("btnAllocViewPie");
    const btnBar = document.getElementById("btnAllocViewBar");
    if (btnBars) btnBars.classList.toggle("active", view === "bars");
    if (btnPie) btnPie.classList.toggle("active", view === "pie");
    if (btnBar) btnBar.classList.toggle("active", view === "bar");

    if (view === "pie" || view === "bar") {
      this.renderAllocationCharts(this.lastCategoryTotals);
    }
  }

  setAllocationSlide(index) {
    const viewMap = ["bars", "pie", "bar"];
    this.setAllocationView(viewMap[index] || "bars");
  }

  handleAllocCarouselScroll() {
    // Korvattu puhtaalla pystysuuntaisella välilehtikytkimellä ilman sivuttaista liikettä
  }

  updateAllocSlideIndicators(index) {
    const viewMap = ["bars", "pie", "bar"];
    const activeView = typeof index === "string" ? index : (viewMap[index] || "bars");
    const btnBars = document.getElementById("btnAllocViewBars");
    const btnPie = document.getElementById("btnAllocViewPie");
    const btnBar = document.getElementById("btnAllocViewBar");
    if (btnBars) btnBars.classList.toggle("active", activeView === "bars");
    if (btnPie) btnPie.classList.toggle("active", activeView === "pie");
    if (btnBar) btnBar.classList.toggle("active", activeView === "bar");
  }

  async handleAllocDataConfigChange() {
    this.allocAggregation = document.getElementById("allocDataAggregation")?.value || "groups";
    this.allocMetric = document.getElementById("allocDataMetric")?.value || "spent";
    await this.storage.setSetting("alloc_config", {
      aggregation: this.allocAggregation,
      metric: this.allocMetric
    });
    this.renderCategoryMeters(this.lastCategoryTotals);
    this.renderAllocationCharts(this.lastCategoryTotals);
  }

  renderCategoryMeters(categoryTotals) {
    const container = document.getElementById("dashboardCategoryMeters");
    if (!container) return;
    container.innerHTML = "";
    if (!categoryTotals) categoryTotals = this.lastCategoryTotals || {};

    const isGroups = (this.allocAggregation || "groups") === "groups";

    // Lasketaan koko kauden menojen yhteissumma suhteellisen osuuden näyttämistä varten
    let totalPeriodSpent = 0;
    this.categories.getAll().forEach(c => {
      if (c.type !== "income") {
        totalPeriodSpent += (categoryTotals[c.id] || 0);
      }
    });

    if (isGroups) {
      const groups = this.categories.getGroups().filter(g => g.id !== "tulot");
      groups.forEach(g => {
        const groupCats = this.categories.getByGroup(g.id);
        let spent = 0;
        let budget = 0;
        groupCats.forEach(c => {
          if (c.type !== "income") {
            spent += (categoryTotals[c.id] || 0);
            budget += (c.budgetMonthly || 0);
          }
        });
        const hasBudget = budget > 0;
        const shareOfTotalPct = totalPeriodSpent > 0 ? Math.min(100, Math.round((spent / totalPeriodSpent) * 100)) : 0;
        const pct = hasBudget ? Math.min(100, Math.round((spent / budget) * 100)) : shareOfTotalPct;
        let barColor = g.color || "var(--c-primary)";
        if (pct > 90 && hasBudget) barColor = "var(--c-expense)";

        const leftStatusText = hasBudget
          ? `Käytetty ${pct} % tavoitteesta (${budget.toFixed(0)} €)`
          : (spent > 0 ? `Osuus kauden menoista: ${shareOfTotalPct} %` : "Ei kirjattuja menoja kaudella");
        const rightStatusText = hasBudget
          ? `${Math.max(0, budget - spent).toFixed(2).replace(".", ",")} € jäljellä`
          : (spent > 0 ? "Aseta tavoite →" : "");

        const row = document.createElement("div");
        row.className = "meter-row";
        row.style.cursor = "pointer";
        row.title = "Napauta tarkastellaksesi tai asettaaksesi budjettitavoitteita";
        row.onclick = () => this.switchView("viewBudjetit", "categories");
        row.innerHTML = `
          <div class="meter-row-header">
            <span class="meter-row-title">
              <span style="width: 10px; height: 10px; border-radius: 50%; background-color: ${g.color}; flex-shrink: 0;"></span>
              <span>${g.name}</span>
            </span>
            <span class="meter-row-amount font-num">
              ${spent.toFixed(2).replace(".", ",")} €${hasBudget ? ` <span style="color: var(--c-stone); font-size: 12px; font-weight: 500;">/ ${budget.toFixed(0)} €</span>` : ""}
            </span>
          </div>
          <div class="meter-track" style="height: 8px;">
            <div class="meter-fill" style="width: ${pct}%; background-color: ${barColor};"></div>
          </div>
          <div class="meter-row-meta font-num">
            <span>${leftStatusText}</span>
            <span style="font-weight: 600;">${rightStatusText}</span>
          </div>
        `;
        container.appendChild(row);
      });
      return;
    }

    // Categories Mode
    const catsWithBudget = this.categories.getAll().filter(c => c.budgetMonthly > 0 && c.type !== "income");

    if (catsWithBudget.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 14px 0;">
          <p style="font-size: 12px; color: var(--c-stone); margin-bottom: 8px;">Ei asetettuja kuukausitavoitteita.</p>
          <button class="btn-primary btn-secondary-surface" style="width: auto; padding: 7px 14px; font-size: 11px;" onclick="app.switchView('viewBudjetit', 'categories')">
            Aseta tavoitteita &rarr;
          </button>
        </div>
      `;
      return;
    }

    catsWithBudget.slice(0, 6).forEach(c => {
      const spent = categoryTotals[c.id] || 0;
      const budget = c.budgetMonthly;
      const pct = Math.min(100, Math.round((spent / budget) * 100));
      const remaining = Math.max(0, budget - spent);

      let barColor = c.color || "var(--c-primary)";
      if (pct > 90) barColor = "var(--c-expense)";

      const row = document.createElement("div");
      row.className = "meter-row";
      row.style.cursor = "pointer";
      row.title = "Klikkaa muokataksesi tavoitetta";
      row.onclick = () => this.openCategoryModal(c.id);
      row.innerHTML = `
        <div class="meter-row-header">
          <span class="meter-row-title">
            <span style="width: 9px; height: 9px; border-radius: 50%; background-color: ${c.color}; flex-shrink: 0;"></span>
            <span>${c.name}</span>
          </span>
          <span class="meter-row-amount font-num">${spent.toFixed(2).replace(".", ",")} € <span style="color: var(--c-stone); font-size: 12px; font-weight: 500;">/ ${budget.toFixed(0)} €</span></span>
        </div>
        <div class="meter-track" style="height: 8px;">
          <div class="meter-fill" style="width: ${pct}%; background-color: ${barColor};"></div>
        </div>
        <div class="meter-row-meta font-num">
          <span>Käytetty ${pct} % tavoitteesta</span>
          <span style="font-weight: 600;">${remaining.toFixed(2).replace(".", ",")} € jäljellä</span>
        </div>
      `;
      container.appendChild(row);
    });
  }

  renderAllocationCharts(categoryTotals) {
    if (!categoryTotals) categoryTotals = this.lastCategoryTotals || {};
    this.lastCategoryTotals = categoryTotals;

    if (typeof window === "undefined" || !window.Chart) return;

    const isGroups = (this.allocAggregation || "groups") === "groups";
    const metric = this.allocMetric || "spent";

    // Build items data
    let items = [];
    if (isGroups) {
      const groups = this.categories.getGroups();
      items = groups.map(g => {
        const groupCats = this.categories.getByGroup(g.id);
        let spent = 0;
        let budget = 0;
        groupCats.forEach(c => {
          if (c.type !== "income") {
            spent += (categoryTotals[c.id] || 0);
            budget += (c.budgetMonthly || 0);
          }
        });
        return {
          id: g.id,
          name: g.name,
          color: g.color || "#5C6A51",
          spent: Math.round(spent * 100) / 100,
          budget: Math.round(budget * 100) / 100
        };
      });
    } else {
      const allCats = this.categories.getAll().filter(c => c.type !== "income");
      items = allCats.map(c => ({
        id: c.id,
        name: c.name,
        color: c.color || "#5C6A51",
        spent: Math.round((categoryTotals[c.id] || 0) * 100) / 100,
        budget: Math.round((c.budgetMonthly || 0) * 100) / 100
      }));
    }

    // --- DONUT / PIE CHART (Slide 1) ---
    const pieCanvas = document.getElementById("chartAllocationPie");
    const pieLegend = document.getElementById("chartPieLegend");
    if (pieCanvas) {
      if (this.donutChartInstance) {
        this.donutChartInstance.destroy();
        this.donutChartInstance = null;
      }

      let pieItems = items.filter(i => (metric === "budget" ? i.budget : i.spent) > 0);
      if (pieItems.length === 0) pieItems = items.slice(0, 5);

      const labels = pieItems.map(i => i.name.split("&")[0].trim());
      const values = pieItems.map(i => metric === "budget" ? i.budget : i.spent);
      const colors = pieItems.map(i => i.color);

      const ctx = pieCanvas.getContext("2d");
      this.donutChartInstance = new Chart(ctx, {
        type: "doughnut",
        data: {
          labels: labels,
          datasets: [{
            data: values,
            backgroundColor: colors,
            borderColor: "#171718",
            borderWidth: 2,
            hoverOffset: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: "65%",
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: "#1F1F20",
              titleColor: "#BFB99E",
              bodyColor: "#FFFFFF",
              borderColor: "rgba(165,160,136,0.2)",
              borderWidth: 1,
              padding: 10,
              displayColors: true,
              callbacks: {
                label: function(context) {
                  const val = context.raw || 0;
                  return " " + context.label + ": " + val.toFixed(2).replace(".", ",") + " €";
                }
              }
            }
          }
        }
      });

      if (pieLegend) {
        pieLegend.innerHTML = "";
        pieItems.forEach(i => {
          const val = metric === "budget" ? i.budget : i.spent;
          const chip = document.createElement("div");
          chip.style.cssText = "display: flex; align-items: center; gap: 5px; font-size: 10px; color: var(--c-stone); background: rgba(255,255,255,0.04); padding: 3px 8px; border-radius: 6px;";
          chip.innerHTML = `
            <span style="width: 7px; height: 7px; border-radius: 50%; background-color: ${i.color}; flex-shrink: 0;"></span>
            <span>${i.name.split("&")[0].trim()}: <b style="color: var(--c-text-primary);">${val.toFixed(0)} €</b></span>
          `;
          pieLegend.appendChild(chip);
        });
      }
    }

    // --- BAR CHART (Slide 2) ---
    const barCanvas = document.getElementById("chartAllocationBar");
    if (barCanvas) {
      if (this.barChartInstance) {
        this.barChartInstance.destroy();
        this.barChartInstance = null;
      }

      let barItems = items.filter(i => (i.spent > 0 || i.budget > 0));
      if (barItems.length === 0) barItems = items.slice(0, 5);

      const labels = barItems.map(i => i.name.split("&")[0].trim());
      const spentData = barItems.map(i => i.spent);
      const budgetData = barItems.map(i => i.budget);

      let datasets = [];
      if (metric === "both") {
        datasets = [
          {
            label: "Toteutunut (€)",
            data: spentData,
            backgroundColor: "#A6243C",
            borderRadius: 4
          },
          {
            label: "Budjetti (€)",
            data: budgetData,
            backgroundColor: "rgba(165,160,136,0.35)",
            borderRadius: 4
          }
        ];
      } else if (metric === "budget") {
        datasets = [{
          label: "Budjetti (€)",
          data: budgetData,
          backgroundColor: barItems.map(i => i.color),
          borderRadius: 4
        }];
      } else {
        datasets = [{
          label: "Toteutunut (€)",
          data: spentData,
          backgroundColor: barItems.map(i => i.color),
          borderRadius: 4
        }];
      }

      const ctxBar = barCanvas.getContext("2d");
      this.barChartInstance = new Chart(ctxBar, {
        type: "bar",
        data: {
          labels: labels,
          datasets: datasets
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: metric === "both",
              labels: {
                color: "#A5A088",
                boxWidth: 10,
                font: { size: 10 }
              }
            },
            tooltip: {
              backgroundColor: "#1F1F20",
              titleColor: "#BFB99E",
              bodyColor: "#FFFFFF",
              borderColor: "rgba(165,160,136,0.2)",
              borderWidth: 1,
              callbacks: {
                label: function(context) {
                  return " " + context.dataset.label + ": " + (context.raw || 0).toFixed(2).replace(".", ",") + " €";
                }
              }
            }
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { color: "#A5A088", font: { size: 9 } }
            },
            y: {
              grid: { color: "rgba(255,255,255,0.06)" },
              ticks: {
                color: "#A5A088",
                font: { size: 9 },
                callback: function(v) { return v + " €"; }
              }
            }
          }
        }
      });
    }
  }

  renderRecentLedger() {
    const container = document.getElementById("dashboardRecentLedger");
    if (!container) return;
    container.innerHTML = "";

    const sorted = [...this.transactions].sort((a, b) => this.sortTransactionsDesc(a, b));
    const recent = sorted.slice(0, 4);
    if (recent.length === 0) {
      container.innerHTML = `<p style="font-size: 13px; color: var(--c-stone); padding: 14px 0;">Ei kirjattuja tapahtumia.</p>`;
      return;
    }

    recent.forEach(t => {
      const cat = this.categories.getById(t.category);
      const acc = this.accounts.find(a => a.id === t.accountId) || this.accounts[0] || { name: "Käyttötili", color: "#7DD3FC" };
      const accColor = acc.color || "#7DD3FC";
      const isIncome = t.type === "income";
      const isCredit = t.amount < 0;
      const sign = (isIncome || isCredit) ? "+" : "-";
      const color = (isIncome || isCredit) ? "var(--c-income)" : "var(--c-text-primary)";
      const displayAmt = Math.abs(t.amount);
      const catColor = cat.color || "#2563EB";
      const dParts = (t.date || "").split("-");
      const shortDate = dParts.length === 3 ? `${parseInt(dParts[2], 10)}.${parseInt(dParts[1], 10)}.` : (t.date || "");

      const item = document.createElement("div");
      item.className = "wallet-row";
      item.title = "Napauta muokataksesi kirjausta";
      item.onclick = () => this.editTransaction(t.id);
      item.innerHTML = `
        <div class="wallet-row-left">
          <div class="wallet-row-avatar" style="background-color: ${this.hexToRgba(catColor, 0.14)}; color: ${catColor};">
            <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z"/>
            </svg>
          </div>
          <div class="wallet-row-text">
            <div style="display: flex; align-items: center; gap: 6px; min-width: 0;">
              <span class="wallet-row-title">${t.vendor || cat.name}</span>
              <span class="account-pastel-pill" style="background-color: ${this.hexToRgba(accColor, 0.2)}; border-color: ${this.hexToRgba(accColor, 0.45)};">
                <span class="account-pastel-dot" style="background-color: ${accColor};"></span>
                ${acc.name}
              </span>
            </div>
            <span class="wallet-row-sub">${shortDate} · ${cat.name}${t.receiptId ? ' · Kuitti' : ''}${t.splitInfo ? ' · Jaettu' : ''}</span>
          </div>
        </div>
        <span class="wallet-row-amount font-num" style="color: ${color};">
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

    filtered.sort((a, b) => this.sortTransactionsDesc(a, b));

    listContainer.innerHTML = "";
    if (filtered.length === 0) {
      if (emptyState) emptyState.style.display = "block";
      return;
    }
    if (emptyState) emptyState.style.display = "none";

    filtered.forEach(t => {
      const cat = this.categories.getById(t.category);
      const acc = this.accounts.find(a => a.id === t.accountId) || this.accounts[0] || { name: "Käyttötili", color: "#7DD3FC" };
      const accColor = acc.color || "#7DD3FC";
      const isIncome = t.type === "income";
      const isCredit = t.amount < 0;
      const sign = (isIncome || isCredit) ? "+" : "-";
      const color = (isIncome || isCredit) ? "var(--c-income)" : "var(--c-text-primary)";
      const displayAmt = Math.abs(t.amount);
      const catColor = cat.color || "#2563EB";
      const dParts = (t.date || "").split("-");
      const shortDate = dParts.length === 3 ? `${parseInt(dParts[2], 10)}.${parseInt(dParts[1], 10)}.` : (t.date || "");

      const row = document.createElement("div");
      row.className = "wallet-row";
      row.title = "Napauta muokataksesi tai poistaaksesi kirjausta";
      row.onclick = () => this.editTransaction(t.id);

      const subtitleParts = [shortDate, t.desc || cat.name];
      if (t.receiptId) subtitleParts.push("Kuitti");
      if (t.splitInfo) subtitleParts.push(`Jaettu (${t.splitInfo.person})`);

      row.innerHTML = `
        <div class="wallet-row-left">
          <div class="wallet-row-avatar" style="background-color: ${this.hexToRgba(catColor, 0.14)}; color: ${catColor};">
            <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z"/>
            </svg>
          </div>
          <div class="wallet-row-text">
            <div style="display: flex; align-items: center; gap: 6px; min-width: 0;">
              <span class="wallet-row-title">${t.vendor || cat.name}</span>
              <span class="account-pastel-pill" style="background-color: ${this.hexToRgba(accColor, 0.2)}; border-color: ${this.hexToRgba(accColor, 0.45)};">
                <span class="account-pastel-dot" style="background-color: ${accColor};"></span>
                ${acc.name}
              </span>
            </div>
            <span class="wallet-row-sub">${subtitleParts.join(" · ")}</span>
          </div>
        </div>
        <span class="wallet-row-amount font-num" style="color: ${color};">
          ${sign}${FinanceCalculator.formatCurrency(displayAmt)}
        </span>
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
      this.showDialog({
        title: "Kuvan käsittelyvirhe",
        message: "Kuvan tiivistys epäonnistui.",
        type: "alert",
        icon: "warning"
      });
    }
  }

  async saveQuickReceiptToInbox() {
    if (!this.tempQuickReceiptData) {
      await this.showDialog({
        title: "Kuva puuttuu",
        message: "Ota tai valitse ensin kuitti ennen tallennusta.",
        type: "alert",
        icon: "warning"
      });
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
    await this.showDialog({
      title: "Kuitti tallennettu",
      message: "Kuitti on tallennettu Kuitti-Inboxiin! Voit tarkistaa ja kirjata sen milloin vain.",
      type: "alert",
      icon: "success"
    });
  }

  updateInboxBadges() {
    const count = this.receiptInbox.filter(r => !r.processed).length;
    const banner = document.getElementById("inboxAlertBanner");
    const countEl = document.getElementById("inboxAlertCount");
    const ledgerBadge = document.getElementById("ledgerInboxBadge");
    const navBadge = document.getElementById("navInboxBadge");

    if (banner && countEl) {
      banner.style.display = count > 0 ? "flex" : "none";
      countEl.innerText = count;
    }
    if (ledgerBadge) {
      ledgerBadge.style.display = count > 0 ? "inline-block" : "none";
      ledgerBadge.innerText = count;
    }
    if (navBadge) {
      navBadge.style.display = count > 0 ? "inline-block" : "none";
      navBadge.innerText = count;
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
        <div style="display: flex; align-items: center; gap: 12px; min-width: 0; cursor: pointer;" onclick="app.openReceiptOverlay('${item.receiptId || item.id}', '${(item.notes || 'Kuitti').replace(/'/g, "\\'")}')" title="Avaa kuitti suuremmaksi">
          <div class="receipt-thumb" style="background-image: url('${item.thumbnail || ''}');">
            ${!item.thumbnail ? '📎' : ''}
          </div>
          <div style="min-width: 0;">
            <p style="font-size: 13px; font-weight: 500; color: var(--c-text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              ${item.notes || 'Nimeämätön kuitti'}
            </p>
            <p style="font-size: 10px; color: var(--c-stone);" class="font-num">
              Tallennettu ${FinanceCalculator.formatDateFi(item.date)} • 🔍 Avaa
            </p>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
          <button class="btn-primary" style="width: auto; padding: 6px 10px; font-size: 9px;" onclick="app.processInboxReceipt('${item.id}')">
            Kirjaa &rarr;
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
    const item = this.receiptInbox.find(r => r.id === id || r.receiptId === id);
    if (!item) return;
    this.activeProcessingInboxId = item.id;
    this.activeProcessingReceiptId = item.receiptId || item.id;
    this.openQuickAddModal({
      fromInbox: true,
      receiptId: item.receiptId || item.id,
      date: item.date,
      desc: item.notes || ""
    });
    // Avataan kuitin esikatselu heti sovelluksen ja lomakkeen päälle tulevana kelluvana ikkunana!
    this.openReceiptOverlay(item.receiptId || item.id, item.notes || "Kuitin tiedot");
  }

  async deleteInboxReceipt(id) {
    const ok = await this.showDialog({
      title: "Poista kuitti",
      message: "Haluatko poistaa tämän kuitin Kuitti-Inboxista?",
      type: "confirm",
      icon: "trash",
      confirmText: "Poista kuitti",
      cancelText: "Peruuta"
    });
    if (ok) {
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
    const amount = this.parseAmount(document.getElementById("subFormAmount").value);
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
    const ok = await this.showDialog({
      title: "Poista kuukausitilaus",
      message: "Haluatko poistaa tämän toistuvan tilauksen seurannasta?",
      type: "confirm",
      icon: "trash",
      confirmText: "Poista tilaus",
      cancelText: "Peruuta"
    });
    if (ok) {
      this.subscriptions = this.subscriptions.filter(s => s.id !== subId);
      await this.storage.saveSubscriptions(this.subscriptions);
      this.renderSubscriptionsView();
    }
  }

  // --- KATEGORIAT & KUUKAUSIBUDJETIT (MASTER-DETAIL LIST-DETAIL PATTERN) ---
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
        let barColor = c.color || "var(--c-primary)";
        if (pct > 90) barColor = "var(--c-expense)";

        catsHtml += `
          <div class="master-detail-row" onclick="app.openCategoryDetailBottomSheet('${c.id}')">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div style="display: flex; align-items: center; gap: 10px; min-width: 0;">
                <span style="width: 10px; height: 10px; border-radius: 50%; background-color: ${c.color}; flex-shrink: 0;"></span>
                <span style="font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${c.name}</span>
                ${c.quickAction ? '<span class="tag-badge" style="font-size: 9px;">PIKA</span>' : ''}
              </div>
              <div style="display: flex; align-items: center; gap: 8px;" class="font-num">
                <span style="font-size: 14px; font-weight: 700; color: ${hasBudget ? 'var(--c-text-primary)' : 'var(--c-stone)'};">
                  ${spent.toFixed(2).replace(".", ",")} € ${hasBudget ? '<span style="color: var(--c-stone); font-size: 12px; font-weight: 500;">/ ' + budget.toFixed(0) + ' €</span>' : ''}
                </span>
                <svg class="master-detail-chevron" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </div>
            </div>
            ${hasBudget ? `
              <div class="meter-track" style="margin-top: 8px; height: 6px;">
                <div class="meter-fill" style="width: ${pct}%; background-color: ${barColor};"></div>
              </div>
            ` : ''}
          </div>
        `;
      });

      groupCard.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <div style="display: flex; align-items: center; gap: 8px; cursor: pointer;" onclick="app.openGroupModal('${g.id}')" title="Muokkaa pääryhmää">
            <span style="width: 8px; height: 8px; border-radius: 50%; background-color: ${g.color}; flex-shrink: 0;"></span>
            <span class="card-label" style="margin: 0; color: ${g.color}; font-weight: 600;">${g.name}</span>
            <button type="button" onclick="event.stopPropagation(); app.openGroupModal('${g.id}')" title="Muokkaa pääryhmää" style="background: none; border: none; color: var(--c-stone); cursor: pointer; padding: 2px;">
              <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                <path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
              </svg>
            </button>
          </div>
          <button type="button" onclick="app.openCategoryModal(null, '${g.id}')" style="background: none; border: none; font-size: 11px; color: var(--c-stone); cursor: pointer; text-transform: uppercase; letter-spacing: 0.08em;">
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

  // --- MASTER-DETAIL BOTTOM SHEET (KATEGORIOIDEN SYVÄSUKELLUS) ---
  openCategoryDetailBottomSheet(categoryId) {
    this.activeBottomSheetCategoryId = categoryId;
    const cat = this.categories.getById ? this.categories.getById(categoryId) : (this.categories.get ? this.categories.get(categoryId) : null);
    if (!cat) return;

    const group = this.categories.getGroupById ? this.categories.getGroupById(cat.groupId) : (this.categories.getGroup ? this.categories.getGroup(cat.groupId) : null);
    const colorDot = document.getElementById("bsCatColorDot");
    const nameEl = document.getElementById("bsCatName");
    const groupLabel = document.getElementById("bsCatGroupLabel");
    const spentEl = document.getElementById("bsCatSpent");
    const budgetEl = document.getElementById("bsCatBudget");
    const remainingEl = document.getElementById("bsCatRemaining");
    const meterFill = document.getElementById("bsCatMeterFill");
    const txList = document.getElementById("bsCatTxList");
    const emptyTx = document.getElementById("bsCatEmptyTx");

    if (colorDot) colorDot.style.backgroundColor = cat.color || "var(--c-olive)";
    if (nameEl) nameEl.innerText = cat.name;
    if (groupLabel) groupLabel.innerText = group ? group.name : "Kategoria";

    const now = new Date();
    const periodRange = FinanceCalculator.getCurrentPeriodRange(this.paydayDay, now);
    const stats = FinanceCalculator.calculateStats(
      this.transactions,
      this.categories.getAll(),
      undefined,
      undefined,
      periodRange
    );

    const spent = (stats.categoryTotals && stats.categoryTotals[categoryId]) || 0;
    const budget = cat.budgetMonthly || 0;
    const remaining = Math.max(0, budget - spent);
    const pct = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : (spent > 0 ? 100 : 0);

    if (spentEl) spentEl.innerText = FinanceCalculator.formatCurrency(spent);
    if (budgetEl) budgetEl.innerText = budget > 0 ? FinanceCalculator.formatCurrency(budget) : "Ei kattoa";
    if (remainingEl) {
      if (budget > 0) {
        remainingEl.innerHTML = `<b>${FinanceCalculator.formatCurrency(remaining)}</b> jäljellä (${pct} %)`;
        remainingEl.style.color = pct > 90 ? "var(--c-crimson)" : "var(--c-stone)";
      } else {
        remainingEl.innerText = "Kattoa ei määritelty";
        remainingEl.style.color = "var(--c-stone)";
      }
    }

    if (meterFill) {
      meterFill.style.width = pct + "%";
      meterFill.style.backgroundColor = pct > 90 ? "var(--c-crimson)" : (cat.color || "var(--c-olive)");
    }

    // Suodatetaan tämän kategorian kirjaukset kuluvalta kaudelta
    const startBound = periodRange ? (periodRange.startStr || periodRange.startDate) : null;
    const endBound = periodRange ? (periodRange.endStr || periodRange.endDate) : null;
    const catTxs = this.transactions.filter(t => {
      if (t.category !== categoryId && t.categoryId !== categoryId) return false;
      if (startBound && endBound && t.date) {
        return t.date >= startBound && t.date <= endBound;
      }
      return true;
    }).sort((a, b) => this.sortTransactionsDesc(a, b));

    if (txList) {
      txList.innerHTML = "";
      if (catTxs.length === 0) {
        if (emptyTx) emptyTx.style.display = "block";
      } else {
        if (emptyTx) emptyTx.style.display = "none";
        catTxs.forEach(t => {
          const row = document.createElement("div");
          row.style.display = "flex";
          row.style.justifyContent = "space-between";
          row.style.alignItems = "center";
          row.style.padding = "10px 12px";
          row.style.background = "var(--c-card)";
          row.style.border = "1px solid var(--c-border)";
          row.style.borderRadius = "10px";
          row.style.cursor = "pointer";
          row.onclick = () => {
            this.closeCategoryDetailBottomSheet();
            this.editTransaction(t.id);
          };

          const dParts = (t.date || "").split("-");
          const dateStr = dParts.length === 3 ? `${dParts[2]}.${dParts[1]}.` : (t.date || "");
          const labelStr = t.vendor || t.payee || t.title || t.desc || cat.name || "Kirjaus";

          row.innerHTML = `
            <div style="min-width: 0; display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 11px; color: var(--c-stone); font-family: ui-monospace, monospace; flex-shrink: 0;">${dateStr}</span>
              <span style="font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${labelStr}</span>
              ${t.receiptId ? '<svg width="12" height="12" fill="none" stroke="var(--c-stone)" stroke-width="1.6" viewBox="0 0 24 24" style="flex-shrink: 0;"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>' : ''}
              ${(t.splitInfo || t.splitWith) ? '<span style="font-size: 9px; padding: 1px 4px; border-radius: 4px; background: rgba(78,140,106,0.15); color: var(--c-income);">JAETTU</span>' : ''}
            </div>
            <span class="font-num" style="font-size: 13px; font-weight: 600; color: ${t.type === 'income' ? 'var(--c-income)' : 'var(--c-crimson)'}; flex-shrink: 0;">
              ${t.type === 'income' ? '+' : '-'}${Math.abs(t.amount).toFixed(2).replace('.', ',')} €
            </span>
          `;
          txList.appendChild(row);
        });
      }
    }

    const modal = document.getElementById("modalCategoryDetailBottomSheet");
    if (modal) modal.classList.add("active");
  }

  closeCategoryDetailBottomSheet() {
    const modal = document.getElementById("modalCategoryDetailBottomSheet");
    if (modal) modal.classList.remove("active");
    this.activeBottomSheetCategoryId = null;
  }

  async quickAdjustCategoryBudget(addAmount) {
    if (!this.activeBottomSheetCategoryId) return;
    const cat = this.categories.getById ? this.categories.getById(this.activeBottomSheetCategoryId) : (this.categories.get ? this.categories.get(this.activeBottomSheetCategoryId) : null);
    if (!cat) return;

    const current = cat.budgetMonthly || 0;
    const updated = Math.max(0, current + addAmount);
    if (this.categories.updateCategory) {
      await this.categories.updateCategory(cat.id, { budgetMonthly: updated });
    } else if (this.categories.update) {
      await this.categories.update(cat.id, { budgetMonthly: updated });
    }

    this.renderBudgetsView();
    this.renderDashboard();
    this.openCategoryDetailBottomSheet(cat.id);
    this.storage.triggerBackgroundSync();
  }

  openCategoryModalFromBottomSheet() {
    const catId = this.activeBottomSheetCategoryId;
    this.closeCategoryDetailBottomSheet();
    if (catId) {
      this.openCategoryModal(catId);
    }
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
    const totalAmount = this.parseAmount(document.getElementById("debtFormTotal").value);
    const remainingAmount = this.parseAmount(document.getElementById("debtFormRemaining").value);
    const monthlyPayment = this.parseAmount(document.getElementById("debtFormMonthly").value);
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
    const input = await this.showDialog({
      title: "Kirjaa lyhennys",
      message: `Kirjaa lyhennys kohteelle "${d.name}" (€):`,
      type: "prompt",
      icon: "info",
      defaultValue: defaultAmt.toString(),
      suffix: "€",
      confirmText: "Kirjaa lyhennys",
      cancelText: "Peruuta"
    });
    if (input === null || input === "") return;
    const amt = this.parseAmount(input);
    if (isNaN(amt) || amt <= 0) {
      await this.showDialog({
        title: "Virheellinen summa",
        message: "Syötä positiivinen numeroarvo lyhennykselle.",
        type: "alert",
        icon: "warning"
      });
      return;
    }
    d.remainingAmount = Math.max(0, (d.remainingAmount || 0) - amt);
    await this.storage.saveDebts(this.debts);

    const addTx = await this.showDialog({
      title: "Luo kulu Päiväkirjaan",
      message: `Lyhennys ${FinanceCalculator.formatCurrency(amt)} kirjattu saldosta! Haluatko luoda myös kulu-kirjauksen Päiväkirjaan?`,
      type: "confirm",
      icon: "info",
      confirmText: "Luo kirjaus",
      cancelText: "Pelkkä saldopäivitys"
    });

    if (addTx) {
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
    const ok = await this.showDialog({
      title: "Poista velka",
      message: "Haluatko poistaa tämän velan seurannasta?",
      type: "confirm",
      icon: "trash",
      confirmText: "Poista velka",
      cancelText: "Peruuta"
    });
    if (ok) {
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
    const amount = this.parseAmount(document.getElementById("p2pFormAmount").value);
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

    // Jos saatava merkitään maksetuksi, suljetaan saatava ja tarjotaan kassasaldoa nostava merkintä vaikuttamatta alkuperäiseen kulukategoriaan (esim. Ruokabudjettiin)
    if (!p.settled && p.type === "lent") {
      const addCashReturn = await this.showDialog({
        title: "Kuittaa saatava maksetuksi",
        message: `${p.person} maksoi takaisin ${FinanceCalculator.formatCurrency(p.amount || 0)}. Merkitäänkö saatava kuitatuksi ja lisätäänkö palautus (+${FinanceCalculator.formatCurrency(p.amount || 0)}) vapaaseen kassasaldoon vaikuttamatta alkuperäisen kategorian kulubudjettiin?`,
        type: "confirm",
        icon: "success",
        confirmText: "Kuittaa & nosta saldoa",
        cancelText: "Pelkkä kuittaus"
      });
      p.settled = true;
      await this.storage.saveP2pLoans(this.p2pLoans);
      if (addCashReturn) {
        const returnTx = {
          id: "tx_" + Date.now(),
          date: new Date().toISOString().split("T")[0],
          type: "income",
          category: "muu_tulo",
          amount: p.amount || 0,
          vendor: p.person,
          desc: `Saatavan takaisinmaksu (${p.notes || "Jaettu kulu"})`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        await this.storage.saveTransaction(returnTx);
        await this.refreshData();
        return;
      }
    } else {
      p.settled = !p.settled;
      await this.storage.saveP2pLoans(this.p2pLoans);
    }
    this.renderP2PView();
  }

  async deleteP2P(p2pId) {
    const ok = await this.showDialog({
      title: "Poista merkintä",
      message: "Haluatko poistaa tämän saatavan / velan?",
      type: "confirm",
      icon: "trash",
      confirmText: "Poista merkintä",
      cancelText: "Peruuta"
    });
    if (ok) {
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
    const personAmt = this.parseAmount(document.getElementById("splitPersonAmount")?.value);
    const myAmt = Math.max(0, total - personAmt);
    const myInput = document.getElementById("splitMyAmount");
    if (myInput) myInput.value = myAmt.toFixed(2).replace(".", ",");
  }

  setEqualSplit() {
    if (!this.currentSplittingTx) return;
    const half = (this.currentSplittingTx.amount / 2).toFixed(2).replace(".", ",");
    const personInput = document.getElementById("splitPersonAmount");
    const myInput = document.getElementById("splitMyAmount");
    if (personInput) personInput.value = half;
    if (myInput) myInput.value = half;
  }

  async confirmSplitExpense() {
    if (!this.currentSplittingTx) return;
    const person = document.getElementById("splitPersonName")?.value.trim();
    if (!person) {
      await this.showDialog({
        title: "Tieto puuttuu",
        message: "Syötä henkilön nimi kenen kanssa kulu jaetaan.",
        type: "alert",
        icon: "warning"
      });
      return;
    }
    const personAmt = this.parseAmount(document.getElementById("splitPersonAmount")?.value);
    if (personAmt <= 0) {
      await this.showDialog({
        title: "Tieto puuttuu",
        message: "Syötä toisen osapuolen jaettava summa.",
        type: "alert",
        icon: "warning"
      });
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
    await this.showDialog({
      title: "Kulu jaettu",
      message: `${person}:n osuus ${FinanceCalculator.formatCurrency(personAmt)} on lisätty saatavaksi.`,
      type: "alert",
      icon: "success"
    });
  }

  // --- TILIT & MAKSUTAVAT (Accounts - Pastellisävyt erotettuna kategorioista) ---
  getAccountPastelPalette() {
    return [
      "#7DD3FC", // Pastellin jäänsininen (Käyttötili)
      "#86EFAC", // Pastellin mintunvihreä (Käteinen)
      "#C4B5FD", // Pastellin laventeli (Luottokortti)
      "#FDBA74", // Pastellin persikka (Laskutus / Puhelinlasku)
      "#F9A8D4", // Pastellin roosa (Yhteistili / Säästötili)
      "#99F6E4", // Pastellin turkoosi (Matkatili)
      "#FDE047", // Pastellin sitruuna (Etu- / Lounaskortti)
      "#A5B4FC", // Pastellin periwinkle-indigo (Sijoitustili)
      "#CBD5E1", // Pastellin hopeanharmaa (Varatili)
      "#FCA5A5"  // Pastellin koralli (Joustoluotto)
    ];
  }

  selectAccountColor(colorHex) {
    if (!colorHex) return;
    const clean = colorHex.trim();
    const colorInput = document.getElementById("accountFormColor");
    const hexInput = document.getElementById("accountFormColorHex");
    const swatchesContainer = document.getElementById("accountColorSwatches");
    if (colorInput && /^#[0-9A-Fa-f]{6}$/.test(clean)) colorInput.value = clean;
    if (hexInput) hexInput.value = clean;
    if (swatchesContainer) {
      swatchesContainer.querySelectorAll(".color-swatch-chip").forEach(el => {
        el.classList.toggle("active", (el.dataset.color || "").toLowerCase() === clean.toLowerCase());
      });
    }
  }

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
      const accColor = acc.color || "#7DD3FC";
      const row = document.createElement("div");
      row.className = "luxury-card";
      row.style.display = "flex";
      row.style.justifyContent = "space-between";
      row.style.alignItems = "center";
      row.style.padding = "10px 14px";

      row.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
          <span class="account-pastel-pill" style="background-color: ${this.hexToRgba(accColor, 0.22)}; border-color: ${this.hexToRgba(accColor, 0.5)}; padding: 4px 10px; font-size: 12px;">
            <span class="account-pastel-dot" style="width: 8px; height: 8px; background-color: ${accColor};"></span>
            ${acc.name}
          </span>
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
    const swatchesContainer = document.getElementById("accountColorSwatches");

    const palette = this.getAccountPastelPalette();
    let activeColor = palette[0];

    if (accId) {
      const acc = this.accounts.find(a => a.id === accId);
      if (acc) {
        if (titleEl) titleEl.innerText = "Muokkaa tiliä / maksutapaa";
        if (idInput) idInput.value = acc.id;
        if (nameInput) nameInput.value = acc.name;
        if (typeSelect) typeSelect.value = acc.type || "bank";
        activeColor = acc.color || palette[0];
      }
    } else {
      if (titleEl) titleEl.innerText = "Uusi tili / maksutapa";
      if (idInput) idInput.value = "";
      if (nameInput) nameInput.value = "";
      if (typeSelect) typeSelect.value = "bank";
      activeColor = palette[this.accounts.length % palette.length] || palette[0];
    }

    if (swatchesContainer) {
      swatchesContainer.innerHTML = "";
      palette.forEach(c => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.dataset.color = c;
        chip.className = `color-swatch-chip ${c.toLowerCase() === activeColor.toLowerCase() ? "active" : ""}`;
        chip.style.backgroundColor = c;
        chip.onclick = () => this.selectAccountColor(c);
        swatchesContainer.appendChild(chip);
      });
    }
    this.selectAccountColor(activeColor);

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
      await this.showDialog({
        title: "Tiliä ei voi poistaa",
        message: "Ainakin yksi tili tai maksutapa tulee säilyttää.",
        type: "alert",
        icon: "warning"
      });
      return;
    }
    const ok = await this.showDialog({
      title: "Poista tili",
      message: "Haluatko poistaa tämän tilin / maksutavan valikoimasta?",
      type: "confirm",
      icon: "trash",
      confirmText: "Poista tili",
      cancelText: "Peruuta"
    });
    if (ok) {
      this.accounts = this.accounts.filter(a => a.id !== accId);
      await this.storage.saveAccounts(this.accounts);
      this.populateAccountDropdowns();
      this.renderAccountsList();
    }
  }

  // --- VIEWS & NAVIGATION (5 TABS: OURA / REVOLUT / APPLE WALLET BENCHMARK) ---
  switchView(viewId, subTab = null) {
    if (viewId === "viewInbox") {
      viewId = "viewTapahtumat";
      if (!subTab) subTab = "inbox";
    }

    const views = ["viewKoti", "viewTapahtumat", "viewBudjetit", "viewVelat", "viewAsetukset"];
    views.forEach(v => {
      const el = document.getElementById(v);
      if (el) el.style.display = v === viewId ? "block" : "none";
    });

    const navs = ["navKoti", "navBudjetit", "navVelat", "navInbox", "navAsetukset", "navTapahtumat"];
    navs.forEach(n => {
      const el = document.getElementById(n);
      if (el) el.classList.remove("active");
    });

    let targetNavId = "nav" + viewId.replace("view", "");
    if (viewId === "viewTapahtumat") {
      targetNavId = "navInbox";
    }
    const activeNav = document.getElementById(targetNavId);
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
      } else if (viewId === "viewTapahtumat") {
        if (!this.currentLedgerTab) this.currentLedgerTab = "tx";
        this.switchLedgerTab(this.currentLedgerTab);
      } else if (viewId === "viewVelat") {
        if (!this.currentDebtTab) this.currentDebtTab = "p2p";
        this.switchDebtTab(this.currentDebtTab);
      }
    }

    // Scrollataan näkymä ylös välilehden vaihdossa
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  toggleSettingsView() {
    if (this.currentView === "viewAsetukset") {
      this.switchView(this.previousView || "viewKoti");
    } else {
      this.previousView = this.currentView;
      this.switchView("viewAsetukset");
    }
  }

  // --- IN-APP JÄRJESTELMÄDIALOGIT (Korvaa selaimen alert/confirm/prompt) ---
  showDialog({
    title = "Ilmoitus",
    message = "",
    type = "alert", // 'alert' | 'confirm' | 'prompt'
    icon = "info",  // 'info' | 'success' | 'warning' | 'trash' | 'cloud' | 'percent'
    defaultValue = "",
    placeholder = "0",
    suffix = "",
    confirmText = "OK",
    cancelText = "Peruuta",
    quickChips = []
  } = {}) {
    return new Promise((resolve) => {
      this.dialogResolver = resolve;
      this.activeDialogType = type;

      const modal = document.getElementById("modalSystemDialog");
      const titleEl = document.getElementById("dialogTitle");
      const msgEl = document.getElementById("dialogMessage");
      const iconBox = document.getElementById("dialogIconBox");
      const inputContainer = document.getElementById("dialogInputContainer");
      const inputEl = document.getElementById("dialogPromptInput");
      const suffixEl = document.getElementById("dialogPromptSuffix");
      const chipsEl = document.getElementById("dialogQuickChips");
      const btnCancel = document.getElementById("btnDialogCancel");
      const btnConfirm = document.getElementById("btnDialogConfirm");
      const btnCloseX = document.getElementById("btnDialogCloseX");

      if (!modal) {
        if (type === "confirm") resolve(true);
        else if (type === "prompt") resolve(defaultValue);
        else resolve();
        return;
      }

      if (titleEl) titleEl.innerText = title;
      if (msgEl) msgEl.innerText = message;
      if (btnConfirm) btnConfirm.innerText = confirmText;
      if (btnCancel) {
        btnCancel.innerText = cancelText;
        btnCancel.style.display = type === "alert" ? "none" : "block";
      }
      if (btnCloseX) {
        btnCloseX.style.display = type === "alert" ? "none" : "block";
      }

      // Minimalist Monoline SVG -ikonit sovelluksen väreillä
      let iconSvg = "";
      let iconColor = "var(--c-stone)";
      let iconBg = "rgba(142,142,147,0.15)";
      let iconBorder = "rgba(142,142,147,0.3)";

      if (icon === "success") {
        iconColor = "var(--c-income)";
        iconBg = "rgba(78, 140, 106, 0.15)";
        iconBorder = "rgba(78, 140, 106, 0.35)";
        iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
      } else if (icon === "cloud") {
        iconColor = "var(--c-olive)";
        iconBg = "rgba(63, 79, 56, 0.25)";
        iconBorder = "rgba(63, 79, 56, 0.4)";
        iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"></path></svg>`;
      } else if (icon === "percent") {
        iconColor = "var(--c-crimson)";
        iconBg = "rgba(166,36,60,0.15)";
        iconBorder = "rgba(166,36,60,0.35)";
        iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="5" x2="5" y2="19"></line><circle cx="6.5" cy="6.5" r="2.5"></circle><circle cx="17.5" cy="17.5" r="2.5"></circle></svg>`;
      } else if (icon === "warning" || icon === "trash") {
        iconColor = "var(--c-crimson)";
        iconBg = "rgba(166,36,60,0.15)";
        iconBorder = "rgba(166,36,60,0.35)";
        iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
      } else {
        iconColor = "var(--c-stone)";
        iconBg = "rgba(142,142,147,0.15)";
        iconBorder = "rgba(142,142,147,0.3)";
        iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
      }

      if (iconBox) {
        iconBox.innerHTML = iconSvg;
        iconBox.style.color = iconColor;
        iconBox.style.backgroundColor = iconBg;
        iconBox.style.borderColor = iconBorder;
      }

      // Prompt-syötekenttä ja pikapainikkeet (vain numeroita / desimaaleja)
      if (type === "prompt") {
        if (inputContainer) inputContainer.style.display = "block";
        if (inputEl) {
          inputEl.value = defaultValue;
          inputEl.placeholder = placeholder;
          inputEl.onkeydown = (e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              this.closeSystemDialog(true);
            }
          };
          setTimeout(() => {
            inputEl.focus();
            inputEl.select();
          }, 60);
        }
        if (suffixEl) {
          suffixEl.innerText = suffix;
          suffixEl.style.display = suffix ? "block" : "none";
        }
        if (chipsEl) {
          if (quickChips && quickChips.length > 0) {
            chipsEl.innerHTML = quickChips.map(c => `
              <button type="button" class="btn-primary" style="flex: 1; min-width: 48px; padding: 7px 10px; font-size: 11px; background: #252527; border: 1px solid var(--c-border); color: var(--c-text-primary);" onclick="document.getElementById('dialogPromptInput').value = '${c}'">
                ${c}${suffix}
              </button>
            `).join("");
            chipsEl.style.display = "flex";
          } else {
            chipsEl.innerHTML = "";
            chipsEl.style.display = "none";
          }
        }
      } else {
        if (inputContainer) inputContainer.style.display = "none";
      }

      modal.classList.add("active");
    });
  }

  closeSystemDialog(confirmed) {
    const modal = document.getElementById("modalSystemDialog");
    if (modal) modal.classList.remove("active");

    if (this.dialogResolver) {
      if (this.activeDialogType === "prompt") {
        if (confirmed) {
          const inputEl = document.getElementById("dialogPromptInput");
          this.dialogResolver(inputEl ? inputEl.value : "");
        } else {
          this.dialogResolver(null);
        }
      } else if (this.activeDialogType === "confirm") {
        this.dialogResolver(Boolean(confirmed));
      } else {
        this.dialogResolver(true);
      }
      this.dialogResolver = null;
    }
  }

  // --- TEEMOJEN HALLINTA & KUSTOMOINTI (LIGHT / DARK / AUTO COPILOT CLEAN) ---
  async initTheme() {
    this.customThemes = await this.storage.getSetting("custom_themes", []);
    this.activeTheme = await this.storage.getSetting("active_theme", "original");
    const savedMode = await this.storage.getSetting("theme_mode", null);
    const migratedV15 = await this.storage.getSetting("theme_v15_migrated", false);
    if (!migratedV15) {
      this.themeMode = "light";
      await this.storage.setSetting("theme_mode", "light");
      await this.storage.setSetting("theme_v15_migrated", true);
    } else {
      this.themeMode = savedMode || "light";
    }

    this.updateThemeModeButtons();

    // Kuuntele järjestelmän värimallin muutoksia automaattitilassa
    if (window.matchMedia) {
      window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
        if (this.themeMode === "auto") {
          const all = [...BudjettiApp.DEFAULT_THEMES, ...this.customThemes];
          let current = all.find(t => t.id === this.activeTheme) || BudjettiApp.DEFAULT_THEMES[0];
          this.applyTheme(current, false);
        }
      });
    }

    const all = [...BudjettiApp.DEFAULT_THEMES, ...this.customThemes];
    let current = all.find(t => t.id === this.activeTheme) || BudjettiApp.DEFAULT_THEMES[0];
    this.applyTheme(current, false);
    this.renderThemePresets();
  }

  toggleLightDarkQuick() {
    const nextMode = this.isDarkModeActive() ? "light" : "dark";
    this.setThemeMode(nextMode);
  }

  isDarkModeActive() {
    if (this.themeMode === "dark") return true;
    if (this.themeMode === "light") return false;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  resolveThemePalette(theme) {
    if (!theme) return null;
    const isDark = this.isDarkModeActive();
    if (isDark) {
      return theme.dark || theme.colors || theme.light;
    } else {
      return theme.light || theme.colors || theme.dark;
    }
  }

  async setThemeMode(mode) {
    if (!["dark", "light", "auto"].includes(mode)) mode = "dark";
    this.themeMode = mode;
    await this.storage.setSetting("theme_mode", mode);
    this.updateThemeModeButtons();

    const all = [...BudjettiApp.DEFAULT_THEMES, ...this.customThemes];
    let current = all.find(t => t.id === this.activeTheme) || BudjettiApp.DEFAULT_THEMES[0];
    this.applyTheme(current, false);
    this.renderThemePresets();
    this.storage.triggerBackgroundSync();
  }

  updateThemeModeButtons() {
    const darkBtn = document.getElementById("btnThemeModeDark");
    const lightBtn = document.getElementById("btnThemeModeLight");
    const autoBtn = document.getElementById("btnThemeModeAuto");
    if (darkBtn) darkBtn.classList.toggle("active", this.themeMode === "dark");
    if (lightBtn) lightBtn.classList.toggle("active", this.themeMode === "light");
    if (autoBtn) {
      autoBtn.classList.toggle("active", this.themeMode === "auto");
      const sysDark = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
      const svgIcon = `<svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>`;
      autoBtn.innerHTML = `${svgIcon} Auto (${sysDark ? "Tumma" : "Vaalea"})`;
    }
  }

  toggleSettingsSection(sectionId) {
    const group = document.getElementById(sectionId);
    if (!group) return;
    group.classList.toggle("collapsed");
  }

  hexToRgba(hex, alpha = 0.92) {
    if (!hex || typeof hex !== "string" || !hex.startsWith("#") || hex.length !== 7) {
      return `rgba(23, 23, 24, ${alpha})`;
    }
    const r = parseInt(hex.substring(1, 3), 16);
    const g = parseInt(hex.substring(3, 5), 16);
    const b = parseInt(hex.substring(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  applyTheme(theme, save = true) {
    if (!theme) return;
    const isDark = this.isDarkModeActive();
    const c = this.resolveThemePalette(theme);
    if (!c) return;

    const root = document.documentElement;
    root.setAttribute("data-theme-mode", isDark ? "dark" : "light");

    // Modern Web Guidance (dark-mode & dark-mode-toggle): synkronoidaan <meta name="color-scheme">
    if (typeof document !== "undefined") {
      const metaColorScheme = document.querySelector('meta[name="color-scheme"]');
      if (metaColorScheme) {
        metaColorScheme.setAttribute("content", isDark ? "dark" : "light");
      }
    }

    const surface = c.surface || (isDark ? (c.cardSub || "#171718") : "#FFFFFF");
    const bg = c.bg || (isDark ? "#0F0F10" : "#F2F2F7");
    const surfaceLow = c.surfaceLow || bg;
    const cardElevated = c.cardElevated || this.adjustHexBrightness(c.card, isDark ? 8 : 0);

    root.style.setProperty("--c-bg", bg);
    root.style.setProperty("--c-surface", surface);
    root.style.setProperty("--c-surface-low", surfaceLow);
    root.style.setProperty("--c-card", c.card);
    root.style.setProperty("--c-card-sub", c.cardSub || c.card);
    root.style.setProperty("--c-card-elevated", cardElevated);
    root.style.setProperty("--c-border", c.border);
    root.style.setProperty("--c-border-active", c.borderActive || c.border);
    root.style.setProperty("--c-crimson", c.primary);
    root.style.setProperty("--c-crimson-hover", c.primaryHover || c.primary);
    root.style.setProperty("--c-text-primary", c.text);
    root.style.setProperty("--c-stone", c.muted);
    root.style.setProperty("--c-olive", c.olive || "#4E8C6A");
    root.style.setProperty("--c-income", c.income || c.olive || "#34C759");
    root.style.setProperty("--c-expense", c.expense || c.primary || "#E14B64");
    root.style.setProperty("--c-input-bg", c.inputBg || c.card);

    // Dynaamiset Apple HIG / Material 3 lasipinnat ylä- ja alapalkkiin
    const glassSurface = this.hexToRgba(surface, 0.92);
    root.style.setProperty("--c-header-bg", glassSurface);
    root.style.setProperty("--c-tab-bar-bg", glassSurface);

    if (isDark) {
      root.style.setProperty("--c-btn-secondary", "rgba(255, 255, 255, 0.08)");
      root.style.setProperty("--c-btn-secondary-hover", "rgba(255, 255, 255, 0.14)");
    } else {
      root.style.setProperty("--c-btn-secondary", "rgba(0, 0, 0, 0.05)");
      root.style.setProperty("--c-btn-secondary-hover", "rgba(0, 0, 0, 0.09)");
    }

    // Päivitetään mobiilin osoitepalkki / selaimen teemaväri
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute("content", surface);
    }

    if (theme.font) {
      root.style.setProperty("--font-main", theme.font);
    }

    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val;
    };
    setVal("themeColorBg", bg);
    setVal("themeColorBgHex", bg);
    setVal("themeColorCard", c.card);
    setVal("themeColorCardHex", c.card);
    setVal("themeColorPrimary", c.primary);
    setVal("themeColorPrimaryHex", c.primary);
    setVal("themeColorText", c.text);
    setVal("themeColorTextHex", c.text);
    setVal("themeColorMuted", c.muted);
    setVal("themeColorMutedHex", c.muted);
    setVal("themeColorOlive", c.olive || "#4E8C6A");
    setVal("themeColorOliveHex", c.olive || "#4E8C6A");

    const fontEl = document.getElementById("themeFontSelect");
    if (fontEl && theme.font) {
      fontEl.value = theme.font;
    }

    const badge = document.getElementById("activeThemeBadge");
    if (badge) {
      const modeLabel = this.themeMode === "auto" ? (isDark ? "Auto · Tumma" : "Auto · Vaalea") : (isDark ? "Tumma" : "Vaalea");
      badge.innerText = `${theme.name || "Original Kraft"} (${modeLabel})`;
    }

    this.updateThemeModeButtons();

    this.activeTheme = theme.id || "original";
    if (save) {
      this.storage.setSetting("active_theme", theme.id || "original");
      this.storage.triggerBackgroundSync();
    }
    this.renderThemePresets();
  }

  renderThemePresets() {
    const grid = document.getElementById("themePresetsGrid");
    if (!grid) return;

    const all = [...BudjettiApp.DEFAULT_THEMES, ...this.customThemes];
    grid.innerHTML = all.map(t => {
      const isActive = t.id === this.activeTheme;
      const c = this.resolveThemePalette(t);
      if (!c) return "";
      return `
        <div class="theme-preset-card ${isActive ? 'active' : ''}" onclick="app.selectThemePreset('${t.id}')">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px;">
            <div>
              <div style="font-size: 12px; font-weight: 600; color: var(--c-text-primary);">${t.name}</div>
              <div style="font-size: 10px; color: var(--c-stone);">${t.tag || ''}</div>
            </div>
            ${t.isOriginal ? '<span style="font-size: 8px; padding: 2px 5px; border-radius: 4px; background: rgba(166,36,60,0.2); color: var(--c-crimson); font-weight: 600;">ORIGINAL</span>' : (t.isCustom ? `<button type="button" onclick="app.deleteCustomTheme('${t.id}', event)" title="Poista tämä teema" style="background: none; border: none; color: var(--c-stone); cursor: pointer; padding: 2px 4px; font-size: 12px; line-height: 1;">✕</button>` : '')}
          </div>
          <div class="theme-palette-preview">
            <div class="theme-palette-slice" style="background: ${c.bg}; border: 1px solid var(--c-border);" title="Tausta"></div>
            <div class="theme-palette-slice" style="background: ${c.card}; border: 1px solid var(--c-border);" title="Kortti"></div>
            <div class="theme-palette-slice" style="background: ${c.primary};" title="Pääväri"></div>
            <div class="theme-palette-slice" style="background: ${c.olive || c.text};" title="Aksentti"></div>
          </div>
        </div>
      `;
    }).join("");
  }

  selectThemePreset(themeId) {
    const all = [...BudjettiApp.DEFAULT_THEMES, ...this.customThemes];
    const target = all.find(t => t.id === themeId);
    if (target) {
      this.applyTheme(target, true);
    }
  }

  handleLiveColorChange() {
    const bg = document.getElementById("themeColorBg")?.value || "#0F0F10";
    const card = document.getElementById("themeColorCard")?.value || "#171718";
    const primary = document.getElementById("themeColorPrimary")?.value || "#A6243C";
    const text = document.getElementById("themeColorText")?.value || "#EDEDED";
    const muted = document.getElementById("themeColorMuted")?.value || "#8E8E93";
    const olive = document.getElementById("themeColorOlive")?.value || "#3F4F38";

    const setHex = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val;
    };
    setHex("themeColorBgHex", bg);
    setHex("themeColorCardHex", card);
    setHex("themeColorPrimaryHex", primary);
    setHex("themeColorTextHex", text);
    setHex("themeColorMutedHex", muted);
    setHex("themeColorOliveHex", olive);

    const root = document.documentElement;
    // Molemmat taustat päivittyvät heti livenä
    root.style.setProperty("--c-bg", bg);
    root.style.setProperty("--c-surface", bg);
    root.style.setProperty("--c-card", card);
    root.style.setProperty("--c-card-sub", this.adjustHexBrightness(card, 5));
    root.style.setProperty("--c-border", this.adjustHexBrightness(card, 15));
    root.style.setProperty("--c-border-active", this.adjustHexBrightness(card, 25));
    root.style.setProperty("--c-crimson", primary);
    root.style.setProperty("--c-crimson-hover", primary);
    root.style.setProperty("--c-text-primary", text);
    root.style.setProperty("--c-stone", muted);
    root.style.setProperty("--c-olive", olive);
    root.style.setProperty("--c-income", olive);
    root.style.setProperty("--c-input-bg", card);

    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) metaTheme.setAttribute("content", bg);

    const badge = document.getElementById("activeThemeBadge");
    if (badge) badge.innerText = "Mukautettu";
  }

  handleHexColorChange(pickerId, hexVal) {
    if (!hexVal) return;
    const clean = hexVal.trim();
    if (/^#[0-9A-Fa-f]{6}$/.test(clean)) {
      const picker = document.getElementById(pickerId);
      if (picker) {
        picker.value = clean;
        this.handleLiveColorChange();
      }
    }
  }

  handleThemeFontChange() {
    const fontEl = document.getElementById("themeFontSelect");
    if (fontEl && fontEl.value) {
      document.documentElement.style.setProperty("--font-main", fontEl.value);
    }
  }

  adjustHexBrightness(hex, percent) {
    if (!hex || !hex.startsWith("#") || hex.length !== 7) return hex;
    let r = parseInt(hex.substring(1, 3), 16);
    let g = parseInt(hex.substring(3, 5), 16);
    let b = parseInt(hex.substring(5, 7), 16);
    r = Math.min(255, Math.max(0, Math.round(r + (r * percent / 100))));
    g = Math.min(255, Math.max(0, Math.round(g + (g * percent / 100))));
    b = Math.min(255, Math.max(0, Math.round(b + (b * percent / 100))));
    const toHex = (n) => n.toString(16).padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  async saveCurrentThemeAsNew() {
    const name = await this.showDialog({
      title: "Tallenna uusi teema",
      message: "Anna nimi omalle väri- ja fonttiteemallesi:",
      type: "prompt",
      icon: "info",
      defaultValue: "Oma Teema " + (this.customThemes.length + 1),
      confirmText: "Tallenna teema",
      cancelText: "Peruuta"
    });
    if (!name || !name.trim()) return;

    const bg = document.getElementById("themeColorBg")?.value || "#0F0F10";
    const card = document.getElementById("themeColorCard")?.value || "#171718";
    const primary = document.getElementById("themeColorPrimary")?.value || "#A6243C";
    const text = document.getElementById("themeColorText")?.value || "#EDEDED";
    const muted = document.getElementById("themeColorMuted")?.value || "#8E8E93";
    const olive = document.getElementById("themeColorOlive")?.value || "#3F4F38";
    const font = document.getElementById("themeFontSelect")?.value || "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
    const isDark = this.isDarkModeActive();

    const newTheme = {
      id: "custom_" + Date.now(),
      name: name.trim(),
      tag: "Oma Teema",
      isCustom: true,
      font: font,
      dark: {
        bg: isDark ? bg : "#0F0F10",
        surface: isDark ? bg : "#171718",
        card: isDark ? card : "#1C1C1E",
        cardSub: this.adjustHexBrightness(isDark ? card : "#1C1C1E", 5),
        border: this.adjustHexBrightness(isDark ? card : "#1C1C1E", 15),
        borderActive: this.adjustHexBrightness(isDark ? card : "#1C1C1E", 25),
        primary,
        primaryHover: primary,
        text: isDark ? text : "#EDEDED",
        muted: isDark ? muted : "#8E8E93",
        olive,
        income: olive,
        inputBg: isDark ? card : "#1C1C1E"
      },
      light: {
        bg: !isDark ? bg : "#F4F4F6",
        surface: !isDark ? bg : "#FFFFFF",
        card: !isDark ? card : "#FFFFFF",
        cardSub: this.adjustHexBrightness(!isDark ? card : "#FFFFFF", -5),
        border: this.adjustHexBrightness(!isDark ? card : "#FFFFFF", -15),
        borderActive: this.adjustHexBrightness(!isDark ? card : "#FFFFFF", -25),
        primary,
        primaryHover: primary,
        text: !isDark ? text : "#111827",
        muted: !isDark ? muted : "#52525B",
        olive,
        income: olive,
        inputBg: !isDark ? card : "#F4F4F6"
      },
      colors: {
        bg,
        surface: bg,
        card,
        cardSub: this.adjustHexBrightness(card, 5),
        border: this.adjustHexBrightness(card, 15),
        borderActive: this.adjustHexBrightness(card, 25),
        primary,
        primaryHover: primary,
        text,
        muted,
        olive,
        income: olive,
        inputBg: card
      }
    };

    this.customThemes.push(newTheme);
    await this.storage.setSetting("custom_themes", this.customThemes);
    await this.applyTheme(newTheme, true);
    await this.showDialog({
      title: "Teema tallennettu",
      message: `Teema "${newTheme.name}" on tallennettu ja otettu käyttöön! Se tallentuu automaattisesti JSON-varmuuskopioihin ja pilveen.`,
      type: "alert",
      icon: "success"
    });
  }

  async resetToOriginalTheme() {
    const orig = BudjettiApp.DEFAULT_THEMES.find(t => t.id === "original");
    if (!orig) return;
    await this.applyTheme(orig, true);
    await this.showDialog({
      title: "Original Kraft palautettu",
      message: "Alkuperäinen sveitsiläinen Original Kraft -teema on palautettu käyttöön.",
      type: "alert",
      icon: "info"
    });
  }

  async deleteCustomTheme(themeId, event) {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    const theme = this.customThemes.find(t => t.id === themeId);
    if (!theme) return;
    const ok = await this.showDialog({
      title: "Poista oma teema",
      message: `Haluatko poistaa tallentamasi teeman "${theme.name}"?`,
      type: "confirm",
      icon: "trash",
      confirmText: "Poista teema",
      cancelText: "Peruuta"
    });
    if (!ok) return;

    this.customThemes = this.customThemes.filter(t => t.id !== themeId);
    await this.storage.setSetting("custom_themes", this.customThemes);
    if (this.activeTheme === themeId) {
      const orig = BudjettiApp.DEFAULT_THEMES.find(t => t.id === "original");
      await this.applyTheme(orig, true);
    } else {
      this.renderThemePresets();
    }
  }

  // --- MODALS & QUICK ADD ---
  openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add("active");
      const content = modal.querySelector(".modal-content");
      if (content) {
        content.scrollLeft = 0;
        content.scrollTop = 0;
      }
    }
  }

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove("active");
      const content = modal.querySelector(".modal-content");
      if (content) {
        content.scrollLeft = 0;
      }
    }
  }

  // --- FLOATING RECEIPT OVERLAY (Picture-in-Picture) ---
  async openReceiptOverlay(receiptIdOrData, metaText = "") {
    const viewer = document.getElementById("receiptOverlayViewer");
    const imgEl = document.getElementById("receiptOverlayImg");
    const metaEl = document.getElementById("receiptOverlayMeta");
    const actionBtn = document.getElementById("btnReceiptOverlayAction");
    if (!viewer || !imgEl) return;

    this.activeOverlayReceiptId = null;
    let dataUrl = null;

    if (typeof receiptIdOrData === "string" && receiptIdOrData.startsWith("data:")) {
      dataUrl = receiptIdOrData;
    } else if (typeof receiptIdOrData === "string" && receiptIdOrData.trim()) {
      this.activeOverlayReceiptId = receiptIdOrData;
      dataUrl = await this.storage.getReceipt(receiptIdOrData);
    }

    if (!dataUrl) {
      await this.showDialog({
        title: "Kuittia ei löydy",
        message: "Kuittitiedostoa ei löytynyt tallennustilasta.",
        type: "alert",
        icon: "warning"
      });
      return;
    }

    imgEl.src = dataUrl;
    if (metaEl) metaEl.innerText = metaText || "Kuittitosite";

    const quickAddModal = document.getElementById("modalQuickAdd");
    const isAdding = quickAddModal && quickAddModal.classList.contains("active");
    if (actionBtn) {
      actionBtn.style.display = isAdding ? "none" : "block";
    }

    this.initReceiptOverlayGestures();
    this.resetReceiptZoom();
    viewer.style.display = "flex";
    if (typeof document !== "undefined") {
      document.body.classList.add("receipt-split-active");
    }
  }

  closeReceiptOverlay() {
    const viewer = document.getElementById("receiptOverlayViewer");
    if (viewer) viewer.style.display = "none";
    if (typeof document !== "undefined") {
      document.body.classList.remove("receipt-split-active");
    }
    this.resetReceiptZoom();
  }

  toggleReceiptOverlayZoom() {
    const viewer = document.getElementById("receiptOverlayViewer");
    if (viewer) viewer.classList.toggle("zoomed");
  }

  initReceiptOverlayGestures() {
    if (this.receiptGesturesInitialized) return;
    const body = document.getElementById("receiptOverlayBody");
    const imgEl = document.getElementById("receiptOverlayImg");
    if (!body || !imgEl) return;

    this.receiptZoom = 1.0;
    this.receiptPanX = 0;
    this.receiptPanY = 0;

    let startDist = 0;
    let startZoom = 1.0;
    let startTouchX = 0, startTouchY = 0;
    let startPanX = 0, startPanY = 0;
    let isPinching = false;
    let isPanning = false;

    body.addEventListener("touchstart", (e) => {
      if (e.touches.length === 2) {
        isPinching = true;
        isPanning = false;
        startDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        startZoom = this.receiptZoom || 1.0;
      } else if (e.touches.length === 1 && (this.receiptZoom || 1.0) > 1.05) {
        isPanning = true;
        isPinching = false;
        startTouchX = e.touches[0].clientX;
        startTouchY = e.touches[0].clientY;
        startPanX = this.receiptPanX || 0;
        startPanY = this.receiptPanY || 0;
      }
    }, { passive: false });

    body.addEventListener("touchmove", (e) => {
      if (isPinching && e.touches.length === 2) {
        e.preventDefault();
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const scale = startZoom * (dist / (startDist || 1));
        this.receiptZoom = Math.min(5.0, Math.max(1.0, Math.round(scale * 100) / 100));
        this.updateReceiptTransform();
      } else if (isPanning && e.touches.length === 1 && (this.receiptZoom || 1.0) > 1.05) {
        e.preventDefault();
        const dx = e.touches[0].clientX - startTouchX;
        const dy = e.touches[0].clientY - startTouchY;
        this.receiptPanX = startPanX + dx;
        this.receiptPanY = startPanY + dy;
        this.updateReceiptTransform();
      }
    }, { passive: false });

    body.addEventListener("touchend", (e) => {
      if (e.touches.length < 2) isPinching = false;
      if (e.touches.length === 0) {
        isPanning = false;
        if ((this.receiptZoom || 1.0) <= 1.05) {
          this.resetReceiptZoom();
        }
      }
    });

    body.addEventListener("wheel", (e) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.25 : -0.25;
      this.zoomReceipt(delta);
    }, { passive: false });

    this.receiptGesturesInitialized = true;
  }

  updateReceiptTransform() {
    const imgEl = document.getElementById("receiptOverlayImg");
    if (!imgEl) return;
    imgEl.style.transform = `translate(${this.receiptPanX || 0}px, ${this.receiptPanY || 0}px) scale(${this.receiptZoom || 1.0})`;
  }

  zoomReceipt(delta) {
    this.receiptZoom = Math.min(5.0, Math.max(1.0, Math.round(((this.receiptZoom || 1.0) + delta) * 100) / 100));
    if (this.receiptZoom <= 1.05) {
      this.receiptPanX = 0;
      this.receiptPanY = 0;
    }
    this.updateReceiptTransform();
  }

  resetReceiptZoom() {
    this.receiptZoom = 1.0;
    this.receiptPanX = 0;
    this.receiptPanY = 0;
    this.updateReceiptTransform();
  }

  recordFromReceiptOverlay() {
    if (this.activeOverlayReceiptId) {
      this.processInboxReceipt(this.activeOverlayReceiptId);
    }
  }

  // --- IN-APP CALCULATOR, NUMBER STEPPER & MULTI-ALLOCATION SPLITTER ---
  openCalculatorModal(initialVal = null) {
    let baseVal = 0;
    if (initialVal !== null) {
      baseVal = this.parseAmount(initialVal);
    } else if (this.calcBaseTotal > 0 && this.pendingSplitAllocations && this.pendingSplitAllocations.length > 0) {
      baseVal = this.calcBaseTotal;
    } else {
      const formVal = document.getElementById("formAmount")?.value;
      baseVal = this.parseAmount(formVal);
    }

    this.calcTokens = baseVal > 0 ? [baseVal.toString()] : ["0"];
    this.calcBaseTotal = baseVal;
    this.calcSplitPartsCount = 1;
    this.calcSplitPercentVal = 100;
    this.calcSplitDesc = null;

    const partsEl = document.getElementById("calcSplitPartsValue");
    if (partsEl) partsEl.innerText = "1";
    const pctInput = document.getElementById("calcCustomPercentInput");
    if (pctInput) pctInput.value = "100";
    const btnContinue = document.getElementById("btnCalcContinueToSplit");
    if (btnContinue) btnContinue.style.display = "none";

    this.updateCalcDisplay();
    this.openModal("modalCalculator");
  }

  calcResetSplit() {
    if (this.calcBaseTotal > 0) {
      this.calcTokens = [this.calcBaseTotal.toString()];
    }
    this.calcSplitPartsCount = 1;
    this.calcSplitPercentVal = 100;
    this.calcSplitDesc = null;
    const partsEl = document.getElementById("calcSplitPartsValue");
    if (partsEl) partsEl.innerText = "1";
    const pctInput = document.getElementById("calcCustomPercentInput");
    if (pctInput) pctInput.value = "100";
    const btnContinue = document.getElementById("btnCalcContinueToSplit");
    if (btnContinue) btnContinue.style.display = "none";
    this.updateCalcDisplay();
  }

  adjustCalcSplitParts(delta) {
    // Jos perussummaa ei ole vielä lukittu tai käyttäjä on juuri näppäillyt uuden luvun, lukitaan se pohjasummaksi
    if (this.calcSplitPartsCount === 1 && this.calcSplitPercentVal === 100) {
      const currentEval = this.calcEvaluate();
      if (currentEval > 0) {
        this.calcBaseTotal = currentEval;
      }
    }
    const nextParts = Math.min(20, Math.max(1, (this.calcSplitPartsCount || 1) + delta));
    this.calcSplitParts(nextParts);
  }

  handleCalcPercentInput(rawVal) {
    if (this.calcSplitPartsCount === 1 && this.calcSplitPercentVal === 100) {
      const currentEval = this.calcEvaluate();
      if (currentEval > 0) {
        this.calcBaseTotal = currentEval;
      }
    }
    const p = this.parseAmount(rawVal);
    if (p > 0 && p <= 100) {
      this.calcSplitPartsCount = p < 100 ? 2 : 1;
      const partsEl = document.getElementById("calcSplitPartsValue");
      if (partsEl) partsEl.innerText = String(this.calcSplitPartsCount);
      this.calcSplitPercent(p, false);
    }
  }

  calcInputNum(digit) {
    const last = this.calcTokens[this.calcTokens.length - 1];
    if (["+", "-", "*", "/"].includes(last)) {
      this.calcTokens.push(digit);
    } else {
      if (last === "0" && digit !== "00") {
        this.calcTokens[this.calcTokens.length - 1] = digit;
      } else {
        this.calcTokens[this.calcTokens.length - 1] = (last || "") + digit;
      }
    }
    this.calcBaseTotal = 0;
    this.calcSplitPartsCount = 1;
    this.calcSplitPercentVal = 100;
    this.calcSplitDesc = null;
    const partsEl = document.getElementById("calcSplitPartsValue");
    if (partsEl) partsEl.innerText = "1";
    const pctInput = document.getElementById("calcCustomPercentInput");
    if (pctInput) pctInput.value = "100";
    this.updateCalcDisplay();
  }

  calcInputComma() {
    const last = this.calcTokens[this.calcTokens.length - 1];
    if (["+", "-", "*", "/"].includes(last)) {
      this.calcTokens.push("0.");
    } else if (!last.includes(".")) {
      this.calcTokens[this.calcTokens.length - 1] = (last || "0") + ".";
    }
    this.calcSplitDesc = null;
    this.updateCalcDisplay();
  }

  calcInputOp(op) {
    this.calcEvaluate();
    const last = this.calcTokens[this.calcTokens.length - 1];
    if (["+", "-", "*", "/"].includes(last)) {
      this.calcTokens[this.calcTokens.length - 1] = op;
    } else {
      this.calcTokens.push(op);
    }
    this.calcSplitDesc = null;
    this.updateCalcDisplay();
  }

  calcBackspace() {
    const last = this.calcTokens[this.calcTokens.length - 1];
    if (!last) return;
    if (["+", "-", "*", "/"].includes(last)) {
      this.calcTokens.pop();
    } else if (last.length > 1) {
      this.calcTokens[this.calcTokens.length - 1] = last.slice(0, -1);
    } else {
      this.calcTokens.pop();
      if (this.calcTokens.length === 0) this.calcTokens = ["0"];
    }
    this.calcSplitDesc = null;
    this.updateCalcDisplay();
  }

  calcClear() {
    this.calcTokens = ["0"];
    this.calcBaseTotal = 0;
    this.calcSplitPartsCount = 1;
    this.calcSplitPercentVal = 100;
    this.calcSplitDesc = null;
    const partsEl = document.getElementById("calcSplitPartsValue");
    if (partsEl) partsEl.innerText = "1";
    const pctInput = document.getElementById("calcCustomPercentInput");
    if (pctInput) pctInput.value = "100";
    const btnContinue = document.getElementById("btnCalcContinueToSplit");
    if (btnContinue) btnContinue.style.display = "none";
    this.updateCalcDisplay();
  }

  calcEvaluate() {
    try {
      if (this.calcTokens.length === 0) return 0;
      const last = this.calcTokens[this.calcTokens.length - 1];
      let tokensToEval = [...this.calcTokens];
      if (["+", "-", "*", "/"].includes(last)) {
        tokensToEval.pop();
      }
      if (tokensToEval.length === 0) return 0;

      let res = parseFloat(tokensToEval[0]) || 0;
      for (let i = 1; i < tokensToEval.length; i += 2) {
        const op = tokensToEval[i];
        const nextVal = parseFloat(tokensToEval[i + 1]) || 0;
        if (op === "+") res += nextVal;
        else if (op === "-") res -= nextVal;
        else if (op === "*") res *= nextVal;
        else if (op === "/") res = nextVal !== 0 ? res / nextVal : res;
      }
      res = Math.round(res * 100) / 100;
      this.calcTokens = [res.toString()];
      this.updateCalcDisplay();
      return res;
    } catch (e) {
      console.warn("Laskinvirhe:", e);
      return 0;
    }
  }

  calcSplitParts(parts) {
    const total = this.calcBaseTotal > 0 ? this.calcBaseTotal : this.calcEvaluate();
    if (total <= 0) return;
    this.calcBaseTotal = total;
    this.calcSplitPartsCount = Math.max(1, parts);
    const pct = Math.round((100 / this.calcSplitPartsCount) * 10) / 10;
    this.calcSplitPercentVal = pct;

    const partsEl = document.getElementById("calcSplitPartsValue");
    if (partsEl) partsEl.innerText = String(this.calcSplitPartsCount);
    const pctInput = document.getElementById("calcCustomPercentInput");
    if (pctInput) pctInput.value = String(pct).replace(".", ",");

    if (this.calcSplitPartsCount === 1) {
      this.calcTokens = [total.toString()];
      this.calcSplitDesc = null;
    } else {
      const share = Math.round((total / this.calcSplitPartsCount) * 100) / 100;
      const remainder = Math.max(0, Math.round((total - share) * 100) / 100);
      this.calcTokens = [share.toString()];
      this.calcSplitDesc = `Koko kuitti: ${this.formatEuro(total)} · Jaettu ${this.calcSplitPartsCount}:lle · Oma osuus: ${this.formatEuro(share)} · Jäännös: ${this.formatEuro(remainder)}`;
    }
    this.updateCalcDisplay();
  }

  calcSplitPercent(percent, updateInput = true) {
    const total = this.calcBaseTotal > 0 ? this.calcBaseTotal : this.calcEvaluate();
    if (total <= 0) return;
    this.calcBaseTotal = total;
    this.calcSplitPercentVal = percent;

    if (updateInput) {
      const pctInput = document.getElementById("calcCustomPercentInput");
      if (pctInput) pctInput.value = String(percent).replace(".", ",");
    }

    if (percent >= 100) {
      this.calcTokens = [total.toString()];
      this.calcSplitDesc = null;
    } else {
      const share = Math.round((total * (percent / 100)) * 100) / 100;
      const remainder = Math.max(0, Math.round((total - share) * 100) / 100);
      this.calcTokens = [share.toString()];
      this.calcSplitDesc = `Koko kuitti: ${this.formatEuro(total)} · Oma osuus ${String(percent).replace(".", ",")} %: ${this.formatEuro(share)} · Jäännös: ${this.formatEuro(remainder)}`;
    }
    this.updateCalcDisplay();
  }

  async calcSplitCustom() {
    const pStr = await this.showDialog({
      title: "Oma prosenttiosuus",
      message: "Syötä oma prosenttiosuutesi kokonaissummasta (0–100 %):",
      type: "prompt",
      icon: "percent",
      defaultValue: String(this.calcSplitPercentVal || 50),
      suffix: "%",
      confirmText: "Käytä prosenttia",
      cancelText: "Peruuta",
      quickChips: [25, 33, 50, 65, 75]
    });
    if (!pStr) return;
    const p = parseFloat(String(pStr).replace(",", "."));
    if (p > 0 && p <= 100) {
      this.calcSplitPercent(p, true);
    }
  }

  updateCalcDisplay() {
    const exprEl = document.getElementById("calcExpr");
    const resultEl = document.getElementById("calcResult");
    const splitEl = document.getElementById("calcSplitInfo");
    const btnContinue = document.getElementById("btnCalcContinueToSplit");

    let displayExpr = this.calcTokens.map(t => {
      if (t === "*") return "×";
      if (t === "/") return "÷";
      if (t === "-") return "−";
      return t.replace(".", ",");
    }).join(" ");

    if (exprEl) exprEl.innerText = displayExpr;

    const currentVal = parseFloat(this.calcTokens[this.calcTokens.length - 1]) || 0;
    if (resultEl) resultEl.innerText = currentVal.toFixed(2).replace(".", ",") + " €";

    const hasSplitRemainder = this.calcBaseTotal > 0 && currentVal > 0 && currentVal < this.calcBaseTotal;

    if (splitEl) {
      if (this.calcSplitDesc) {
        splitEl.style.display = "block";
        splitEl.innerText = this.calcSplitDesc;
      } else {
        splitEl.style.display = "none";
      }
    }

    if (btnContinue) {
      btnContinue.style.display = hasSplitRemainder ? "block" : "none";
    }
  }

  applyCalculatorAmount(jumpToSplitStep = false) {
    const finalAmt = this.calcEvaluate();
    const amountField = document.getElementById("formAmount");
    if (amountField) {
      amountField.value = finalAmt.toFixed(2).replace(".", ",");
    }

    // Jos kulu on jaettu (kokonaissumma > oma osuus), luodaan jäännösosuusrivit automaattisesti
    if (this.calcBaseTotal > 0 && finalAmt > 0 && finalAmt < this.calcBaseTotal) {
      const remainderTotal = Math.max(0, Math.round((this.calcBaseTotal - finalAmt) * 100) / 100);
      const extraParts = Math.max(1, (this.calcSplitPartsCount || 2) - 1);
      const eachPart = Math.round((remainderTotal / extraParts) * 100) / 100;

      this.pendingSplitAllocations = [];
      for (let i = 0; i < extraParts; i++) {
        const amt = (i === extraParts - 1)
          ? Math.max(0, Math.round((remainderTotal - eachPart * (extraParts - 1)) * 100) / 100)
          : eachPart;
        this.pendingSplitAllocations.push({
          id: "alloc_" + Date.now() + "_" + i,
          targetType: "p2p", // 'p2p' (Saatava henkilöltä) tai 'category' (Toinen kategoria)
          person: "",
          categoryId: this.selectedCatId || "ruokakauppa",
          amount: amt
        });
      }
      this.renderSplitAllocationRows();
      this.updateFormSplitSummaryBanner();
    } else if (this.calcSplitPartsCount === 1 && this.calcSplitPercentVal === 100) {
      this.pendingSplitAllocations = [];
      this.renderSplitAllocationRows();
      this.updateFormSplitSummaryBanner();
    }

    if (this.calcSplitDesc) {
      const descField = document.getElementById("formDesc");
      if (descField && !descField.value) {
        descField.value = this.calcSplitDesc;
      }
    }

    this.closeModal("modalCalculator");
    if (jumpToSplitStep) {
      this.setWizardStep(3);
    }
  }

  // --- MONIKOHTEINEN JÄÄNNÖSOSUUKSIEN ALLOKAATTORI (Saatavat & Eri kategoriat) ---
  updateFormSplitSummaryBanner() {
    const banner = document.getElementById("formSplitSummaryBanner");
    const textEl = document.getElementById("formSplitSummaryText");
    if (!banner || !textEl) return;

    if (this.pendingSplitAllocations && this.pendingSplitAllocations.length > 0) {
      const totalRem = this.pendingSplitAllocations.reduce((sum, a) => sum + (this.parseAmount(a.amount) || 0), 0);
      banner.style.display = "flex";
      textEl.innerText = `Jaettu: ${this.pendingSplitAllocations.length} muuta osuutta (${this.formatEuro(totalRem)}) kohdistettavana`;
    } else {
      banner.style.display = "none";
    }
  }

  addSplitAllocationRow(prefill = {}) {
    if (!Array.isArray(this.pendingSplitAllocations)) {
      this.pendingSplitAllocations = [];
    }
    this.pendingSplitAllocations.push({
      id: "alloc_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
      targetType: prefill.targetType || "p2p",
      person: prefill.person || "",
      categoryId: prefill.categoryId || this.selectedCatId || "ruokakauppa",
      amount: prefill.amount !== undefined ? prefill.amount : 0
    });
    this.renderSplitAllocationRows();
    this.updateFormSplitSummaryBanner();
  }

  removeSplitAllocationRow(allocId) {
    this.pendingSplitAllocations = (this.pendingSplitAllocations || []).filter(a => a.id !== allocId);
    this.renderSplitAllocationRows();
    this.updateFormSplitSummaryBanner();
  }

  handleSplitAllocChange(allocId, field, value) {
    const item = (this.pendingSplitAllocations || []).find(a => a.id === allocId);
    if (!item) return;
    if (field === "amount") {
      item.amount = this.parseAmount(value);
    } else {
      item[field] = value;
    }
    if (field === "targetType") {
      this.renderSplitAllocationRows();
    }
    this.updateFormSplitSummaryBanner();
  }

  renderSplitAllocationRows() {
    const container = document.getElementById("splitAllocationRowsContainer");
    if (!container) return;
    container.innerHTML = "";

    if (!this.pendingSplitAllocations || this.pendingSplitAllocations.length === 0) {
      container.innerHTML = `
        <p style="font-size: 11px; color: var(--c-stone); padding: 4px 0;">
          Ei jaettuja lisäosuuksia. Voit jakaa kulun Laskimen Pikajaolla tai napauttamalla "+ Lisää osuus".
        </p>
      `;
      return;
    }

    const allCats = this.categories.getAll().filter(c => c.type !== "income");

    this.pendingSplitAllocations.forEach((alloc, idx) => {
      const row = document.createElement("div");
      row.className = "split-alloc-row";

      const isP2P = alloc.targetType !== "category";
      const catOptions = allCats.map(c =>
        `<option value="${c.id}" ${c.id === alloc.categoryId ? "selected" : ""}>${c.name}</option>`
      ).join("");

      row.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
          <span style="font-size: 11px; font-weight: 700; color: var(--c-primary);">Osuus #${idx + 2}</span>
          <div style="display: flex; align-items: center; gap: 6px;">
            <button type="button" class="segmented-btn ${isP2P ? 'active' : ''}" style="padding: 4px 8px; font-size: 11px; border: 1px solid var(--c-border);" onclick="app.handleSplitAllocChange('${alloc.id}', 'targetType', 'p2p')">
              Saatavaksi (Henkilö)
            </button>
            <button type="button" class="segmented-btn ${!isP2P ? 'active' : ''}" style="padding: 4px 8px; font-size: 11px; border: 1px solid var(--c-border);" onclick="app.handleSplitAllocChange('${alloc.id}', 'targetType', 'category')">
              Eri kategoriaan
            </button>
            <button type="button" style="background: none; border: none; color: var(--c-expense); font-size: 15px; cursor: pointer; padding: 2px 4px;" onclick="app.removeSplitAllocationRow('${alloc.id}')" title="Poista osuus">&times;</button>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1.3fr 0.9fr; gap: 8px; align-items: center;">
          <div>
            ${isP2P ? `
              <input type="text" class="form-input" style="padding: 8px 10px; font-size: 13px;" placeholder="Saajan / maksajan nimi" value="${(alloc.person || '').replace(/"/g, '&quot;')}" oninput="app.handleSplitAllocChange('${alloc.id}', 'person', this.value)">
            ` : `
              <select class="form-input" style="padding: 8px 10px; font-size: 13px;" onchange="app.handleSplitAllocChange('${alloc.id}', 'categoryId', this.value)">
                ${catOptions}
              </select>
            `}
          </div>
          <div style="position: relative;">
            <input type="text" inputmode="decimal" pattern="[0-9]*[.,]?[0-9]*" class="form-input font-num" style="padding: 8px 24px 8px 10px; font-size: 13px; font-weight: 700; text-align: right;" value="${alloc.amount ? String(alloc.amount).replace('.', ',') : ''}" placeholder="0,00" oninput="app.handleSplitAllocChange('${alloc.id}', 'amount', this.value)">
            <span style="position: absolute; right: 8px; top: 8px; font-size: 12px; color: var(--c-stone); pointer-events: none;">€</span>
          </div>
        </div>
      `;
      container.appendChild(row);
    });
  }

  openFabChoice() {
    this.openQuickAddModal();
  }

  chooseFabAction(action) {
    this.closeModal("modalFabChoice");
    if (action === "receipt") {
      this.openQuickReceiptModal();
    } else {
      this.openQuickAddModal();
    }
  }

  // --- AITO 3-VAIHEINEN STEP-BY-STEP WIZARD ---
  setWizardStep(step) {
    step = Math.min(3, Math.max(1, parseInt(step, 10) || 1));
    this.currentWizardStep = step;

    const btn1 = document.getElementById("wizardStepBtn1");
    const btn2 = document.getElementById("wizardStepBtn2");
    const btn3 = document.getElementById("wizardStepBtn3");
    const pane1 = document.getElementById("wizardStepPane1");
    const pane2 = document.getElementById("wizardStepPane2");
    const pane3 = document.getElementById("wizardStepPane3");
    const subtitleEl = document.getElementById("wizardStepSubtitle");

    if (btn1) {
      btn1.classList.toggle("active", step === 1);
      btn1.classList.toggle("completed", step > 1);
    }
    if (btn2) {
      btn2.classList.toggle("active", step === 2);
      btn2.classList.toggle("completed", step > 2);
    }
    if (btn3) {
      btn3.classList.toggle("active", step === 3);
      btn3.classList.toggle("completed", false);
    }

    // Näytetään kerrallaan VAIN aktiivisen vaiheen sisältö
    if (pane1) pane1.style.display = step === 1 ? "flex" : "none";
    if (pane2) pane2.style.display = step === 2 ? "flex" : "none";
    if (pane3) pane3.style.display = step === 3 ? "flex" : "none";

    const titles = {
      1: "Vaihe 1 / 3 · Perustiedot & Kuitti",
      2: "Vaihe 2 / 3 · Valitse kategoria",
      3: "Vaihe 3 / 3 · Tili & Jäännösosuuksien jako"
    };
    if (subtitleEl) subtitleEl.innerText = titles[step] || titles[1];

    // Päivitetään alareunan vaihepainikkeet
    const btnPrev = document.getElementById("btnWizardPrev");
    const btnNext = document.getElementById("btnWizardNext");
    const btnCalc = document.getElementById("btnWizardCalc");

    if (btnPrev) btnPrev.style.display = step > 1 ? "block" : "none";
    if (btnCalc) btnCalc.style.display = step === 1 ? "block" : "none";
    if (btnNext) {
      if (step === 1) {
        btnNext.style.display = "block";
        btnNext.innerHTML = "Seuraava: Kategoria &rarr;";
      } else if (step === 2) {
        btnNext.style.display = "block";
        btnNext.innerHTML = "Seuraava: Tili & Jako &rarr;";
      } else {
        btnNext.style.display = "none";
      }
    }
  }

  nextWizardStep() {
    if (this.currentWizardStep < 3) {
      this.setWizardStep(this.currentWizardStep + 1);
    }
  }

  prevWizardStep() {
    if (this.currentWizardStep > 1) {
      this.setWizardStep(this.currentWizardStep - 1);
    }
  }

  openQuickAddModal(prefill = {}) {
    const modal = document.getElementById("modalQuickAdd");
    if (!modal) return;

    this.tempReceiptData = null;
    this.currentReceiptId = prefill.receiptId || null;
    this.calcBaseTotal = 0;
    this.calcSplitPartsCount = 1;
    this.calcSplitPercentVal = 100;
    this.pendingSplitAllocations = [];

    if (!prefill.fromInbox && !prefill.receiptId) {
      this.activeProcessingInboxId = null;
      this.activeProcessingReceiptId = null;
    }

    const modalTitle = document.getElementById("modalFormTitle");
    if (modalTitle) modalTitle.innerText = prefill.id ? "Muokkaa kirjausta" : "Uusi kirjaus";

    const nameEl = document.getElementById("receiptFileName");
    const removeBtn = document.getElementById("btnRemoveReceipt");
    const viewBtn = document.getElementById("btnViewFormReceipt");
    const ocrBtn = document.getElementById("btnRunReceiptOCR");
    const ocrBox = document.getElementById("ocrStatusBox");
    const liveTextIn = document.getElementById("formLiveTextScan");
    if (ocrBox) ocrBox.style.display = "none";
    if (liveTextIn) liveTextIn.value = "";

    if (prefill.receiptId) {
      if (nameEl) nameEl.innerText = "Kuitti tallennettu";
      if (removeBtn) removeBtn.style.display = "inline";
      if (viewBtn) viewBtn.style.display = "inline-block";
      if (ocrBtn) ocrBtn.style.display = "inline-block";
    } else {
      if (nameEl) nameEl.innerText = "Kuitti & Älykäs tekstintunnistus (OCR)";
      if (removeBtn) removeBtn.style.display = "none";
      if (viewBtn) viewBtn.style.display = "none";
      if (ocrBtn) ocrBtn.style.display = "none";
    }

    document.getElementById("formTxId").value = prefill.id || "";
    document.getElementById("formAmount").value = prefill.amount ? prefill.amount.toString().replace(".", ",") : "";
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
      splitRow.style.display = prefill.id ? "flex" : "none";
    }

    this.setFormType(prefill.type || "expense");
    this.renderCategoryPills(prefill.categoryId || this.selectedCatId);
    this.renderSplitAllocationRows();
    this.updateFormSplitSummaryBanner();
    this.setWizardStep(1);

    modal.classList.add("active");
    const content = modal.querySelector(".modal-content");
    if (content) {
      content.scrollLeft = 0;
      content.scrollTop = 0;
    }
  }

  clearReceipt() {
    this.tempReceiptData = null;
    this.currentReceiptId = null;
    const nameEl = document.getElementById("receiptFileName");
    if (nameEl) nameEl.innerText = "Kuitti & Älykäs tekstintunnistus (OCR)";
    const removeBtn = document.getElementById("btnRemoveReceipt");
    if (removeBtn) removeBtn.style.display = "none";
    const viewBtn = document.getElementById("btnViewFormReceipt");
    if (viewBtn) viewBtn.style.display = "none";
    const ocrBtn = document.getElementById("btnRunReceiptOCR");
    if (ocrBtn) ocrBtn.style.display = "none";
    const ocrBox = document.getElementById("ocrStatusBox");
    if (ocrBox) ocrBox.style.display = "none";
    const cam = document.getElementById("formReceiptCamera");
    if (cam) cam.value = "";
    const file = document.getElementById("formReceiptFile");
    if (file) file.value = "";
    this.closeReceiptOverlay();
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
      btnExp.style.backgroundColor = "var(--c-primary)";
      btnExp.style.color = "#FFFFFF";
      btnInc.style.backgroundColor = "var(--c-card-sub)";
      btnInc.style.color = "var(--c-stone)";
    } else {
      btnInc.style.backgroundColor = "var(--c-olive)";
      btnInc.style.color = "#FFFFFF";
      btnExp.style.backgroundColor = "var(--c-card-sub)";
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
      btn.style.padding = "10px 10px";
      btn.style.fontSize = "12px";
      btn.style.textAlign = "left";
      btn.style.cursor = "pointer";
      btn.style.width = "100%";
      btn.style.maxWidth = "100%";
      btn.style.minWidth = "0";
      btn.style.display = "flex";
      btn.style.alignItems = "center";
      btn.style.gap = "8px";
      btn.style.overflow = "hidden";
      btn.style.boxSizing = "border-box";
      btn.title = c.name;

      const isSelected = c.id === activeCatId;
      if (isSelected) {
        btn.style.borderColor = c.color || "var(--c-primary)";
        btn.style.backgroundColor = "var(--c-card-sub)";
        btn.style.fontWeight = "700";
      }

      btn.onclick = () => {
        this.selectedCatId = c.id;
        this.renderCategoryPills(c.id);
      };

      btn.innerHTML = `
        <span style="display: inline-block; width: 9px; height: 9px; border-radius: 50%; background-color: ${c.color}; flex-shrink: 0;"></span>
        <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0;">${c.name}</span>
      `;
      container.appendChild(btn);
    });

    if (cats.length > 0 && !cats.find(c => c.id === activeCatId)) {
      this.selectedCatId = cats[0].id;
    }
  }

  // --- KUITIN TEKSTINTUNNISTUS (OCR Tesseract.js + iPhone Live Text) ---
  parseReceiptOCRText(rawText) {
    if (!rawText || typeof rawText !== "string") {
      return { amount: null, vendor: null, date: null };
    }
    const text = rawText.replace(/\r/g, "\n");
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

    // 1. Tunnistetaan tunnettuja suomalaisia kauppoja ja palveluita
    const knownVendors = [
      "Alepa", "K-Market", "K-Supermarket", "K-Citymarket", "Prisma", "S-market", "Lidl",
      "Tokmanni", "R-kioski", "Alko", "Apteekki", "Yliopiston Apteekki", "Clas Ohlson",
      "Motonet", "Biltema", "Ikea", "Gigantti", "Power", "Verkkokauppa", "HSL", "VR",
      "Bolt", "Uber", "Wolt", "Foodora", "Hesburger", "McDonald's", "Burger King",
      "Kotipizza", "Subway", "Espresso House", "Fazer", "ABC", "Neste", "St1", "Shell"
    ];
    let detectedVendor = null;
    for (const v of knownVendors) {
      const regex = new RegExp("\\b" + v.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&") + "\\b", "i");
      if (regex.test(text)) {
        detectedVendor = v;
        break;
      }
    }
    if (!detectedVendor && lines.length > 0) {
      const firstLine = lines.find(l => l.length >= 3 && !/^\d+$/.test(l) && !/kuitti|ostos|kopio|pvm/i.test(l));
      if (firstLine) {
        detectedVendor = firstLine.slice(0, 28);
      }
    }

    // 2. Etsitään YHTEENSÄ / MAKSETTAVA / TOTAL / SUMMA -rivi tai suurin järkevä desimaalisumma
    let detectedAmount = null;
    const totalKeywords = /(?:yhteens[äa]|maksettava|summa|total|korttimaksu|veloitus|eur)\s*[:.]?\s*(\d{1,5}[.,]\d{2})/i;
    for (const line of lines) {
      const m = line.match(totalKeywords);
      if (m && m[1]) {
        const val = parseFloat(m[1].replace(",", "."));
        if (!isNaN(val) && val > 0 && val < 50000) {
          detectedAmount = val;
          break;
        }
      }
    }

    if (detectedAmount === null) {
      const allAmounts = [];
      const amtRegex = /\b(\d{1,4}[.,]\d{2})\b/g;
      let match;
      while ((match = amtRegex.exec(text)) !== null) {
        const num = parseFloat(match[1].replace(",", "."));
        if (!isNaN(num) && num > 0 && num < 20000) {
          allAmounts.push(num);
        }
      }
      if (allAmounts.length > 0) {
        detectedAmount = Math.max(...allAmounts);
      }
    }

    // 3. Etsitään suomalainen päivämäärä (esim. 2.11.2026 tai 02.11.26)
    let detectedDate = null;
    const dateMatch = text.match(/\b(\d{1,2})\.(\d{1,2})\.(20\d{2}|\d{2})\b/);
    if (dateMatch) {
      const d = String(dateMatch[1]).padStart(2, "0");
      const m = String(dateMatch[2]).padStart(2, "0");
      let y = dateMatch[3];
      if (y.length === 2) y = "20" + y;
      if (parseInt(m, 10) >= 1 && parseInt(m, 10) <= 12 && parseInt(d, 10) >= 1 && parseInt(d, 10) <= 31) {
        detectedDate = `${y}-${m}-${d}`;
      }
    }

    return {
      amount: detectedAmount,
      vendor: detectedVendor,
      date: detectedDate
    };
  }

  handleLiveTextScanInput(rawText) {
    if (!rawText || !rawText.trim()) return;
    const parsed = this.parseReceiptOCRText(rawText);
    const amountField = document.getElementById("formAmount");
    const vendorField = document.getElementById("formVendor");
    const dateField = document.getElementById("formDate");

    if (parsed.amount !== null && amountField) {
      amountField.value = parsed.amount.toFixed(2).replace(".", ",");
    } else {
      // Jos skannattiin pelkkä luku (esim. "14,90")
      const directNum = this.parseAmount(rawText);
      if (directNum > 0 && directNum < 50000 && amountField && /\d/.test(rawText)) {
        amountField.value = directNum.toFixed(2).replace(".", ",");
      }
    }
    if (parsed.vendor && vendorField && !vendorField.value) {
      vendorField.value = parsed.vendor;
    }
    if (parsed.date && dateField) {
      dateField.value = parsed.date;
    }
  }

  async runReceiptOCR(dataUrlOverride = null) {
    const ocrBox = document.getElementById("ocrStatusBox");
    const statusLabel = document.getElementById("ocrStatusLabel");
    const progressEl = document.getElementById("ocrProgressPct");
    const suggestionsEl = document.getElementById("ocrDetectedSuggestions");

    let imgSource = dataUrlOverride || this.tempReceiptData;
    if (!imgSource && this.currentReceiptId) {
      imgSource = await this.storage.getReceipt(this.currentReceiptId);
    }
    if (!imgSource) return;

    if (ocrBox) ocrBox.style.display = "flex";
    if (suggestionsEl) {
      suggestionsEl.style.display = "none";
      suggestionsEl.innerHTML = "";
    }

    if (typeof window === "undefined" || !window.Tesseract) {
      if (statusLabel) statusLabel.innerText = "Käytä iPhonen 'Skannaa teksti' -kenttää alla poimiaksesi tiedot.";
      return;
    }

    try {
      if (statusLabel) statusLabel.innerText = "Tunnistetaan tekstiä kuitista (OCR)...";
      if (progressEl) progressEl.innerText = "0 %";

      const result = await window.Tesseract.recognize(imgSource, "fin+eng", {
        logger: (m) => {
          if (m && m.status === "recognizing text" && typeof m.progress === "number" && progressEl) {
            progressEl.innerText = Math.round(m.progress * 100) + " %";
          }
        }
      });

      const rawText = result?.data?.text || "";
      const parsed = this.parseReceiptOCRText(rawText);
      if (progressEl) progressEl.innerText = "Valmis";

      const amountField = document.getElementById("formAmount");
      const vendorField = document.getElementById("formVendor");
      const dateField = document.getElementById("formDate");

      const appliedParts = [];
      if (parsed.amount !== null && amountField && (!amountField.value || amountField.value === "0,00")) {
        amountField.value = parsed.amount.toFixed(2).replace(".", ",");
        appliedParts.push(`Summa: ${this.formatEuro(parsed.amount)}`);
      }
      if (parsed.vendor && vendorField && !vendorField.value) {
        vendorField.value = parsed.vendor;
        appliedParts.push(`Kauppa: ${parsed.vendor}`);
      }
      if (parsed.date && dateField) {
        dateField.value = parsed.date;
        appliedParts.push(`Pvm: ${FinanceCalculator.formatDateFi(parsed.date)}`);
      }

      if (appliedParts.length > 0) {
        if (statusLabel) statusLabel.innerText = `✓ Tunnistettu kuitista: ${appliedParts.join(" · ")}`;
      } else if (parsed.amount !== null || parsed.vendor) {
        if (statusLabel) statusLabel.innerText = "Löydetyt tiedot (napauta käyttääksesi):";
        if (suggestionsEl) {
          suggestionsEl.style.display = "flex";
          if (parsed.amount !== null) {
            const btnAmt = document.createElement("button");
            btnAmt.type = "button";
            btnAmt.className = "tag-badge olive";
            btnAmt.style.cursor = "pointer";
            btnAmt.style.border = "none";
            btnAmt.innerText = `Käytä summaa ${this.formatEuro(parsed.amount)}`;
            btnAmt.onclick = () => {
              if (amountField) amountField.value = parsed.amount.toFixed(2).replace(".", ",");
            };
            suggestionsEl.appendChild(btnAmt);
          }
          if (parsed.vendor) {
            const btnVen = document.createElement("button");
            btnVen.type = "button";
            btnVen.className = "tag-badge stone";
            btnVen.style.cursor = "pointer";
            btnVen.style.border = "none";
            btnVen.innerText = `Kauppa: ${parsed.vendor}`;
            btnVen.onclick = () => {
              if (vendorField) vendorField.value = parsed.vendor;
            };
            suggestionsEl.appendChild(btnVen);
          }
        }
      } else {
        if (statusLabel) statusLabel.innerText = "Summaa ei erottunut automaattisesti — voit käyttää iPhonen 'Skannaa teksti' -kenttää.";
      }
    } catch (err) {
      console.warn("OCR-virhe:", err);
      if (statusLabel) statusLabel.innerText = "OCR-analyysi keskeytyi — voit käyttää iPhonen 'Skannaa teksti' -toimintoa.";
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
      const viewBtn = document.getElementById("btnViewFormReceipt");
      if (viewBtn) viewBtn.style.display = "inline-block";
      const ocrBtn = document.getElementById("btnRunReceiptOCR");
      if (ocrBtn) ocrBtn.style.display = "inline-block";

      // Avataan kuitin esikatselu heti ruudulle kelluvana ikkunana ja käynnistetään automaattinen OCR-tekstintunnistus!
      this.openReceiptOverlay(compressedDataUrl, file.name || "Liitetty kuitti");
      this.runReceiptOCR(compressedDataUrl);
    } catch (e) {
      console.error("Kuvan tiivistys epäonnistui:", e);
      this.showDialog({
        title: "Kuvan tiivistys epäonnistui",
        message: e.message || String(e),
        type: "alert",
        icon: "warning"
      });
      document.getElementById("receiptFileName").innerText = "Virhe kuvan käsittelyssä";
    }
  }

  async handleFormSubmit(event) {
    event.preventDefault();

    const id = document.getElementById("formTxId").value || "tx_" + Date.now();
    const amount = this.parseAmount(document.getElementById("formAmount").value);
    const vendor = document.getElementById("formVendor").value.trim();
    const date = document.getElementById("formDate").value;
    const desc = document.getElementById("formDesc").value.trim();
    const accountId = document.getElementById("formAccount")?.value || null;

    let receiptId = this.currentReceiptId || null;
    if (this.tempReceiptData) {
      receiptId = receiptId || ("rec_" + Date.now());
      await this.storage.saveReceipt(receiptId, this.tempReceiptData);
    }

    const existing = this.transactions.find(t => t.id === id);
    const createdAt = existing?.createdAt || (id.startsWith("tx_") ? new Date(parseInt(id.replace("tx_", ""), 10) || Date.now()).toISOString() : new Date().toISOString());

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
      createdAt,
      updatedAt: new Date().toISOString()
    };

    // Jos olemassa oleva kirjaus ja sillä oli splitInfo, säilytetään se
    if (existing && existing.splitInfo) {
      tx.splitInfo = existing.splitInfo;
    }

    // Käsitellään uudet jäännösosuuksien allokoinnit (Saatavat muille TAI eri kategoriat)
    const validAllocations = (this.pendingSplitAllocations || []).filter(a => (this.parseAmount(a.amount) || 0) > 0);
    if (validAllocations.length > 0) {
      const p2pNames = [];
      let p2pSum = 0;

      for (let i = 0; i < validAllocations.length; i++) {
        const alloc = validAllocations[i];
        const allocAmt = this.parseAmount(alloc.amount);
        if (alloc.targetType === "category") {
          // Luodaan erillinen tapahtuma valittuun toiseen kategoriaan
          const subTx = {
            id: "tx_" + (Date.now() + i + 1),
            date,
            type: this.formType,
            category: alloc.categoryId || this.selectedCatId,
            amount: allocAmt,
            vendor,
            desc: desc ? `${desc} (Jaettu osuus)` : "Jaettu osuus kuitista",
            receiptId,
            accountId,
            createdAt: new Date(Date.now() + i + 1).toISOString(),
            updatedAt: new Date(Date.now() + i + 1).toISOString()
          };
          await this.storage.saveTransaction(subTx);
        } else {
          // Luodaan saatava (P2P Loan) henkilölle vaikuttamatta omaan ruokabudjettiin
          const personName = (alloc.person || "").trim() || "Jaettu osuus";
          p2pNames.push(personName);
          p2pSum += allocAmt;
          const p2pEntry = {
            id: "p2p_" + (Date.now() + i + 1),
            person: personName,
            type: "lent",
            amount: allocAmt,
            date: date || new Date().toISOString().split("T")[0],
            notes: `Jaettu kulu: ${vendor || this.categories.getById(this.selectedCatId)?.name || "Ostos"}`,
            settled: false,
            transactionId: tx.id
          };
          this.p2pLoans.push(p2pEntry);
        }
      }

      if (p2pNames.length > 0) {
        tx.splitInfo = {
          person: p2pNames.join(", "),
          amount: Math.round(p2pSum * 100) / 100
        };
        await this.storage.saveP2pLoans(this.p2pLoans);
      }
      this.pendingSplitAllocations = [];
    }

    await this.storage.saveTransaction(tx);

    // Jos käsittelimme avointa kuittia ja summa on annettu (> 0), poistetaan se heti inboxista ilman viivettä
    const isResolvedReceipt = (amount > 0) && (
      this.activeProcessingInboxId ||
      this.activeProcessingReceiptId ||
      receiptId
    );

    if (isResolvedReceipt) {
      const matchInboxId = this.activeProcessingInboxId;
      const matchRecId = this.activeProcessingReceiptId || receiptId;
      this.receiptInbox = this.receiptInbox.filter(r => {
        if (matchInboxId && r.id === matchInboxId) return false;
        if (matchRecId && (r.receiptId === matchRecId || r.id === matchRecId)) return false;
        return true;
      });
      await this.storage.saveReceiptInbox(this.receiptInbox);
      this.activeProcessingInboxId = null;
      this.activeProcessingReceiptId = null;
      this.renderInbox();
      this.updateInboxBadges();
    }

    this.closeModal("modalQuickAdd");
    this.closeReceiptOverlay();
    await this.refreshData();
  }

  async deleteCurrentEditingTransaction() {
    const id = document.getElementById("formTxId")?.value;
    if (!id) return;
    this.closeModal("modalQuickAdd");
    await this.deleteTransaction(id);
  }

  async deleteTransaction(id) {
    const ok = await this.showDialog({
      title: "Poista kirjaus",
      message: "Haluatko varmasti poistaa tämän kirjauksen pysyvästi?",
      type: "confirm",
      icon: "trash",
      confirmText: "Poista",
      cancelText: "Peruuta"
    });
    if (ok) {
      await this.storage.deleteTransaction(id);
      await this.refreshData();
    }
  }

  // --- KATEGORIOIDEN & PÄÄRYHMIEN TYYLIKKÄÄT PERUSVÄRIT (Vaalea & Tumma) ---
  getStandardColorPalette() {
    return [
      "#2563EB", // Sähkönsininen (Arki & Ruoka)
      "#6366F1", // Indigo (Kiinteät & Asuminen)
      "#F59E0B", // Meripihka (Ravintolat & Vapaa-aika)
      "#0EA5E9", // Taivaansininen (Liikkuminen & Matkat)
      "#10B981", // Smaragdinvihreä (Tulot & Säästöt)
      "#EC4899", // Roosa (Viihde & Hyvinvointi)
      "#8B5CF6", // Violetti (Kulttuuri & Tilaukset)
      "#14B8A6", // Turkoosi (Koti & Hankinnat)
      "#EF4444", // Korallinpunainen (Velat & Tärkeät)
      "#64748B"  // Liuskekivenharmaa (Muut)
    ];
  }

  selectCategoryColor(colorHex) {
    if (!colorHex) return;
    const clean = colorHex.trim();
    const colorInput = document.getElementById("catFormColor");
    const pickerInput = document.getElementById("catFormColorPicker");
    const swatchesContainer = document.getElementById("catColorSwatches");
    if (colorInput) colorInput.value = clean;
    if (pickerInput && /^#[0-9A-Fa-f]{6}$/.test(clean)) pickerInput.value = clean;
    if (swatchesContainer) {
      swatchesContainer.querySelectorAll(".color-swatch-chip").forEach(el => {
        el.classList.toggle("active", (el.dataset.color || "").toLowerCase() === clean.toLowerCase());
      });
    }
  }

  handleCatFormGroupChange(groupId) {
    const idInput = document.getElementById("catFormId");
    // Jos luodaan uutta kategoriaa, peritään oletusväri valitulta pääryhmältä
    if (!idInput || !idInput.value) {
      const grp = this.categories.getGroupById(groupId);
      if (grp && grp.color) {
        this.selectCategoryColor(grp.color);
      }
    }
  }

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
    const swatchesContainer = document.getElementById("catColorSwatches");

    const palette = this.getStandardColorPalette();
    let activeColor = palette[0];

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
      activeColor = cat.color || palette[0];
      const delCatBtn = document.getElementById("btnDeleteCurrentCat");
      if (delCatBtn) delCatBtn.style.display = "block";
    } else {
      const targetGrpId = prefillGroupId || "arki";
      const grp = this.categories.getGroupById(targetGrpId);
      activeColor = (grp && grp.color) ? grp.color : palette[0];
      if (titleEl) titleEl.innerText = "Uusi kategoria";
      if (idInput) idInput.value = "";
      if (nameInput) nameInput.value = "";
      if (groupSelect) groupSelect.value = targetGrpId;
      if (budgetInput) budgetInput.value = "";
      if (quickCheck) quickCheck.checked = false;
      if (quickAmountInput) quickAmountInput.value = "";
      if (quickRow) quickRow.style.display = "none";
      const delCatBtn = document.getElementById("btnDeleteCurrentCat");
      if (delCatBtn) delCatBtn.style.display = "none";
    }

    if (swatchesContainer) {
      swatchesContainer.innerHTML = "";
      palette.forEach(c => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.dataset.color = c;
        chip.className = `color-swatch-chip ${c.toLowerCase() === activeColor.toLowerCase() ? "active" : ""}`;
        chip.style.backgroundColor = c;
        chip.onclick = () => this.selectCategoryColor(c);
        swatchesContainer.appendChild(chip);
      });
    }
    this.selectCategoryColor(activeColor);

    const modal = document.getElementById("modalCategory");
    if (modal) modal.classList.add("active");
  }

  async handleCategorySubmit(event) {
    event.preventDefault();
    const id = document.getElementById("catFormId")?.value;
    const name = document.getElementById("catFormName").value.trim();
    const groupId = document.getElementById("catFormGroup").value;
    const color = document.getElementById("catFormColor")?.value || "#2563EB";
    const budget = this.parseAmount(document.getElementById("catFormBudget").value);
    const quickAction = document.getElementById("catFormQuickAction")?.checked || false;
    const quickAmount = this.parseAmount(document.getElementById("catFormQuickAmount")?.value);

    if (id) {
      await this.categories.updateCategory(id, {
        name,
        groupId,
        color,
        budgetMonthly: budget,
        quickAction,
        quickAmount
      });
    } else {
      await this.categories.addCategory({
        name,
        groupId,
        color,
        budgetMonthly: budget,
        quickAction,
        quickAmount
      });
    }

    this.closeModal("modalCategory");
    await this.refreshData();
    this.storage.triggerBackgroundSync();
  }

  async deleteCurrentEditingCategory() {
    const id = document.getElementById("catFormId")?.value;
    if (!id) return;
    this.closeModal("modalCategory");
    await this.deleteCategory(id);
  }

  async deleteCategory(id) {
    const ok = await this.showDialog({
      title: "Poista kategoria",
      message: "Haluatko poistaa tämän kategorian?",
      type: "confirm",
      icon: "trash",
      confirmText: "Poista kategoria",
      cancelText: "Peruuta"
    });
    if (ok) {
      await this.categories.deleteCategory(id);
      await this.refreshData();
    }
  }

  // --- KATEGORIARYHMIEN HALLINTA (PÄÄRYHMÄT) ---
  selectGroupColor(colorHex) {
    if (!colorHex) return;
    const clean = colorHex.trim();
    const colorInput = document.getElementById("groupFormColor");
    const pickerInput = document.getElementById("groupFormColorPicker");
    const swatchesContainer = document.getElementById("groupColorSwatches");
    if (colorInput) colorInput.value = clean;
    if (pickerInput && /^#[0-9A-Fa-f]{6}$/.test(clean)) pickerInput.value = clean;
    if (swatchesContainer) {
      swatchesContainer.querySelectorAll(".color-swatch-chip").forEach(el => {
        el.classList.toggle("active", (el.dataset.color || "").toLowerCase() === clean.toLowerCase());
      });
    }
  }

  openGroupModal(groupId = null) {
    const swatchesContainer = document.getElementById("groupColorSwatches");
    const nameInput = document.getElementById("groupFormName");
    const idInput = document.getElementById("groupFormId");
    const titleEl = document.getElementById("modalGroupTitle");
    const deleteBtn = document.getElementById("btnDeleteCategoryGroup");

    const palette = this.getStandardColorPalette();
    let activeColor = palette[0];

    if (groupId) {
      const grp = this.categories.getGroupById(groupId);
      if (grp) {
        if (titleEl) titleEl.innerText = "Muokkaa pääryhmää";
        if (idInput) idInput.value = grp.id;
        if (nameInput) nameInput.value = grp.name;
        activeColor = grp.color || palette[0];
        if (deleteBtn) deleteBtn.style.display = "block";
      }
    } else {
      if (titleEl) titleEl.innerText = "Uusi pääryhmä";
      if (idInput) idInput.value = "";
      if (nameInput) nameInput.value = "";
      if (deleteBtn) deleteBtn.style.display = "none";
    }

    if (swatchesContainer) {
      swatchesContainer.innerHTML = "";
      palette.forEach(c => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.dataset.color = c;
        chip.className = `color-swatch-chip ${c.toLowerCase() === activeColor.toLowerCase() ? "active" : ""}`;
        chip.style.backgroundColor = c;
        chip.onclick = () => this.selectGroupColor(c);
        swatchesContainer.appendChild(chip);
      });
    }
    this.selectGroupColor(activeColor);

    this.openModal("modalCategoryGroup");
  }

  async handleGroupSubmit(event) {
    event.preventDefault();
    const id = document.getElementById("groupFormId")?.value;
    const name = document.getElementById("groupFormName")?.value.trim();
    const color = document.getElementById("groupFormColor")?.value || "#2563EB";

    if (!name) return;

    if (id) {
      await this.categories.updateGroup(id, { name, color });
    } else {
      await this.categories.addGroup({ name, color });
    }

    this.closeModal("modalCategoryGroup");
    await this.refreshData();
    this.storage.triggerBackgroundSync();
  }

  async deleteCurrentGroup() {
    const id = document.getElementById("groupFormId")?.value;
    if (!id) return;
    const ok = await this.showDialog({
      title: "Poista pääryhmä",
      message: "Haluatko varmasti poistaa tämän pääryhmän? Siihen kuuluvat kategoriat siirretään toiseen ryhmään.",
      type: "confirm",
      icon: "warning",
      confirmText: "Poista pääryhmä",
      cancelText: "Peruuta"
    });
    if (ok) {
      await this.categories.deleteGroup(id);
      this.closeModal("modalCategoryGroup");
      await this.refreshData();
      this.storage.triggerBackgroundSync();
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
      const path = await this.showDialog({
        title: "Kansion polku",
        message: "Syötä kansion polku tallennusta varten:",
        type: "prompt",
        icon: "cloud",
        defaultValue: current,
        suffix: "",
        confirmText: "Aseta polku",
        cancelText: "Peruuta"
      });
      if (path !== null && path !== "") {
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
    const ok = await this.showDialog({
      title: "Nollaa tavoitteet",
      message: "Haluatko varmasti nollata kaikki kuukausitavoitteet puhtaaksi (0 €)?",
      type: "confirm",
      icon: "warning",
      confirmText: "Nollaa tavoitteet",
      cancelText: "Peruuta"
    });
    if (ok) {
      const allCats = this.categories.getAll();
      for (const c of allCats) {
        c.budgetMonthly = 0;
        c.quickAction = false;
        c.quickAmount = 0;
      }
      await this.categories.save();
      await this.refreshData();
      await this.storage.syncToCloud(true);
      await this.showDialog({
        title: "Tavoitteet nollattu",
        message: "Kaikki kuukausitavoitteet on nollattu puhtaaksi (0 €).",
        type: "alert",
        icon: "success"
      });
    }
  }

  async saveDropboxConfig() {
    const tokenEl = document.getElementById("settingDropboxToken");
    const folderEl = document.getElementById("settingDropboxFolder");
    const appKeyEl = document.getElementById("settingDropboxAppKey");
    const refreshTokenEl = document.getElementById("settingDropboxRefreshToken");
    const appSecretEl = document.getElementById("settingDropboxAppSecret");

    if (tokenEl) {
      this.storage.setDropboxToken(tokenEl.value.trim());
    }
    if (appKeyEl) {
      this.storage.setDropboxAppKey(appKeyEl.value.trim());
    }
    if (refreshTokenEl) {
      this.storage.setDropboxRefreshToken(refreshTokenEl.value.trim());
    }
    if (appSecretEl) {
      this.storage.setDropboxAppSecret(appSecretEl.value.trim());
    }
    if (folderEl) {
      this.storage.setDropboxFolder(folderEl.value.trim());
      folderEl.value = this.storage.getDropboxFolder();
    }
    this.updateSyncBadge();
    this.storage.syncToCloud(true);
    await this.showDialog({
      title: "Asetukset tallennettu",
      message: "Dropbox-asetukset on tallennettu selaimeen.",
      type: "alert",
      icon: "cloud"
    });
  }

  saveDropboxAppKey() {
    const el = document.getElementById("settingDropboxAppKey");
    if (el) this.storage.setDropboxAppKey(el.value.trim());
    this.updateSyncBadge();
  }

  saveDropboxRefreshToken() {
    const el = document.getElementById("settingDropboxRefreshToken");
    if (el) this.storage.setDropboxRefreshToken(el.value.trim());
    this.updateSyncBadge();
    this.storage.syncToCloud(true);
  }

  saveDropboxAppSecret() {
    const el = document.getElementById("settingDropboxAppSecret");
    if (el) this.storage.setDropboxAppSecret(el.value.trim());
  }

  async connectDropboxPKCE() {
    const appKey = (document.getElementById("settingDropboxAppKey")?.value || this.storage.getDropboxAppKey()).trim();
    if (!appKey) {
      const input = await this.showDialog({
        title: "Dropbox App Key",
        message: "Syötä Dropbox App Key (löydät sen Dropbox App Consolen Settings-välilehdeltä):",
        type: "prompt",
        icon: "cloud",
        defaultValue: "",
        suffix: "",
        confirmText: "Jatka valtuutukseen",
        cancelText: "Peruuta"
      });
      if (!input) return;
      this.storage.setDropboxAppKey(input.trim());
      const keyEl = document.getElementById("settingDropboxAppKey");
      if (keyEl) keyEl.value = input.trim();
    }

    try {
      await this.storage.startDropboxPKCEAuth();
    } catch (e) {
      await this.showDialog({
        title: "Valtuutusvirhe",
        message: e.message || String(e),
        type: "alert",
        icon: "warning"
      });
    }
  }

  saveDropboxFolder() {
    const folderEl = document.getElementById("settingDropboxFolder");
    if (folderEl) {
      this.storage.setDropboxFolder(folderEl.value.trim());
      folderEl.value = this.storage.getDropboxFolder();
    }
  }

  async saveGDriveConfig() {
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
    this.storage.syncToCloud(true);
    await this.showDialog({
      title: "Asetukset tallennettu",
      message: "Google Drive -asetukset on tallennettu selaimeen.",
      type: "alert",
      icon: "cloud"
    });
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
    const raw = document.getElementById("settingFreeBalanceManual")?.value;
    const val = raw ? this.parseAmount(raw) : null;
    this.freeBalanceManual = val;
    await this.storage.setSetting("freeBalanceManual", this.freeBalanceManual);
    this.renderDashboard();
  }

  async manualSync(direction) {
    try {
      if (direction === "upload") {
        await this.storage.syncToCloud(false);
        await this.showDialog({
          title: "Pilvitallennus valmis",
          message: "Kaikki tiedot on tallennettu pilveen onnistuneesti.",
          type: "alert",
          icon: "success"
        });
      } else {
        const ok = await this.showDialog({
          title: "Lataa pilvestä",
          message: "Haluatko ladata ja synkronoida tiedot pilvestä? Tämä yhdistää paikalliset tiedot pilven uusimpaan versioon.",
          type: "confirm",
          icon: "cloud",
          confirmText: "Lataa & Synkkaa",
          cancelText: "Peruuta"
        });
        if (!ok) return;

        await this.storage.syncFromCloud(false);
        await this.refreshData();
        await this.showDialog({
          title: "Pilvisynkronointi valmis",
          message: "Tiedot on ladattu ja synkronoitu pilvestä onnistuneesti.",
          type: "alert",
          icon: "success"
        });
      }
    } catch (e) {
      await this.showDialog({
        title: "Synkronointivirhe",
        message: e.message || String(e),
        type: "alert",
        icon: "warning"
      });
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
      await this.showDialog({
        title: "CSV-vientivirhe",
        message: e.message || String(e),
        type: "alert",
        icon: "warning"
      });
    }
  }

  async handleJSONFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    try {
      await this.interchange.importJSON(file);
      await this.refreshData();
      await this.showDialog({
        title: "Varmuuskopio palautettu",
        message: "JSON-varmuuskopio ja asetukset palautettu onnistuneesti!",
        type: "alert",
        icon: "success"
      });
    } catch (e) {
      await this.showDialog({
        title: "Tuontivirhe",
        message: e.message || String(e),
        type: "alert",
        icon: "warning"
      });
    }
  }

  async handleCSVFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    try {
      const count = await this.interchange.importCSV(file);
      await this.refreshData();
      await this.showDialog({
        title: "CSV-tuonti valmis",
        message: `Tuotu ${count} tapahtumaa CSV-tiedostosta.`,
        type: "alert",
        icon: "success"
      });
    } catch (e) {
      await this.showDialog({
        title: "CSV-tuontivirhe",
        message: e.message || String(e),
        type: "alert",
        icon: "warning"
      });
    }
  }
}

// Käynnistetään sovellus kun DOM on valmis
window.app = new BudjettiApp();
document.addEventListener("DOMContentLoaded", () => {
  window.app.init();
});
