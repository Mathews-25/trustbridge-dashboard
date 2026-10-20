import { describe, expect, it } from "vitest";

import {
    API_KEY_ALL_SCOPES_MASK,
    API_KEY_SCOPE_DEFINITIONS,
    apiKeyScopesToBitmask,
    hasApiKeyScope,
} from "@/lib/api-key-scopes";

describe("API key scope bitmask", () => {
    it("maps export:read to bit zero and mask one", () => {
        expect(API_KEY_SCOPE_DEFINITIONS["export:read"]).toMatchObject({
            bit: 0,
            mask: 1,
        });
        expect(apiKeyScopesToBitmask(["export:read"])).toBe(1);
        expect(hasApiKeyScope(["export:read"], "export:read")).toBe(true);
    });

    it("grants no permissions for empty or unknown scope lists", () => {
        expect(apiKeyScopesToBitmask([])).toBe(0);
        expect(apiKeyScopesToBitmask(["admin:write"])).toBe(0);
        expect(hasApiKeyScope([], "export:read")).toBe(false);
        expect(hasApiKeyScope(["admin:write"], "export:read")).toBe(false);
    });

    it("recognizes the internal wildcard without exposing additional named scopes", () => {
        expect(apiKeyScopesToBitmask(["*"])).toBe(API_KEY_ALL_SCOPES_MASK);
        expect(hasApiKeyScope(["*"], "export:read")).toBe(true);
    });
});