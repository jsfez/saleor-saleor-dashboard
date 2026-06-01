import {
  type CountryCode,
  TaxCalculationStrategy,
  type TaxCountryConfigurationFragment,
} from "@dashboard/graphql";

import { type TaxConfigurationFormData } from "../helpers";
import { calculateTaxPreview, getEffectiveTaxSettings, getFlatRate } from "./utils";

const baseFormData: TaxConfigurationFormData = {
  chargeTaxes: true,
  displayGrossPrices: true,
  pricesEnteredWithTax: false,
  removeCountriesConfiguration: [],
  taxCalculationStrategy: TaxCalculationStrategy.FLAT_RATES,
  updateCountriesConfiguration: [],
};

describe("ProductTaxPreview utils", () => {
  it("uses country exception tax settings when selected country has an override", () => {
    // Arrange
    const formData: TaxConfigurationFormData = {
      ...baseFormData,
      updateCountriesConfiguration: [
        {
          __typename: "TaxConfigurationPerCountry",
          chargeTaxes: false,
          country: {
            __typename: "CountryDisplay",
            code: "PL",
            country: "Poland",
          },
          displayGrossPrices: false,
          taxAppId: "app-id",
          taxCalculationStrategy: "app-id",
        },
      ],
    };

    // Act
    const result = getEffectiveTaxSettings({ countryCode: "PL" as CountryCode, values: formData });

    // Assert
    expect(result).toEqual({
      chargeTaxes: false,
      displayGrossPrices: false,
      source: "country",
      taxCalculationStrategy: "app-id",
    });
  });

  it("falls back from missing tax class rate to country default rate", () => {
    // Arrange
    const taxCountryConfigurations: TaxCountryConfigurationFragment[] = [
      {
        __typename: "TaxCountryConfiguration",
        country: {
          __typename: "CountryDisplay",
          code: "US",
          country: "United States of America",
        },
        taxClassCountryRates: [
          {
            __typename: "TaxClassCountryRate",
            rate: 8,
            taxClass: null,
          },
          {
            __typename: "TaxClassCountryRate",
            rate: 12,
            taxClass: {
              __typename: "TaxClass",
              id: "tax-class-1",
              name: "Standard",
            },
          },
        ],
      },
    ];

    // Act
    const result = getFlatRate({
      countryCode: "US" as CountryCode,
      taxClassId: "tax-class-2",
      taxCountryConfigurations,
    });

    // Assert
    expect(result).toEqual({
      rate: 8,
      source: "country-default",
      taxClassName: undefined,
    });
  });

  it("uses country default rate when product has no tax class", () => {
    // Arrange
    const taxCountryConfigurations: TaxCountryConfigurationFragment[] = [
      {
        __typename: "TaxCountryConfiguration",
        country: {
          __typename: "CountryDisplay",
          code: "US",
          country: "United States of America",
        },
        taxClassCountryRates: [
          {
            __typename: "TaxClassCountryRate",
            rate: 8,
            taxClass: null,
          },
        ],
      },
    ];

    // Act
    const result = getFlatRate({
      countryCode: "US" as CountryCode,
      taxClassId: undefined,
      taxCountryConfigurations,
    });

    // Assert
    expect(result).toEqual({
      rate: 8,
      source: "country-default",
      taxClassName: undefined,
    });
  });

  it("calculates net from a gross entered product price", () => {
    // Arrange
    const price = 120;

    // Act
    const result = calculateTaxPreview({
      chargeTaxes: true,
      displayGrossPrices: false,
      price,
      pricesEnteredWithTax: true,
      rate: 20,
    });

    // Assert
    expect(result).toEqual({
      gross: 120,
      net: 100,
      storefrontPrice: 100,
      tax: 20,
    });
  });
});
