import {
  type CountryCode,
  TaxCalculationStrategy,
  type TaxConfigurationFragment,
  type TaxConfigurationPerCountryFragment,
} from "@dashboard/graphql";

export type TaxCountryConfiguration = Omit<
  TaxConfigurationPerCountryFragment,
  "taxCalculationStrategy"
> & {
  taxCalculationStrategy: string;
};

export interface TaxConfigurationFormData {
  chargeTaxes: boolean;
  taxCalculationStrategy: string;
  displayGrossPrices: boolean;
  pricesEnteredWithTax: boolean;
  updateCountriesConfiguration: TaxCountryConfiguration[];
  removeCountriesConfiguration: CountryCode[];
}

const isStrategyFlatRates = (strategy: string | null) =>
  strategy === TaxCalculationStrategy.FLAT_RATES;

export const getTaxCalculationStrategy = (taxCalculationStrategy: string) =>
  isStrategyFlatRates(taxCalculationStrategy)
    ? TaxCalculationStrategy.FLAT_RATES
    : TaxCalculationStrategy.TAX_APP;

export const getTaxAppId = (taxCalculationStrategy: string) =>
  isStrategyFlatRates(taxCalculationStrategy) ? null : taxCalculationStrategy;

export const getSelectedTaxStrategy = (
  currentTaxConfiguration: TaxConfigurationFragment | TaxConfigurationPerCountryFragment,
) =>
  isStrategyFlatRates(currentTaxConfiguration?.taxCalculationStrategy)
    ? TaxCalculationStrategy.FLAT_RATES
    : (currentTaxConfiguration?.taxAppId ?? "legacy-flow");
