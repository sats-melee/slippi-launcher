import { expect, it } from "vitest";

import { localRulesError, MAX_ENTRY_SATS, routingSurchargeSats } from "./local_rules";

it("rounds routing contributions up once per invoice using exact arithmetic", () => {
  expect(routingSurchargeSats(400, 2)).toBe(8);
  expect(routingSurchargeSats(401, 2.5)).toBe(11);
  expect(routingSurchargeSats(400, 0)).toBe(0);
  expect(localRulesError(400, 1, 2, 2.55)).toBeNull();
  expect(localRulesError(400, 1, 0, 2)).toMatch(/1–120/);
  expect(localRulesError(400, 1, 5, 2.555)).toMatch(/two decimal/);
  expect(localRulesError(MAX_ENTRY_SATS, 1, 5, 0)).toBeNull();
  expect(localRulesError(MAX_ENTRY_SATS, 1, 5, 2)).toMatch(/invoice limit/);
});
