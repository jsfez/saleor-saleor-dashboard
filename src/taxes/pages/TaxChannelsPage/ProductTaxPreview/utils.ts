import {
  type CountryCode,
  TaxCalculationStrategy,
  type TaxCountryConfigurationFragment,
} from "@dashboard/graphql";

import { getTaxCalculationStrategy, type TaxConfigurationFormData } from "../helpers";

interface EffectiveTaxSettings {
  chargeTaxes: boolean;
  displayGrossPrices: boolean;
  taxCalculationStrategy: string;
  source: "channel" | "country";
}

interface GetEffectiveTaxSettingsArgs {
  countryCode: CountryCode | undefined;
  values: TaxConfigurationFormData;
}

export const getEffectiveTaxSettings = ({
  countryCode,
  values,
}: GetEffectiveTaxSettingsArgs): EffectiveTaxSettings => {
  const countryException = values.updateCountriesConfiguration.find(
    config => config.country.code === countryCode,
  );

  if (countryException) {
    return {
      chargeTaxes: countryException.chargeTaxes,
      displayGrossPrices: countryException.displayGrossPrices,
      taxCalculationStrategy: countryException.taxCalculationStrategy,
      source: "country",
    };
  }

  return {
    chargeTaxes: values.chargeTaxes,
    displayGrossPrices: values.displayGrossPrices,
    taxCalculationStrategy: values.taxCalculationStrategy,
    source: "channel",
  };
};

interface GetFlatRateArgs {
  countryCode: CountryCode | undefined;
  taxClassId: string | undefined;
  taxCountryConfigurations: TaxCountryConfigurationFragment[] | undefined;
}

interface FlatRate {
  rate: number;
  source: "country-default" | "tax-class";
  taxClassName: string | undefined;
}

export const getFlatRate = ({
  countryCode,
  taxClassId,
  taxCountryConfigurations,
}: GetFlatRateArgs): FlatRate => {
  const countryConfiguration = taxCountryConfigurations?.find(
    configuration => configuration.country.code === countryCode,
  );
  const productTaxClassRate = taxClassId
    ? countryConfiguration?.taxClassCountryRates.find(rate => rate.taxClass?.id === taxClassId)
    : undefined;
  const countryDefaultRate = countryConfiguration?.taxClassCountryRates.find(
    rate => rate.taxClass === null,
  );
  const selectedRate = productTaxClassRate ?? countryDefaultRate;

  return {
    rate: selectedRate?.rate ?? 0,
    source: productTaxClassRate ? ("tax-class" as const) : ("country-default" as const),
    taxClassName: productTaxClassRate?.taxClass?.name,
  };
};

interface TaxPreviewCalculation {
  net: number;
  gross: number;
  tax: number;
  storefrontPrice: number;
}

interface CalculateTaxPreviewArgs {
  chargeTaxes: boolean;
  displayGrossPrices: boolean;
  price: number;
  pricesEnteredWithTax: boolean;
  rate: number;
}

const roundMoney = (value: number): number => Math.round(value * 100) / 100;

export const calculateTaxPreview = ({
  chargeTaxes,
  displayGrossPrices,
  price,
  pricesEnteredWithTax,
  rate,
}: CalculateTaxPreviewArgs): TaxPreviewCalculation => {
  if (!chargeTaxes || rate <= 0) {
    return {
      net: roundMoney(price),
      gross: roundMoney(price),
      tax: 0,
      storefrontPrice: roundMoney(price),
    };
  }

  const multiplier = 1 + rate / 100;
  const gross = pricesEnteredWithTax ? price : price * multiplier;
  const net = pricesEnteredWithTax ? price / multiplier : price;
  const tax = gross - net;
  const storefrontPrice = displayGrossPrices ? gross : net;

  return {
    net: roundMoney(net),
    gross: roundMoney(gross),
    tax: roundMoney(tax),
    storefrontPrice: roundMoney(storefrontPrice),
  };
};

export const isAppTaxStrategy = (taxCalculationStrategy: string): boolean =>
  getTaxCalculationStrategy(taxCalculationStrategy) === TaxCalculationStrategy.TAX_APP;
