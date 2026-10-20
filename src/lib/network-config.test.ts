import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ACTION_DEFAULTS } from "@/lib/constants";
import {
  checkActionAlignment,
  classifyHorizonNetwork,
  classifySorobanNetwork,
  getNetworkConfig,
} from "@/lib/network-config";

describe("classifyHorizonNetwork", () => {
  it("classifies the canonical mainnet Horizon hostname", () => {
    expect(classifyHorizonNetwork("https://horizon.stellar.org")).toBe(
      "mainnet"
    );
  });

  it("classifies the canonical testnet Horizon hostname", () => {
    expect(
      classifyHorizonNetwork("https://horizon-testnet.stellar.org")
    ).toBe("testnet");
  });

  it("treats unrecognized hostnames as custom", () => {
    expect(classifyHorizonNetwork("https://horizon.example.com")).toBe(
      "custom"
    );
  });

  it("treats an unparseable URL as custom rather than throwing", () => {
    expect(classifyHorizonNetwork("not-a-url")).toBe("custom");
  });
});

describe("classifySorobanNetwork", () => {
  it("classifies the canonical testnet Soroban RPC hostname", () => {
    expect(
      classifySorobanNetwork("https://soroban-testnet.stellar.org")
    ).toBe("testnet");
  });

  it("classifies the documented mainnet Soroban RPC hostname", () => {
    expect(classifySorobanNetwork("https://mainnet.sorobanrpc.com")).toBe(
      "mainnet"
    );
  });

  it("treats unrecognized hostnames as custom (e.g. private RPC nodes)", () => {
    expect(classifySorobanNetwork("https://rpc.myteam.internal")).toBe(
      "custom"
    );
  });
});

