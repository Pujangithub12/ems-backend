"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.amountToWords = amountToWords;
const ONES = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
    "Seventeen", "Eighteen", "Nineteen",
];
const TENS = [
    "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety",
];
function threeDigitsToWords(n) {
    const parts = [];
    if (n >= 100) {
        parts.push(`${ONES[Math.floor(n / 100)] ?? ""} Hundred`);
        n %= 100;
    }
    if (n >= 20) {
        parts.push(TENS[Math.floor(n / 10)] ?? "");
        n %= 10;
        if (n > 0)
            parts.push(ONES[n] ?? "");
    }
    else if (n > 0) {
        parts.push(ONES[n] ?? "");
    }
    return parts.join(" ");
}
/**
 * Converts a non-negative integer to words using the Indian numbering system
 * (crore/lakh) — the convention used across India and Nepal, matching the
 * "Amount in Words" line on the Purchase Order PDF.
 */
function integerToWords(value) {
    if (value === 0)
        return "Zero";
    const crore = Math.floor(value / 10000000);
    value %= 10000000;
    const lakh = Math.floor(value / 100000);
    value %= 100000;
    const thousand = Math.floor(value / 1000);
    value %= 1000;
    const rest = value;
    const segments = [];
    if (crore > 0)
        segments.push(`${threeDigitsToWords(crore)} Crore`);
    if (lakh > 0)
        segments.push(`${threeDigitsToWords(lakh)} Lakh`);
    if (thousand > 0)
        segments.push(`${threeDigitsToWords(thousand)} Thousand`);
    if (rest > 0)
        segments.push(threeDigitsToWords(rest));
    return segments.join(" ");
}
/** "1234.5" -> "One Thousand Two Hundred Thirty-Four and 50/100" style amount-in-words, Indian numbering. */
function amountToWords(amount, currencyLabel = "Rupees") {
    const rounded = Math.round(Math.abs(amount) * 100) / 100;
    const whole = Math.floor(rounded);
    const paisa = Math.round((rounded - whole) * 100);
    let words = `${currencyLabel} ${integerToWords(whole)} only`;
    if (paisa > 0) {
        words = `${currencyLabel} ${integerToWords(whole)} and ${integerToWords(paisa)} paisa only`;
    }
    return words;
}
//# sourceMappingURL=numberToWords.js.map