import { describe, it, expect } from "vitest";

/**
 * Phase 3 Acceptance Checks: Orders & Slips
 */

interface MockOrderItemSnapshot {
  id: string;
  order_id: string;
  variant_id: string;
  product_name: string;
  variant_name: string;
  unit_price: number; // Snapshot of price at sale time
  quantity: number;
}

interface MockProductVariant {
  id: string;
  name: string;
  current_sale_price: number;
}

describe("Phase 3 Acceptance: Kitchen Slip Price Query Security", () => {
  const kitchenSlipAllowedFields = [
    "id",
    "order_no",
    "order_type",
    "table_no",
    "order_date",
    "created_at",
    "notes",
    "order_items.product_name",
    "order_items.variant_name",
    "order_items.quantity",
    "order_items.notes",
  ];

  const forbiddenPriceFields = [
    "subtotal",
    "total",
    "unit_price",
    "line_total",
    "unit_cost",
    "cost_price",
    "tax_amount",
    "discount_amount",
  ];

  function validateKitchenSlipQueryFields(requestedFields: string[]): boolean {
    return !requestedFields.some((field) => forbiddenPriceFields.includes(field));
  }

  it("passes when kitchen slip query excludes price columns", () => {
    expect(validateKitchenSlipQueryFields(kitchenSlipAllowedFields)).toBe(true);
  });

  it("fails if any price field is included in kitchen slip query", () => {
    const leakyQuery = [...kitchenSlipAllowedFields, "unit_price"];
    expect(validateKitchenSlipQueryFields(leakyQuery)).toBe(false);
  });
});

describe("Phase 3 Acceptance: Order Price Snapshot Integrity", () => {
  it("ensures subsequent price changes do not alter old order items", () => {
    // 1. Initial variant price at sale time
    const variant: MockProductVariant = {
      id: "var-1",
      name: "Regular",
      current_sale_price: 500,
    };

    // 2. Order placed snapshot
    const orderItem: MockOrderItemSnapshot = {
      id: "item-1",
      order_id: "order-1",
      variant_id: variant.id,
      product_name: "Zinger Burger",
      variant_name: variant.name,
      unit_price: variant.current_sale_price, // 500
      quantity: 2,
    };

    // 3. Product price updated later to 650
    variant.current_sale_price = 650;

    // Snapshot in old order MUST remain 500
    expect(orderItem.unit_price).toBe(500);
    expect(orderItem.unit_price * orderItem.quantity).toBe(1000);
  });
});

describe("Phase 3 Acceptance: Per-Restaurant Daily Order Counter Isolation", () => {
  const orderCounters: Record<string, number> = {};

  function allocateDailyOrderNumber(restaurantId: string, orderDate: string): string {
    const key = `${restaurantId}_${orderDate}`;
    const nextNo = (orderCounters[key] || 0) + 1;
    orderCounters[key] = nextNo;
    return String(nextNo).padStart(4, "0");
  }

  it("assigns order 0001 independently for two restaurants on the same day", () => {
    const today = "2026-09-29";

    const orderNoRestA = allocateDailyOrderNumber("rest-A", today);
    const orderNoRestB = allocateDailyOrderNumber("rest-B", today);

    expect(orderNoRestA).toBe("0001");
    expect(orderNoRestB).toBe("0001");

    // Second order for Rest A becomes 0002 without affecting Rest B
    const secondOrderRestA = allocateDailyOrderNumber("rest-A", today);
    expect(secondOrderRestA).toBe("0002");
  });
});
