import { DashboardCard } from "@dashboard/components/Card";
import Money from "@dashboard/components/Money";
import PriceField from "@dashboard/components/PriceField";
import { DEFAULT_INITIAL_SEARCH_DATA } from "@dashboard/config";
import {
  type CountryCode,
  type CountryFragment,
  type MoneyFragment,
  type SearchProductsQuery,
  type TaxConfigurationFragment,
  useProductDetailsQuery,
  useTaxCountriesListQuery,
} from "@dashboard/graphql";
import useProductSearch from "@dashboard/searches/useProductSearch";
import { mapEdgesToItems } from "@dashboard/utils/maps";
import {
  Accordion,
  Box,
  DynamicCombobox,
  Input,
  type Option,
  Skeleton,
  Text,
} from "@saleor/macaw-ui-next";
import { type ReactNode, useMemo, useState } from "react";
import { defineMessages, useIntl } from "react-intl";

import { type TaxConfigurationFormData } from "../helpers";
import styles from "./ProductTaxPreview.module.css";
import {
  calculateTaxPreview,
  getEffectiveTaxSettings,
  getFlatRate,
  isAppTaxStrategy,
} from "./utils";

const messages = defineMessages({
  title: {
    id: "l/ny6E",
    defaultMessage: "Product tax preview",
    description: "tax preview card title",
  },
  subtitle: {
    id: "MFJZZR",
    defaultMessage: "Preview how channel and country tax settings affect a product variant.",
    description: "tax preview card subtitle",
  },
  product: {
    id: "hu4E30",
    defaultMessage: "Product",
    description: "tax preview product selector label",
  },
  variant: {
    id: "sfmKC1",
    defaultMessage: "Variant",
    description: "tax preview variant selector label",
  },
  country: {
    id: "y9gbe5",
    defaultMessage: "Purchase country",
    description: "tax preview country selector label",
  },
  priceOverride: {
    id: "pzssSl",
    defaultMessage: "Price",
    description: "tax preview price field label",
  },
  appRate: {
    id: "bE3xgu",
    defaultMessage: "Assumed app rate",
    description: "tax preview app stub rate field label",
  },
  appStubNotice: {
    id: "uKy/82",
    defaultMessage:
      "Tax app is not called. This preview uses a stubbed {rate}% app response for calculation.",
    description: "tax app stub notice",
  },
  noProducts: {
    id: "ajEopg",
    defaultMessage: "No products with a priced variant were found for this channel.",
    description: "tax preview empty products message",
  },
  noChannel: {
    id: "47E3KR",
    defaultMessage: "Select a tax channel to preview product taxes.",
    description: "tax preview missing channel message",
  },
  taxClass: {
    id: "zShjJM",
    defaultMessage: "Tax class",
    description: "tax preview tax class label",
  },
  noTaxClass: {
    id: "uBgj4Y",
    defaultMessage: "No product tax class",
    description: "tax preview no tax class value",
  },
  rate: {
    id: "PcPuwW",
    defaultMessage: "Rate",
    description: "tax preview tax rate label",
  },
  net: {
    id: "MGN47G",
    defaultMessage: "Net",
    description: "tax preview net price label",
  },
  tax: {
    id: "Az6sOC",
    defaultMessage: "Tax",
    description: "tax preview tax amount label",
  },
  gross: {
    id: "/B3Ap7",
    defaultMessage: "Gross",
    description: "tax preview gross price label",
  },
  storefront: {
    id: "MSEoHc",
    defaultMessage: "Storefront",
    description: "tax preview storefront price label",
  },
  countryException: {
    id: "qxrGrN",
    defaultMessage: "Country exception",
    description: "tax preview country exception source",
  },
  channelDefaults: {
    id: "NcyOgB",
    defaultMessage: "Channel defaults",
    description: "tax preview channel defaults source",
  },
  priceEnteredGross: {
    id: "7E5N02",
    defaultMessage: "Price entered with tax",
    description: "tax preview gross input context",
  },
  priceEnteredNet: {
    id: "vWVSTJ",
    defaultMessage: "Price entered without tax",
    description: "tax preview net input context",
  },
  controlsSection: {
    id: "yd1V3G",
    defaultMessage: "Product Overview",
    description: "tax preview controls section label",
  },
  calculationSection: {
    id: "vfucYP",
    defaultMessage: "Tax Overview",
    description: "tax preview calculation section label",
  },
  calculationCta: {
    id: "W1tLAR",
    defaultMessage: "See how your taxes calculate",
    description: "tax preview calculation accordion trigger",
  },
  calculationCtaDescription: {
    id: "U7iwsw",
    defaultMessage: "Open the product and tax overview for the current channel.",
    description: "tax preview calculation accordion trigger description",
  },
  configurationSource: {
    id: "1HX3rZ",
    defaultMessage: "Configuration source",
    description: "tax preview configuration source label",
  },
  priceMode: {
    id: "EFsMl1",
    defaultMessage: "Price mode",
    description: "tax preview price mode label",
  },
  basedOn: {
    id: "A/AFx4",
    defaultMessage: "Based on",
    description: "tax preview story source step title",
  },
  sourceStory: {
    id: "7HJazX",
    defaultMessage:
      "Saleor uses {source} for orders shipped to {country}. This decides whether taxes are charged and how prices are displayed.",
    description: "tax preview story source step description",
  },
  productTaxClassStoryTitle: {
    id: "Jk04Tv",
    defaultMessage: "Product tax class",
    description: "tax preview story tax class step title",
  },
  productTaxClassStory: {
    id: "i/ElwG",
    defaultMessage:
      "The selected product resolves to {taxClass}. Saleor uses it to look for a matching flat-rate rule for the purchase country.",
    description: "tax preview story tax class step description",
  },
  rateStoryTitle: {
    id: "UcX1iR",
    defaultMessage: "Applied rate",
    description: "tax preview story rate step title",
  },
  flatRateStory: {
    id: "Ka/f5l",
    defaultMessage:
      "A {rate}% flat rate is applied to the preview price. {rateSource} provides the rate.",
    description: "tax preview story flat rate step description",
  },
  appRateStory: {
    id: "hpRAU1",
    defaultMessage:
      "Because this channel uses app taxes, the tax app is not called. This preview uses a stubbed {rate}% app response.",
    description: "tax preview story app rate step description",
  },
  priceModeStoryTitle: {
    id: "JRlLbn",
    defaultMessage: "Price treatment",
    description: "tax preview story price mode step title",
  },
  priceModeStory: {
    id: "NEMrmj",
    defaultMessage:
      "Saleor treats the preview price as {priceMode}, then calculates net, tax, and gross values from it.",
    description: "tax preview story price mode step description",
  },
  taxWillBeTitle: {
    id: "qOSQFP",
    defaultMessage: "Tax will be calculated as",
    description: "tax preview story money step title",
  },
  taxWillBeStory: {
    id: "1yA2Fz",
    defaultMessage: "These are the line values Saleor derives from the preview price.",
    description: "tax preview story money step description",
  },
  storefrontRenderGross: {
    id: "tUVHhE",
    defaultMessage: "Storefront will render gross",
    description: "tax preview storefront gross label",
  },
  storefrontRenderNet: {
    id: "S4QNA4",
    defaultMessage: "Storefront will render net",
    description: "tax preview storefront net label",
  },
  countryDefaultRate: {
    id: "gX6Vcm",
    defaultMessage: "Country default rate",
    description: "tax preview country default flat rate source",
  },
  taxClassRate: {
    id: "hKQC/q",
    defaultMessage: "Tax class rate",
    description: "tax preview product tax class flat rate source",
  },
});

