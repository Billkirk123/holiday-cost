import assert from "node:assert/strict";
import test from "node:test";
import {
  convertAmountCents,
  isExpenseCategory,
  isUuid,
  parseAmountCents,
  parseDate,
  splitPerPersonCents,
  stringField,
} from "../src/domain.js";

test("parseAmountCents accepts decimal strings and numeric amounts", () => {
  assert.equal(parseAmountCents("12"), 1200);
  assert.equal(parseAmountCents("12.3"), 1230);
  assert.equal(parseAmountCents(" 12.34 "), 1234);
  assert.equal(parseAmountCents(12.34), 1234);
});

test("parseAmountCents rejects invalid, zero, and out-of-range amounts", () => {
  for (const value of ["", "0", "0.00", "-1", "01.00", "1.234", "10000000", NaN, Infinity, null]) {
    assert.equal(parseAmountCents(value), undefined, `expected ${String(value)} to be rejected`);
  }
});

test("convertAmountCents applies the rate and rounds to the nearest cent", () => {
  assert.equal(convertAmountCents(1000, 1.25), 1250);
  assert.equal(convertAmountCents(1001, 1.5), 1502);
  assert.equal(convertAmountCents(1000, 1), 1000);
});

test("convertAmountCents rejects invalid rates and converted amounts", () => {
  assert.throws(() => convertAmountCents(1000, 0), RangeError);
  assert.throws(() => convertAmountCents(1000, Number.NaN), RangeError);
  assert.throws(() => convertAmountCents(0, 1), RangeError);
  assert.throws(() => convertAmountCents(999_999_999, 2), RangeError);
});

test("splitPerPersonCents divides a total and rounds to whole cents", () => {
  assert.equal(splitPerPersonCents(1000, 2), 500);
  assert.equal(splitPerPersonCents(1000, 3), 333);
  assert.equal(splitPerPersonCents(1001, 2), 501);
  assert.equal(splitPerPersonCents(0, 3), 0);
});

test("splitPerPersonCents rejects invalid totals and traveler counts", () => {
  assert.throws(() => splitPerPersonCents(-1, 2), RangeError);
  assert.throws(() => splitPerPersonCents(100, 0), RangeError);
  assert.throws(() => splitPerPersonCents(100, 1.5), RangeError);
});

test("stringField trims and enforces length limits", () => {
  assert.equal(stringField("  hello world  ", 20), "hello world");
  assert.equal(stringField("a", 0), undefined);
  assert.equal(stringField("", 10), undefined);
  assert.equal(stringField("valid value", 5), undefined);
});

test("parseDate accepts ISO dates and rejects malformed values", () => {
  assert.equal(parseDate("2025-02-28"), "2025-02-28");
  assert.equal(parseDate(""), null);
  assert.equal(parseDate(null), null);
  assert.equal(parseDate("2025-02-30"), undefined);
  assert.equal(parseDate("not-a-date"), undefined);
});

test("isExpenseCategory and isUuid validate values as expected", () => {
  assert.equal(isExpenseCategory("transport"), true);
  assert.equal(isExpenseCategory("invalid"), false);
  assert.equal(isUuid("123e4567-e89b-42d3-a456-426614174000"), true);
  assert.equal(isUuid("not-a-uuid"), false);
});
