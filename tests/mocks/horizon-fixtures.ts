/**
 * Shared Horizon fixtures matching WireMock mappings from trustbridge-action.
 */

export const HORIZON_TEST_ACCOUNTS = {
  FUNDED: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
  UNFUNDED: "GBCEIRCEIRCEIRCEIRCEIRCEIRCEIRCEIRCEIRCEIRCEIRCEIRCEIZCA",
  LOW_BALANCE: "GAIRCEIRCEIRCEIRCEIRCEIRCEIRCEIRCEIRCEIRCEIRCEIRCEIRCF6M",
  NO_TRUSTLINE: "GARCEIRCEIRCEIRCEIRCEIRCEIRCEIRCEIRCEIRCEIRCEIRCEIRCFRVX",
  RATE_LIMITED: "GAZTGMZTGMZTGMZTGMZTGMZTGMZTGMZTGMZTGMZTGMZTGMZTGMZTHCM6",
} as const;

export const HORIZON_MOCK_RESPONSES = {
  [HORIZON_TEST_ACCOUNTS.FUNDED]: {
    id: HORIZON_TEST_ACCOUNTS.FUNDED,
    account_id: HORIZON_TEST_ACCOUNTS.FUNDED,
    sequence: "123456789",
    subentry_count: 1,
    num_sponsoring: 0,
    num_sponsored: 0,
    balances: [
      {
        balance: "10.0000000",
        asset_type: "native",
        buying_liabilities: "0.0000000",
        selling_liabilities: "0.0000000",
      },
      {
        balance: "50.0000000",
        asset_type: "credit_alphanum4",
        asset_code: "USDC",
        asset_issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
        buying_liabilities: "0.0000000",
        selling_liabilities: "0.0000000",
      },
    ],
  },
  [HORIZON_TEST_ACCOUNTS.LOW_BALANCE]: {
    id: HORIZON_TEST_ACCOUNTS.LOW_BALANCE,
    account_id: HORIZON_TEST_ACCOUNTS.LOW_BALANCE,
    sequence: "987654321",
    subentry_count: 1,
    num_sponsoring: 0,
    num_sponsored: 0,
    balances: [
      {
        balance: "0.5000000",
        asset_type: "native",
        buying_liabilities: "0.0000000",
        selling_liabilities: "0.0000000",
      },
      {
        balance: "10.0000000",
        asset_type: "credit_alphanum4",
        asset_code: "USDC",
        asset_issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
        buying_liabilities: "0.0000000",
        selling_liabilities: "0.0000000",
      },
    ],
  },
  [HORIZON_TEST_ACCOUNTS.NO_TRUSTLINE]: {
    id: HORIZON_TEST_ACCOUNTS.NO_TRUSTLINE,
    account_id: HORIZON_TEST_ACCOUNTS.NO_TRUSTLINE,
    sequence: "111111111",
    subentry_count: 0,
    num_sponsoring: 0,
    num_sponsored: 0,
    balances: [
      {
        balance: "10.0000000",
        asset_type: "native",
        buying_liabilities: "0.0000000",
        selling_liabilities: "0.0000000",
      },
    ],
  },
};