type SearchProduct = NonNullable<
  NonNullable<SearchProductsQuery["search"]>["edges"][number]
>["node"];
type SearchVariant = NonNullable<SearchProduct["variants"]>[number];

interface ProductTaxPreviewProps {
  allCountries: CountryFragment[] | undefined;
  disabled: boolean;
  taxConfiguration: TaxConfigurationFragment | undefined;
  values: TaxConfigurationFormData;
}

const getVariantPrice = (
  variant: SearchVariant | undefined,
  channelId: string | undefined,
): MoneyFragment | null =>
  variant?.channelListings?.find(listing => listing.channel.id === channelId)?.price ?? null;

const getPricedVariants = (
  product: SearchProduct | null,
  channelId: string | undefined,
): SearchVariant[] =>
  product?.variants?.filter(variant => getVariantPrice(variant, channelId) !== null) ?? [];

const getVariantName = (variant: SearchVariant, product: SearchProduct | null): string =>
  variant.name || variant.sku || product?.name || "";

const parsePreviewNumber = (value: string, fallback: number): number => {
  if (value.trim() === "") {
    return fallback;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : fallback;
};

export const ProductTaxPreview = ({
  allCountries,
  disabled,
  taxConfiguration,
  values,
}: ProductTaxPreviewProps): JSX.Element => {
  const intl = useIntl();
  const channelId = taxConfiguration?.channel.id;
  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedVariantId, setSelectedVariantId] = useState("");
  const [selectedCountryCode, setSelectedCountryCode] = useState<CountryCode | "">("");
  const [priceOverride, setPriceOverride] = useState<{ value: string; variantId: string } | null>(
    null,
  );
  const [appRate, setAppRate] = useState("10");
  const {
    loadMore,
    search,
    result: productSearch,
  } = useProductSearch({ variables: DEFAULT_INITIAL_SEARCH_DATA });
  const { data: taxCountriesData } = useTaxCountriesListQuery({});
  const products = useMemo(
    () => mapEdgesToItems(productSearch.data?.search) ?? [],
    [productSearch.data?.search],
  );
  const productsWithChannelPrice = useMemo(
    () => products.filter(product => getPricedVariants(product, channelId).length > 0),
    [channelId, products],
  );
  const selectedProduct =
    productsWithChannelPrice.find(product => product.id === selectedProductId) ??
    productsWithChannelPrice[0] ??
    null;
  const { data: selectedProductDetails } = useProductDetailsQuery({
    skip: !selectedProduct,
    variables: {
      firstValues: 10,
      id: selectedProduct?.id ?? "",
    },
  });
  const selectedProductTaxClass =
    selectedProductDetails?.product?.id === selectedProduct?.id
      ? selectedProductDetails.product.taxClass
      : null;
  const productOptions: Option[] = productsWithChannelPrice.map(product => ({
    label: product.name,
    value: product.id,
  }));
  const selectedProductOption: Option | null = selectedProduct
    ? {
        label: selectedProduct.name,
        value: selectedProduct.id,
      }
    : null;
  const countryOptions: Option[] =
    allCountries?.map(country => ({
      label: country.country,
      value: country.code,
    })) ?? [];
  const countryCode = selectedCountryCode || ((countryOptions[0]?.value as CountryCode) ?? "");
  const selectedCountryOption =
    countryOptions.find(country => country.value === countryCode) ?? null;
  const pricedVariants = useMemo(
    () => getPricedVariants(selectedProduct, channelId),
    [channelId, selectedProduct],
  );
  const variantOptions: Option[] = pricedVariants.map(variant => ({
    label: getVariantName(variant, selectedProduct),
    value: variant.id,
  }));
  const selectedVariant =
    pricedVariants.find(variant => variant.id === selectedVariantId) ?? pricedVariants[0];
  const selectedVariantOption =
    variantOptions.find(variant => variant.value === selectedVariant?.id) ?? null;
  const productPrice = getVariantPrice(selectedVariant, channelId);
  const price =
    priceOverride && priceOverride.variantId === selectedVariant?.id
      ? priceOverride.value
      : (productPrice?.amount.toString() ?? "");
  const previewPrice = parsePreviewNumber(price, productPrice?.amount ?? 0);
  const effectiveTaxSettings = getEffectiveTaxSettings({
    countryCode: countryCode || undefined,
    values,
  });
  const isTaxAppPreview =
    effectiveTaxSettings.chargeTaxes &&
    isAppTaxStrategy(effectiveTaxSettings.taxCalculationStrategy);
  const flatRate = getFlatRate({
    countryCode: countryCode || undefined,
    taxClassId: selectedProductTaxClass?.id,
    taxCountryConfigurations: taxCountriesData?.taxCountryConfigurations ?? undefined,
  });
  const taxRate = isTaxAppPreview
    ? parsePreviewNumber(appRate, 10)
    : effectiveTaxSettings.chargeTaxes
      ? flatRate.rate
      : 0;
  const calculation = calculateTaxPreview({
    chargeTaxes: effectiveTaxSettings.chargeTaxes,
    displayGrossPrices: effectiveTaxSettings.displayGrossPrices,
    price: previewPrice,
    pricesEnteredWithTax: values.pricesEnteredWithTax,
    rate: taxRate,
  });
  const currency = productPrice?.currency ?? "";
  const configurationSourceLabel =
    effectiveTaxSettings.source === "country"
      ? intl.formatMessage(messages.countryException)
      : intl.formatMessage(messages.channelDefaults);
  const taxClassLabel = selectedProductTaxClass?.name ?? intl.formatMessage(messages.noTaxClass);
  const priceModeLabel = values.pricesEnteredWithTax
    ? intl.formatMessage(messages.priceEnteredGross)
    : intl.formatMessage(messages.priceEnteredNet);
  const flatRateSourceLabel =
    flatRate.source === "tax-class"
      ? intl.formatMessage(messages.taxClassRate)
      : intl.formatMessage(messages.countryDefaultRate);
  const storefrontDisplayLabel = effectiveTaxSettings.displayGrossPrices
    ? intl.formatMessage(messages.storefrontRenderGross)
    : intl.formatMessage(messages.storefrontRenderNet);
  const accordionCta = intl.formatMessage(messages.calculationCta);
  const accordionDescription = intl.formatMessage(messages.calculationCtaDescription);

  if (!taxConfiguration) {
    return (
      <ProductTaxPreviewAccordion cta={accordionCta} description={accordionDescription}>
        <Skeleton height={4} />
      </ProductTaxPreviewAccordion>
    );
  }

  if (!channelId) {
    return (
      <ProductTaxPreviewAccordion cta={accordionCta} description={accordionDescription}>
        <Box display="flex" flexDirection="column" gap={1}>
          <DashboardCard.Title>{intl.formatMessage(messages.title)}</DashboardCard.Title>
          <Text size={2} color="default2">
            {intl.formatMessage(messages.subtitle)}
          </Text>
        </Box>
        <Text size={2}>{intl.formatMessage(messages.noChannel)}</Text>
      </ProductTaxPreviewAccordion>
    );
  }

  return (
    <ProductTaxPreviewAccordion cta={accordionCta} description={accordionDescription}>
      <Box display="flex" flexDirection="column" gap={1}>
        <DashboardCard.Title>{intl.formatMessage(messages.title)}</DashboardCard.Title>
        <Text size={2} color="default2">
          {intl.formatMessage(messages.subtitle)}
        </Text>
      </Box>

      <section className={styles.section}>
        <Text size={1} color="default2" className={styles.sectionLabel}>
          {intl.formatMessage(messages.controlsSection)}
        </Text>
        <div className={styles.controls}>
          <div className={styles.fullWidth}>
            <DynamicCombobox
              data-test-id="tax-preview-product-selector"
              disabled={disabled}
              label={intl.formatMessage(messages.product)}
              loading={productSearch.loading}
              name="tax-preview-product"
              onChange={option => {
                setSelectedProductId(option?.value ?? "");
                setSelectedVariantId("");
                setPriceOverride(null);
              }}
              onInputValueChange={search}
              onScrollEnd={() => {
                if (productSearch.data?.search?.pageInfo.hasNextPage) {
                  loadMore();
                }
              }}
              options={productOptions}
              value={selectedProductOption}
            />
          </div>
          <DynamicCombobox
            data-test-id="tax-preview-variant-selector"
            disabled={disabled || !selectedProduct}
            label={intl.formatMessage(messages.variant)}
            name="tax-preview-variant"
            onChange={option => {
              setSelectedVariantId(option?.value ?? "");
              setPriceOverride(null);
            }}
            options={variantOptions}
            value={selectedVariantOption}
          />
          <DynamicCombobox
            data-test-id="tax-preview-country-selector"
            disabled={disabled}
            label={intl.formatMessage(messages.country)}
            name="tax-preview-country"
            onChange={option => setSelectedCountryCode((option?.value ?? "") as CountryCode | "")}
            options={countryOptions}
            value={selectedCountryOption}
          />
          <PriceField
            currencySymbol={productPrice?.currency}
            disabled={disabled || !productPrice}
            label={intl.formatMessage(messages.priceOverride)}
            name="tax-preview-price"
            onChange={event =>
              setPriceOverride({
                value: event.target.value,
                variantId: selectedVariant?.id ?? "",
              })
            }
            value={price}
          />
          {isTaxAppPreview && (
            <Input
              data-test-id="tax-preview-app-rate"
              disabled={disabled}
              endAdornment={<Text marginRight={2}>%</Text>}
              label={intl.formatMessage(messages.appRate)}
              min={0}
              name="tax-preview-app-rate"
              onChange={event => setAppRate(event.target.value)}
              type="number"
              value={appRate}
            />
          )}
        </div>
      </section>

      {productSearch.loading && !selectedProduct ? (
        <Skeleton height={4} />
      ) : !selectedProduct ? (
        <Text size={2}>{intl.formatMessage(messages.noProducts)}</Text>
      ) : (
        <>
          {isTaxAppPreview && (
            <Box className={styles.stubNotice}>
              <Text size={2}>
                {intl.formatMessage(messages.appStubNotice, {
                  rate: taxRate,
                })}
              </Text>
            </Box>
          )}
          <section className={styles.section}>
            <Text size={1} color="default2" className={styles.sectionLabel}>
              {intl.formatMessage(messages.calculationSection)}
            </Text>
            <div className={styles.calculationPanel}>
              <div className={styles.storySteps}>
                <TaxStoryStep
                  index={1}
                  title={intl.formatMessage(messages.basedOn)}
                  description={intl.formatMessage(messages.sourceStory, {
                    country: selectedCountryOption?.label ?? countryCode,
                    source: configurationSourceLabel,
                  })}
                  meta={[
                    {
                      label: intl.formatMessage(messages.configurationSource),
                      value: configurationSourceLabel,
                    },
                  ]}
                />
                <TaxStoryStep
                  index={2}
                  title={intl.formatMessage(messages.productTaxClassStoryTitle)}
                  description={intl.formatMessage(messages.productTaxClassStory, {
                    taxClass: taxClassLabel,
                  })}
                  meta={[
                    {
                      label: intl.formatMessage(messages.taxClass),
                      value: taxClassLabel,
                    },
                  ]}
                />
                <TaxStoryStep
                  index={3}
                  title={intl.formatMessage(messages.rateStoryTitle)}
                  description={
                    isTaxAppPreview
                      ? intl.formatMessage(messages.appRateStory, {
                          rate: taxRate,
                        })
                      : intl.formatMessage(messages.flatRateStory, {
                          rate: taxRate,
                          rateSource: flatRateSourceLabel,
                        })
                  }
                  meta={[
                    {
                      label: intl.formatMessage(messages.rate),
                      value: `${taxRate}%`,
                    },
                    ...(!isTaxAppPreview && flatRate.taxClassName
                      ? [
                          {
                            label: intl.formatMessage(messages.taxClassRate),
                            value: flatRate.taxClassName,
                          },
                        ]
                      : []),
                  ]}
                />
                <TaxStoryStep
                  index={4}
                  title={intl.formatMessage(messages.priceModeStoryTitle)}
                  description={intl.formatMessage(messages.priceModeStory, {
                    priceMode: priceModeLabel,
                  })}
                  meta={[
                    {
                      label: intl.formatMessage(messages.priceMode),
                      value: priceModeLabel,
                    },
                  ]}
                />
                <TaxStoryStep
                  index={5}
                  title={intl.formatMessage(messages.taxWillBeTitle)}
                  description={intl.formatMessage(messages.taxWillBeStory)}
                >
                  <ul className={styles.priceLines}>
                    <PriceLine
                      label={intl.formatMessage(messages.net)}
                      amount={calculation.net}
                      currency={currency}
                    />
                    <PriceLine
                      label={intl.formatMessage(messages.tax)}
                      amount={calculation.tax}
                      currency={currency}
                    />
                    <PriceLine
                      label={intl.formatMessage(messages.gross)}
                      amount={calculation.gross}
                      currency={currency}
                      separated
                    />
                  </ul>
                  <StorefrontLine
                    label={storefrontDisplayLabel}
                    amount={calculation.storefrontPrice}
                    currency={currency}
                  />
                </TaxStoryStep>
              </div>
            </div>
          </section>
        </>
      )}
    </ProductTaxPreviewAccordion>
  );
};

