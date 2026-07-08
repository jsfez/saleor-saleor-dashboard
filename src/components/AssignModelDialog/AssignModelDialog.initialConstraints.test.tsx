import { MockedProvider } from "@apollo/client/testing";
import { render, waitFor } from "@testing-library/react";
import type React from "react";
import { MemoryRouter } from "react-router-dom";

import AssignModelDialog from "./AssignModelDialog";

jest.mock("react-intl", () => ({
  FormattedMessage: ({ defaultMessage }: { defaultMessage: string }) => <>{defaultMessage}</>,
  useIntl: () => ({
    formatMessage: ({ defaultMessage }: { defaultMessage: string }) => defaultMessage,
  }),
  defineMessages: (messages: Record<string, unknown>) => messages,
}));

const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <MockedProvider mocks={[]} addTypename={false}>
    <MemoryRouter initialEntries={["/?action=assign-attribute-value"]}>{children}</MemoryRouter>
  </MockedProvider>
);

const mockPages = [{ __typename: "Page" as const, id: "page-1", title: "Test Page 1" }];

describe("AssignModelDialog initialConstraints", () => {
  it("applies pageType constraint to the filter when initialConstraints has pageTypes", async () => {
    // Arrange
    const onFilterChange = jest.fn();

    // Act
    render(
      <AssignModelDialog
        confirmButtonState="default"
        pages={mockPages}
        loading={false}
        hasMore={false}
        onFetchMore={jest.fn()}
        onSubmit={jest.fn()}
        onClose={jest.fn()}
        open
        onFilterChange={onFilterChange}
        initialConstraints={{ pageTypes: [{ id: "type-1", name: "Blog" }] }}
      />,
      { wrapper: Wrapper },
    );

    // Assert
    await waitFor(() => {
      expect(onFilterChange).toHaveBeenCalledWith(
        { pageType: { oneOf: ["type-1"] } },
        expect.any(String),
      );
    });
  });
});