describe("getNetworkConfig", () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllEnvs();
  });

  it("is not mismatched when both endpoints resolve to testnet", () => {
    process.env.NEXT_PUBLIC_HORIZON_URL = "https://horizon-testnet.stellar.org";
    process.env.SOROBAN_RPC_URL = "https://soroban-testnet.stellar.org";

    const config = getNetworkConfig();

    expect(config.horizonNetwork).toBe("testnet");
    expect(config.sorobanNetwork).toBe("testnet");
    expect(config.mismatched).toBe(false);
  });

  it("flags the project's actual default configuration as mismatched (Horizon mainnet vs Soroban testnet)", () => {
    delete process.env.NEXT_PUBLIC_HORIZON_URL;
    delete process.env.SOROBAN_RPC_URL;

    const config = getNetworkConfig();

    expect(config.horizonNetwork).toBe("mainnet");
    expect(config.sorobanNetwork).toBe("testnet");
    expect(config.mismatched).toBe(true);
    expect(config.warnings.join(" ")).toMatch(/mainnet/i);
  });

  it("does not false-positive when both endpoints are custom URLs", () => {
    process.env.NEXT_PUBLIC_HORIZON_URL = "https://horizon.myteam.internal";
    process.env.SOROBAN_RPC_URL = "https://soroban.myteam.internal";

    const config = getNetworkConfig();

    expect(config.horizonNetwork).toBe("custom");
    expect(config.sorobanNetwork).toBe("custom");
    expect(config.mismatched).toBe(false);
  });

  it("does not false-positive when one endpoint is custom and the other is a named network", () => {
    process.env.NEXT_PUBLIC_HORIZON_URL = "https://horizon.stellar.org";
    process.env.SOROBAN_RPC_URL = "https://rpc.myteam.internal";

    const config = getNetworkConfig();

    expect(config.horizonNetwork).toBe("mainnet");
    expect(config.sorobanNetwork).toBe("custom");
    expect(config.mismatched).toBe(false);
  });

  it("reports sorobanContractConfigured based on SOROBAN_CONTRACT_ID", () => {
    delete process.env.SOROBAN_CONTRACT_ID;
    expect(getNetworkConfig().sorobanContractConfigured).toBe(false);

    process.env.SOROBAN_CONTRACT_ID = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
    expect(getNetworkConfig().sorobanContractConfigured).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Alignment with trustbridge-action (issue #119)
// ---------------------------------------------------------------------------
describe("checkActionAlignment", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it("reports aligned when the environment matches the Action defaults", () => {
    process.env.NEXT_PUBLIC_HORIZON_URL = ACTION_DEFAULTS.horizonUrl;
    process.env.NEXT_PUBLIC_DEFAULT_ASSET_CODE = ACTION_DEFAULTS.assetCode;
    process.env.NEXT_PUBLIC_DEFAULT_ASSET_ISSUER = ACTION_DEFAULTS.assetIssuer;
    process.env.NEXT_PUBLIC_MIN_XLM_BALANCE = String(
      ACTION_DEFAULTS.minXlmReserve
    );

    const alignment = checkActionAlignment();

    expect(alignment.aligned).toBe(true);
    expect(alignment.warnings).toEqual([]);
  });

  it("is aligned on a bare environment, because the built-in defaults mirror the Action", () => {
    delete process.env.NEXT_PUBLIC_HORIZON_URL;
    delete process.env.NEXT_PUBLIC_DEFAULT_ASSET_CODE;
    delete process.env.NEXT_PUBLIC_DEFAULT_ASSET_ISSUER;
    delete process.env.NEXT_PUBLIC_MIN_XLM_BALANCE;

    // This is the regression guard for issue #119: the shipped defaults must
    // not drift from action.yml, so an operator who configures nothing still
    // gets the same verdict from the dashboard and the Action.
    expect(checkActionAlignment().aligned).toBe(true);
  });

  it("exposes the Action defaults alongside the resolved values", () => {
    const alignment = checkActionAlignment();
    expect(alignment.expected).toEqual({
      horizonUrl: ACTION_DEFAULTS.horizonUrl,
      assetCode: ACTION_DEFAULTS.assetCode,
      assetIssuer: ACTION_DEFAULTS.assetIssuer,
      minXlmBalance: ACTION_DEFAULTS.minXlmReserve,
    });
  });

  it("flags an issuer that fails StrKey checksum validation", () => {
    // The pre-#119 hardcoded default: correct shape, wrong checksum. A regex
    // length/charset check passes it, so only real StrKey validation catches it.
    process.env.NEXT_PUBLIC_DEFAULT_ASSET_ISSUER =
      "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX5IHOWEBMGJI55ITFSZ6";

    const alignment = checkActionAlignment();

    expect(alignment.aligned).toBe(false);
    expect(alignment.warnings.join("\n")).toMatch(
      /not a valid Stellar G-address/
    );
  });

  it("flags a valid-but-different issuer without calling it invalid", () => {
    // A real, checksum-valid mainnet issuer that simply is not Circle's USDC.
    process.env.NEXT_PUBLIC_DEFAULT_ASSET_ISSUER =
      "GBDEVU63Y6NTHJQQZIKVTC23NWLQVP3WJ2RI2OTSJTNYOIGICST6DUXR";

    const alignment = checkActionAlignment();

    expect(alignment.aligned).toBe(false);
    expect(alignment.warnings.join("\n")).toMatch(/Asset issuer differs/);
    expect(alignment.warnings.join("\n")).not.toMatch(/not a valid/);
  });

  it("flags an asset code that differs from the Action", () => {
    process.env.NEXT_PUBLIC_DEFAULT_ASSET_CODE = "EURC";

    const alignment = checkActionAlignment();

    expect(alignment.assetCode).toBe("EURC");
    expect(alignment.warnings.join("\n")).toMatch(/Asset code differs/);
  });

  it("flags a Horizon URL that differs from the Action", () => {
    process.env.NEXT_PUBLIC_HORIZON_URL = "https://horizon-testnet.stellar.org";

    const alignment = checkActionAlignment();

    expect(alignment.warnings.join("\n")).toMatch(/Horizon URL differs/);
  });

  it("flags a minimum balance BELOW the Action's reserve floor", () => {
    // This is the exact "ready here, fails there" case from the issue.
    process.env.NEXT_PUBLIC_MIN_XLM_BALANCE = "1";

    const alignment = checkActionAlignment();

    expect(alignment.minXlmBalance).toBe(1);
    expect(alignment.warnings.join("\n")).toMatch(
      /below trustbridge-action's min_xlm_reserve/
    );
  });

  it("does NOT flag a minimum balance above the Action's reserve floor", () => {
    // A stricter dashboard is conservative, not dangerous: nobody is told they
    // are ready and then rejected by the Action.
    process.env.NEXT_PUBLIC_MIN_XLM_BALANCE = "5";

    const alignment = checkActionAlignment();

    expect(alignment.warnings.join("\n")).not.toMatch(/min_xlm_reserve/);
  });
});

describe("getNetworkConfig — action alignment surfacing", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it("includes alignment warnings in the panel's warning list", () => {
    process.env.NEXT_PUBLIC_DEFAULT_ASSET_CODE = "EURC";

    const config = getNetworkConfig();

    expect(config.actionAlignment.aligned).toBe(false);
    expect(config.warnings.join("\n")).toMatch(/Asset code differs/);
  });

  it("attaches the alignment report even when everything agrees", () => {
    const config = getNetworkConfig();
    expect(config.actionAlignment).toBeDefined();
    expect(config.actionAlignment.expected.assetIssuer).toBe(
      ACTION_DEFAULTS.assetIssuer
    );
  });
});