interface ProductTaxPreviewAccordionProps {
  children: ReactNode;
  cta: string;
  description: string;
}

const ProductTaxPreviewAccordion = ({
  children,
  cta,
  description,
}: ProductTaxPreviewAccordionProps): JSX.Element => (
  <DashboardCard data-test-id="product-tax-preview">
    <DashboardCard.Content>
      <Accordion>
        <Accordion.Item value="product-tax-preview">
          <div className={styles.previewAccordion}>
            <Accordion.Trigger className={styles.previewTrigger}>
              <Box display="flex" flexDirection="column" gap={1}>
                <Text size={4} fontWeight="medium">
                  {cta}
                </Text>
                <Text size={2} color="default2">
                  {description}
                </Text>
              </Box>
              <Accordion.TriggerButton dataTestId="tax-preview-expand" />
            </Accordion.Trigger>
            <Accordion.Content>
              <div className={styles.previewContent}>{children}</div>
            </Accordion.Content>
          </div>
        </Accordion.Item>
      </Accordion>
    </DashboardCard.Content>
  </DashboardCard>
);

interface TaxStoryStepMeta {
  label: string;
  value: string;
}

interface TaxStoryStepProps {
  children?: ReactNode;
  description: string;
  index: number;
  meta?: TaxStoryStepMeta[];
  title: string;
}

