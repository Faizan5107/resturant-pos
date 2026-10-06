import { describe, it, expect } from "vitest";

/**
 * Phase 4 Acceptance Checks: Money Tracking & Profit & Loss
 */

interface MockOrderRow {
  id: string;
  status: "new" | "preparing" | "ready" | "delivered" | "paid" | "cancelled";
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  cost_of_ingredients: number;
}

interface MockExpenseRow {
  id: string;
  amount: number;
}

describe("Phase 4 Acceptance: Sales & PnL Filter Rule (Paid Orders Only)", () => {
  const sampleOrders: MockOrderRow[] = [
    { id: "o1", status: "paid", subtotal: 1000, discount_amount: 100, tax_amount: 130, cost_of_ingredients: 300 },
    { id: "o2", status: "paid", subtotal: 500, discount_amount: 0, tax_amount: 65, cost_of_ingredients: 150 },
    { id: "o3", status: "new", subtotal: 2000, discount_amount: 0, tax_amount: 260, cost_of_ingredients: 600 },
    { id: "o4", status: "cancelled", subtotal: 1500, discount_amount: 0, tax_amount: 195, cost_of_ingredients: 450 },
  ];

  const sampleExpenses: MockExpenseRow[] = [
    { id: "e1", amount: 200 },
    { id: "e2", amount: 50 },
  ];

  function calculateProfitAndLoss(orders: MockOrderRow[], expenses: MockExpenseRow[]) {
    // 1. Only orders with status 'paid' count
    const paidOrders = orders.filter((o) => o.status === "paid");

    const netSales = paidOrders.reduce((sum, o) => sum + (o.subtotal - o.discount_amount), 0);
    const costOfIngredients = paidOrders.reduce((sum, o) => sum + o.cost_of_ingredients, 0);
    const profitBeforeExpenses = netSales - costOfIngredients;
    const operatingExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
    const profitAfterAllCosts = profitBeforeExpenses - operatingExpenses;

    return {
      netSales,
      costOfIngredients,
      profitBeforeExpenses,
      operatingExpenses,
      profitAfterAllCosts,
      paidCount: paidOrders.length,
    };
  }

  it("strictly includes ONLY paid orders and excludes open or cancelled orders", () => {
    const pnl = calculateProfitAndLoss(sampleOrders, sampleExpenses);

    expect(pnl.paidCount).toBe(2);
    // Net sales = (1000-100) + (500-0) = 1400
    expect(pnl.netSales).toBe(1400);
    // Cost of ingredients = 300 + 150 = 450
    expect(pnl.costOfIngredients).toBe(450);
  });

  it("matches exact hand calculation for Profit & Loss formula", () => {
    const pnl = calculateProfitAndLoss(sampleOrders, sampleExpenses);

    // Net sales = 1400
    // Cost of ingredients = 450
    // Profit before expenses = 1400 - 450 = 950
    expect(pnl.profitBeforeExpenses).toBe(950);

    // Operating expenses = 200 + 50 = 250
    expect(pnl.operatingExpenses).toBe(250);

    // Profit after all costs = 950 - 250 = 700
    expect(pnl.profitAfterAllCosts).toBe(700);
  });
});
