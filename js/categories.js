/**
 * Budjetti Web App - Category Management Layer
 * 2-tasoinen hierarkia (Pääryhmät ja muokattavat alikategoriat kuukausikatolla)
 */

const LEGACY_COLOR_MAP = {
  "#5C6A51": "#2563EB",
  "#5c6a51": "#2563EB",
  "#683F26": "#6366F1",
  "#683f26": "#6366F1",
  "#A6243C": "#F59E0B",
  "#a6243c": "#F59E0B",
  "#A5A088": "#0EA5E9",
  "#a5a088": "#0EA5E9",
  "#BFB99E": "#2563EB",
  "#bfb99e": "#2563EB"
};

const DEFAULT_CATEGORY_GROUPS = [
  { id: "arki", name: "Päivittäistalous & Arki", color: "#2563EB" },
  { id: "laskut", name: "Kiinteät kulut & Asuminen", color: "#6366F1" },
  { id: "vapaaaika", name: "Ravintolat & Vapaa-aika", color: "#F59E0B" },
  { id: "liikenne", name: "Liikkuminen & Matkat", color: "#0EA5E9" },
  { id: "tulot", name: "Tulot & Saamiset", color: "#10B981" }
];

const DEFAULT_CATEGORIES = [
  // Päivittäistalous & Arki
  {
    id: "ruokakauppa",
    name: "Ruokakauppa & Tarvikkeet",
    groupId: "arki",
    color: "#2563EB",
    budgetMonthly: 0,
    quickAction: false,
    quickAmount: 0
  },
  {
    id: "apteekki",
    name: "Terveys & Apteekki",
    groupId: "arki",
    color: "#2563EB",
    budgetMonthly: 0,
    quickAction: false,
    quickAmount: 0
  },
  {
    id: "lapset",
    name: "Lapset & Perhe",
    groupId: "arki",
    color: "#2563EB",
    budgetMonthly: 0,
    quickAction: false,
    quickAmount: 0
  },

  // Kiinteät kulut & Asuminen
  {
    id: "asuminen",
    name: "Vuokra / Vastike & Sähkö",
    groupId: "laskut",
    color: "#6366F1",
    budgetMonthly: 0,
    quickAction: false,
    quickAmount: 0
  },
  {
    id: "puhelin_netti",
    name: "Puhelin & Verkkoyhteydet",
    groupId: "laskut",
    color: "#6366F1",
    budgetMonthly: 0,
    quickAction: false,
    quickAmount: 0
  },

  // Ravintolat & Vapaa-aika
  {
    id: "lounas",
    name: "Lounaat & Kahvilat",
    groupId: "vapaaaika",
    color: "#F59E0B",
    budgetMonthly: 0,
    quickAction: false,
    quickAmount: 0
  },
  {
    id: "viihde",
    name: "Kulttuuri & Harrastukset",
    groupId: "vapaaaika",
    color: "#EC4899",
    budgetMonthly: 0,
    quickAction: false,
    quickAmount: 0
  },

  // Liikkuminen
  {
    id: "liikenne",
    name: "Joukkoliikenne & Taksi",
    groupId: "liikenne",
    color: "#0EA5E9",
    budgetMonthly: 0,
    quickAction: false,
    quickAmount: 0
  },

  // Tulot
  {
    id: "palkka",
    name: "Palkkatulot",
    groupId: "tulot",
    color: "#10B981",
    budgetMonthly: 0,
    type: "income",
    quickAction: false,
    quickAmount: 0
  },
  {
    id: "muu_tulo",
    name: "Muut tulot & Palautukset",
    groupId: "tulot",
    color: "#10B981",
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
      this.categories = saved.categories;
      this.groups = saved.groups || [...DEFAULT_CATEGORY_GROUPS];

      // Päivitetään vanhat murretut värit automaattisesti raikkaaseen Copilot-palettiin
      let migrated = false;
      this.groups.forEach(g => {
        if (g.id === "tulot" && (g.color === "#5C6A51" || g.color === "#2563EB")) {
          g.color = "#10B981";
          migrated = true;
        } else if (LEGACY_COLOR_MAP[g.color]) {
          g.color = LEGACY_COLOR_MAP[g.color];
          migrated = true;
        }
      });
      this.categories.forEach(c => {
        if (c.type === "income" && (c.color === "#5C6A51" || c.color === "#2563EB")) {
          c.color = "#10B981";
          migrated = true;
        } else if (LEGACY_COLOR_MAP[c.color]) {
          c.color = LEGACY_COLOR_MAP[c.color];
          migrated = true;
        }
      });
      if (migrated) {
        await this.save();
      }
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
      color: "#64748B",
      budgetMonthly: 0
    };
  }

  getQuickActions() {
    return this.categories.filter(c => c.quickAction);
  }

  getByGroup(groupId) {
    return this.categories.filter(c => c.groupId === groupId);
  }

  getGroupById(id) {
    return this.groups.find(g => g.id === id) || null;
  }

  async addGroup(grp) {
    const newGroup = {
      id: grp.id || "grp_" + Date.now(),
      name: (grp.name || "Uusi pääryhmä").trim(),
      color: grp.color || "#2563EB"
    };
    this.groups.push(newGroup);
    await this.save();
    return newGroup;
  }

  async updateGroup(id, updates) {
    const idx = this.groups.findIndex(g => g.id === id);
    if (idx !== -1) {
      if (updates.name !== undefined) {
        this.groups[idx].name = updates.name.trim();
      }
      if (updates.color !== undefined) {
        this.groups[idx].color = updates.color;
      }
      await this.save();
      return this.groups[idx];
    }
    return null;
  }

  async deleteGroup(id) {
    const fallbackGroup = this.groups.find(g => g.id !== id)?.id || "arki";
    this.categories.forEach(c => {
      if (c.groupId === id) {
        c.groupId = fallbackGroup;
      }
    });
    this.groups = this.groups.filter(g => g.id !== id);
    await this.save();
    return true;
  }

  async addCategory(cat) {
    const grp = this.getGroupById(cat.groupId || "arki");
    const newCat = {
      id: cat.id || "cat_" + Date.now(),
      name: cat.name.trim(),
      groupId: cat.groupId || "arki",
      color: cat.color || (grp && grp.color) || "#2563EB",
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
