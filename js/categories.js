/**
 * Budjetti Web App - Category Management Layer
 * 2-tasoinen hierarkia (Pääryhmät ja muokattavat alikategoriat kuukausikatolla)
 */

const DEFAULT_CATEGORY_GROUPS = [
  { id: "arki", name: "Päivittäistalous & Arki", color: "#5C6A51" },
  { id: "laskut", name: "Kiinteät kulut & Asuminen", color: "#683F26" },
  { id: "vapaaaika", name: "Ravintolat & Vapaa-aika", color: "#A6243C" },
  { id: "liikenne", name: "Liikkuminen & Matkat", color: "#A5A088" },
  { id: "tulot", name: "Tulot & Saamiset", color: "#5C6A51" }
];

const DEFAULT_CATEGORIES = [
  // Päivittäistalous & Arki
  {
    id: "ruokakauppa",
    name: "Ruokakauppa & Tarvikkeet",
    groupId: "arki",
    color: "#5C6A51",
    budgetMonthly: 500.00,
    quickAction: true,
    quickAmount: 15.00
  },
  {
    id: "apteekki",
    name: "Terveys & Apteekki",
    groupId: "arki",
    color: "#5C6A51",
    budgetMonthly: 60.00,
    quickAction: false
  },
  {
    id: "lapset",
    name: "Lapset & Perhe",
    groupId: "arki",
    color: "#5C6A51",
    budgetMonthly: 120.00,
    quickAction: false
  },

  // Kiinteät kulut & Asuminen
  {
    id: "asuminen",
    name: "Vuokra / Vastike & Sähkö",
    groupId: "laskut",
    color: "#683F26",
    budgetMonthly: 850.00,
    quickAction: false
  },
  {
    id: "puhelin_netti",
    name: "Puhelin & Verkkoyhteydet",
    groupId: "laskut",
    color: "#683F26",
    budgetMonthly: 45.00,
    quickAction: false
  },

  // Ravintolat & Vapaa-aika
  {
    id: "lounas",
    name: "Lounaat & Kahvilat",
    groupId: "vapaaaika",
    color: "#683F26",
    budgetMonthly: 180.00,
    quickAction: true,
    quickAmount: 12.50
  },
  {
    id: "viihde",
    name: "Kulttuuri & Harrastukset",
    groupId: "vapaaaika",
    color: "#A6243C",
    budgetMonthly: 80.00,
    quickAction: false
  },

  // Liikkuminen
  {
    id: "liikenne",
    name: "Joukkoliikenne & Taksi",
    groupId: "liikenne",
    color: "#A6243C",
    budgetMonthly: 80.00,
    quickAction: true,
    quickAmount: 3.20
  },

  // Tulot
  {
    id: "palkka",
    name: "Palkkatulot",
    groupId: "tulot",
    color: "#5C6A51",
    budgetMonthly: 2043.97,
    type: "income"
  },
  {
    id: "muu_tulo",
    name: "Muut tulot & Palautukset",
    groupId: "tulot",
    color: "#5C6A51",
    budgetMonthly: 0,
    type: "income"
  }
];

class CategoryManager {
  constructor(storage) {
    this.storage = storage;
    this.groups = [...DEFAULT_CATEGORY_GROUPS];
    this.categories = [...DEFAULT_CATEGORIES];
  }

  async init() {
    const saved = await this.storage.getSetting("categories", null);
    if (saved && Array.isArray(saved.categories)) {
      this.categories = saved.categories;
      this.groups = saved.groups || [...DEFAULT_CATEGORY_GROUPS];
    } else {
      await this.save();
    }
  }

  async save() {
    await this.storage.setSetting("categories", {
      groups: this.groups,
      categories: this.categories
    });
  }

  getAll() {
    return this.categories;
  }

  getGroups() {
    return this.groups;
  }

  getById(id) {
    return this.categories.find(c => c.id === id) || {
      id: "muut",
      name: "Muu meno",
      groupId: "arki",
      color: "#A5A088",
      budgetMonthly: 0
    };
  }

  getQuickActions() {
    return this.categories.filter(c => c.quickAction);
  }

  getByGroup(groupId) {
    return this.categories.filter(c => c.groupId === groupId);
  }

  async addCategory(cat) {
    const newCat = {
      id: cat.id || "cat_" + Date.now(),
      name: cat.name.trim(),
      groupId: cat.groupId || "arki",
      color: cat.color || "#A5A088",
      budgetMonthly: parseFloat(cat.budgetMonthly) || 0,
      quickAction: !!cat.quickAction,
      quickAmount: parseFloat(cat.quickAmount) || 0,
      type: cat.type || "expense"
    };
    this.categories.push(newCat);
    await this.save();
    return newCat;
  }

  async updateCategory(id, updates) {
    const idx = this.categories.findIndex(c => c.id === id);
    if (idx !== -1) {
      this.categories[idx] = { ...this.categories[idx], ...updates };
      await this.save();
      return this.categories[idx];
    }
    return null;
  }

  async deleteCategory(id) {
    this.categories = this.categories.filter(c => c.id !== id);
    await this.save();
    return true;
  }
}

if (typeof window !== "undefined") {
  window.CategoryManager = CategoryManager;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = { CategoryManager, DEFAULT_CATEGORY_GROUPS, DEFAULT_CATEGORIES };
}
