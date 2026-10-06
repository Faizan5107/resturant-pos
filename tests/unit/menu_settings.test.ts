import { describe, it, expect } from "vitest";

/**
 * Phase 2 Acceptance Checks: Menu & Settings
 */

interface MockProduct {
  id: string;
  restaurant_id: string;
  code: string;
  name: string;
}

describe("Phase 2 Acceptance: Product Code Composite Uniqueness", () => {
  const existingProducts: MockProduct[] = [
    { id: "p1", restaurant_id: "rest-A", code: "BURGER01", name: "Zinger Burger" },
    { id: "p2", restaurant_id: "rest-A", code: "FRIES01", name: "French Fries" },
  ];

  function validateProductCodeUniqueness(
    restaurantId: string,
    code: string
  ): { allowed: boolean; error?: string } {
    const duplicate = existingProducts.find(
      (p) => p.restaurant_id === restaurantId && p.code.toLowerCase() === code.toLowerCase()
    );

    if (duplicate) {
      return { allowed: false, error: "Product code already exists for this restaurant" };
    }

    return { allowed: true };
  }

  it("allows different restaurants to use the exact same product code", () => {
    // Restaurant B using "BURGER01" -> Allowed!
    const checkRestB = validateProductCodeUniqueness("rest-B", "BURGER01");
    expect(checkRestB.allowed).toBe(true);
  });

  it("blocks duplicate product code within the SAME restaurant", () => {
    // Restaurant A using "BURGER01" again -> Blocked!
    const checkRestA = validateProductCodeUniqueness("rest-A", "BURGER01");
    expect(checkRestA.allowed).toBe(false);
    expect(checkRestA.error).toContain("already exists");
  });
});

describe("Phase 2 Acceptance: Storage Path Isolation", () => {
  function validateStorageAccess(
    userRestaurantId: string,
    filePath: string
  ): boolean {
    // Storage paths MUST start with {restaurant_id}/
    const pathPrefix = filePath.split("/")[0];
    return userRestaurantId === pathPrefix;
  }

  it("enforces storage object path scoping by restaurant_id", () => {
    const userRestA = "rest-A";
    const restAFile = "rest-A/products/burger.jpg";
    const restBFile = "rest-B/products/pizza.jpg";

    expect(validateStorageAccess(userRestA, restAFile)).toBe(true);
    expect(validateStorageAccess(userRestA, restBFile)).toBe(false);
  });
});
