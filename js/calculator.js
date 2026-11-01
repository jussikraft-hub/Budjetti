/**
 * Budjetti Web App - Financial Calculation & Analytics Engine
 * Safe-to-Spend, päivät seuraavaan palkkapäivään ja kategorialaskenta
 */

class FinanceCalculator {
  /**
   * Laskee montako päivää on jäljellä seuraavaan palkkapäivään / kauden taitepäivään
   * @param {number} paydayDay - esim. 20
   * @param {Date} fromDate - oletuksena nykyhetki
   */
  static getDaysUntilPayday(paydayDay = 20, fromDate = new Date()) {
    const today = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();
    const currentDay = today.getDate();

    let targetDate;
    if (currentDay < paydayDay) {
      // Palkkapäivä on vielä tässä kuussa
      targetDate = new Date(currentYear, currentMonth, paydayDay);
    } else {
      // Palkkapäivä on ensi kuussa
      targetDate = new Date(currentYear, currentMonth + 1, paydayDay);
    }

    const diffMs = targetDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    return Math.max(1, diffDays);
  }

  /**
   * Palauttaa seuraavan palkkapäivän päivämäärämerkkijonon (esim. "20.11.")
   */
  static getNextPaydayStr(paydayDay = 20, fromDate = new Date()) {
    const today = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();
    const currentDay = today.getDate();

    let targetDate;
    if (currentDay < paydayDay) {
      targetDate = new Date(currentYear, currentMonth, paydayDay);
    } else {
      targetDate = new Date(currentYear, currentMonth + 1, paydayDay);
    }

    return `${targetDate.getDate()}.${targetDate.getMonth() + 1}.`;
  }

  /**
   * Palauttaa kuluvan palkkakauden alku- ja loppupäivämäärät YYYY-MM-DD muodossa
   * @param {number} paydayDay - palkkapäivä (esim. 20)
   * @param {Date} fromDate - vertailuhetki
   */
  static getCurrentPeriodRange(paydayDay = 20, fromDate = new Date()) {
    const year = fromDate.getFullYear();
    const month = fromDate.getMonth();
    const day = fromDate.getDate();

    let startD, endD;
    if (day >= paydayDay) {
      startD = new Date(year, month, paydayDay);
      endD = new Date(year, month + 1, paydayDay - 1);
    } else {
      startD = new Date(year, month - 1, paydayDay);
      endD = new Date(year, month, paydayDay - 1);
    }

    const pad = (n) => (n < 10 ? "0" + n : String(n));
    const toDateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    return {
      startStr: toDateStr(startD),
      endStr: toDateStr(endD),
      label: `${startD.getDate()}.${startD.getMonth() + 1}. – ${endD.getDate()}.${endD.getMonth() + 1}.`
    };
  }

  /**
   * Laskee kuukauden tai valitun jakson taloustilastot
   */
  static calculateStats(transactions, categories, filterYear, filterMonth, dateRange = null) {
    let totalIncome = 0;
    let totalExpense = 0;
    const categoryTotals = {};
    const groupTotals = {};

    // Alustetaan kategoriat nollilla
    categories.forEach(c => {
      categoryTotals[c.id] = 0;
      if (!groupTotals[c.groupId]) groupTotals[c.groupId] = 0;
    });

    // Käydään tapahtumat läpi
    transactions.forEach(t => {
      if (dateRange && dateRange.startStr && dateRange.endStr) {
        if (t.date < dateRange.startStr || t.date > dateRange.endStr) return;
      } else {
        const d = new Date(t.date);
        // Jos suodatettu tiettyyn vuoteen ja kuukauteen
        if (filterYear !== undefined && d.getFullYear() !== filterYear) return;
        if (filterMonth !== undefined && d.getMonth() !== filterMonth) return;
      }

      const amt = parseFloat(t.amount) || 0;
      if (t.type === "income") {
        totalIncome += amt;
      } else {
        totalExpense += amt;
        const catId = t.category || "muut";
        categoryTotals[catId] = (categoryTotals[catId] || 0) + amt;

        const catObj = categories.find(c => c.id === catId);
        const grpId = catObj ? catObj.groupId : "arki";
        groupTotals[grpId] = (groupTotals[grpId] || 0) + amt;
      }
    });

    const netCashFlow = totalIncome - totalExpense;

    return {
      totalIncome,
      totalExpense,
      netCashFlow,
      categoryTotals,
      groupTotals
    };
  }

  /**
   * Laskee päiväkohtaisen vapaan allokaation
   * @param {number} freeBalance 
   * @param {number} daysLeft 
   */
  static calculateDailyAllowance(freeBalance, daysLeft) {
    if (!freeBalance || freeBalance <= 0) return 0;
    const days = Math.max(1, daysLeft);
    return Math.round((freeBalance / days) * 100) / 100;
  }

  /**
   * Suomalainen euro-valuutan muotoilu (esim. "642,80 €")
   */
  static formatCurrency(amount) {
    const num = typeof amount === "number" ? amount : parseFloat(amount) || 0;
    return num.toLocaleString("fi-FI", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }) + " €";
  }

  /**
   * Suomalainen päivämäärämuotoilu (esim. "1.11.2026")
   */
  static formatDateFi(dateStr) {
    if (!dateStr) return "";
    const [year, month, day] = dateStr.split("-");
    if (!year || !month || !day) return dateStr;
    return `${parseInt(day, 10)}.${parseInt(month, 10)}.${year}`;
  }
}

if (typeof window !== "undefined") {
  window.FinanceCalculator = FinanceCalculator;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = { FinanceCalculator };
}
