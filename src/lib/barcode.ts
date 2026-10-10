/*
 * Bar codes on game boxes: EAN-13 almost always, EAN-8 on small boxes, UPC-A on games from America. No imports, so
 * the camera reader (client) and the server actions check a code the same way.
 */

/** Whether the last digit is the right check digit (GS1: weights 3 and 1 from the right). */
function checkDigitOk(digits: string) {
  let sum = 0;
  for (let i = digits.length - 2, weight = 3; i >= 0; i--, weight = 4 - weight) sum += Number(digits[i]) * weight;
  return (10 - (sum % 10)) % 10 === Number(digits[digits.length - 1]);
}

/**
 * The code as it is kept: 13 digits (a UPC-A gets the leading 0 it has as an EAN-13, so either reading of one box
 * gives the same code) or 8 for an EAN-8; null for anything else, a typo included (the check digit does not fit).
 */
export function normalizeBarcode(raw: string): string | null {
  const digits = raw.replace(/[\s-]/g, "");
  if (!/^(\d{8}|\d{12}|\d{13})$/.test(digits) || !checkDigitOk(digits)) return null;
  return digits.length === 12 ? `0${digits}` : digits;
}
