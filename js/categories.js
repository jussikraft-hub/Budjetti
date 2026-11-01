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
    budgetMonthly: 0,
    quickAction: false,
    quickAmount: 0
  },
  {
    id: "apteekki",
    name: "Terveys & Apteekki",
    groupId: "arki",
    color: "#5C6A51",
    budgetMonthly: 0,
    quickAction: false,
    quickAmount: 0
  },
  {
    id: "lapset",
    name: "Lapset & Perhe",
    groupId: "arki",
    color: "#5C6A51",
    budgetMonthly: 0,
    quickAction: false,
    quickAmount: 0
  },

  // Kiinteät kulut & Asuminen
  {
    id: "asuminen",
    name: "Vuokra / Vastike & Sähkö",
    groupId: "laskut",
    color: "#683F26",
    budgetMonthly: 0,
    quickAction: false,
    quickAmount: 0
  },
  {
    id: "puhelin_netti",
    name: "Puhelin & Verkkoyhteydet",
    groupId: "laskut",
    color: "#683F26",
    budgetMonthly: 0,
    quickAction: false,
    quickAmount: 0
  },

  // Ravintolat & Vapaa-aika
  {
    id: "lounas",
    name: "Lounaat & Kahvilat",
    groupId: "vapaaaika",
    color: "#683F26",
    budgetMonthly: 0,
    quickAction: false,
    quickAmount: 0
  },
  {
    id: "viihde",
    name: "Kulttuuri & Harrastukset",
    groupId: "vapaaaika",
    color: "#A6243C",
    budgetMonthly: 0,
    quickAction: false,
    quickAmount: 0
  },

  // Liikkuminen
  {
    id: "liikenne",
    name: "Joukkoliikenne & Taksi",
    groupId: "liikenne",
    color: "#A5A088",
    budgetMonthly: 0,
    quickAction: false,
    quickAmount: 0
  },

  // Tulot
  {
    id: "palkka",
    name: "Palkkatulot",
    groupId: "tulot",
    color: "#5C6A51",
    budgetMonthly: 0,
    type: "income",
    quickAction: false,
    quickAmount: 0
  },
  {
    id: "muu_tulo",
    name: "Muut tulot & Palautukset",
    groupId: "tulot",
    color: "#5C6A51",
    budgetMonthly: 0,
    type: "income",
    quickAction: false,
    quickAmount: 0
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
      // Puhdistetaan vanhat mallisummat automaattisesti tyhjään perustilaan (0 €)
      const hasOldMockAmounts = saved.categories.some(c => c.budgetMonthly === 500 || c.budgetMonthly === 2043.97 || c.budgetMonthly === 850);
      if (hasOldMockAmounts) {
        saved.categories.forEach(c => {
          c.budgetMonthly = 0;
          c.quickAction = false;
          c.quickAmount = 0;
        });
        await this.storage.setSetting("categories", saved);
      }
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
      const merged = { ...this.categories[idx], ...updates };
      if (updates.budgetMonthly !== undefined) {
        merged.budgetMonthly = parseFloat(updates.budgetMonthly) || 0;
      }
      if (updates.quickAmount !== undefined) {
        merged.quickAmount = parseFloat(updates.quickAmount) || 0;
      }
      if (updates.quickAction !== undefined) {
        merged.quickAction = !!updates.quickAction;
      }
      this.categories[idx] = merged;
      await this.save();
      return this.categories[idx];
    }
    return null;
  }

  async resetToDefaults() {
    this.groups = JSON.parse(JSON.stringify(DEFAULT_CATEGORY_GROUPS));
    this.categories = JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));
    await this.save();
    return this.categories;
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
