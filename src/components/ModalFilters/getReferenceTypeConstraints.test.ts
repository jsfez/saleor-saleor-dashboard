import { getReferenceTypeConstraints } from "./getReferenceTypeConstraints";

describe("getReferenceTypeConstraints", () => {
  it("returns undefined when referenceTypes is null/undefined/empty", () => {
    // Arrange / Act / Assert
    expect(getReferenceTypeConstraints(null)).toBeUndefined();
    expect(getReferenceTypeConstraints(undefined)).toBeUndefined();
    expect(getReferenceTypeConstraints([])).toBeUndefined();
  });

  it("builds pageTypes constraint from PageType references (model reference)", () => {
    // Arrange
    const referenceTypes = [{ __typename: "PageType" as const, id: "pt-1", name: "Blog" }];

    // Act
    const result = getReferenceTypeConstraints(referenceTypes);

    // Assert
    expect(result).toEqual({ pageTypes: [{ id: "pt-1", name: "Blog" }] });
  });

  it("builds productTypes constraint from ProductType references", () => {
    // Arrange
    const referenceTypes = [{ __typename: "ProductType" as const, id: "prt-1", name: "Shirt" }];

    // Act
    const result = getReferenceTypeConstraints(referenceTypes);

    // Assert
    expect(result).toEqual({ productTypes: [{ id: "prt-1", name: "Shirt" }] });
  });

  it("builds both constraints when mixed reference types are present", () => {
    // Arrange
    const referenceTypes = [
      { __typename: "ProductType" as const, id: "prt-1", name: "Shirt" },
      { __typename: "PageType" as const, id: "pt-1", name: "Blog" },
    ];

    // Act
    const result = getReferenceTypeConstraints(referenceTypes);

    // Assert
    expect(result).toEqual({
      productTypes: [{ id: "prt-1", name: "Shirt" }],
      pageTypes: [{ id: "pt-1", name: "Blog" }],
    });
  });

  it("ignores entries without id and null entries", () => {
    // Arrange
    const referenceTypes = [
      null,
      { __typename: "PageType" as const, id: "", name: "Empty" },
      { __typename: "PageType" as const, id: "pt-2", name: "Landing" },
    ];

    // Act
    const result = getReferenceTypeConstraints(referenceTypes);

    // Assert
    expect(result).toEqual({ pageTypes: [{ id: "pt-2", name: "Landing" }] });
  });
});