const TaxStoryStep = ({
  children,
  description,
  index,
  meta = [],
  title,
}: TaxStoryStepProps): JSX.Element => (
  <div className={styles.storyStep}>
    <div className={styles.storyStepMarker}>{index}</div>
    <div className={styles.storyStepBody}>
      <Text size={2}>{title}</Text>
      <Text size={2} color="default2">
        {description}
      </Text>
      {meta.length > 0 && (
        <div className={styles.storyMeta}>
          {meta.map(item => (
            <div className={styles.storyToken} key={`${item.label}-${item.value}`}>
              <Text size={1} color="default2">
                {item.label}
              </Text>
              <Text size={2}>{item.value}</Text>
            </div>
          ))}
        </div>
      )}
      {children}
    </div>
  </div>
);

interface PriceLineProps {
  amount: number;
  currency: string;
  label: string;
  separated?: boolean;
}

const PriceLine = ({ amount, currency, label, separated }: PriceLineProps): JSX.Element => (
  <li className={separated ? styles.priceLineSeparated : styles.priceLine}>
    <Text size={3}>{label}</Text>
    <Text size={3}>
      <Money money={{ amount, currency }} />
    </Text>
  </li>
);

const StorefrontLine = ({ amount, currency, label }: PriceLineProps): JSX.Element => (
  <div className={styles.storefrontLine}>
    <Text size={2} color="default2">
      {label}
    </Text>
    <Text size={2} color="default2">
      <Money money={{ amount, currency }} />
    </Text>
  </div>
);
