// Money input and presentation only; payout calculation belongs to the API.
function parseMoneyToCents(value) {
    let text = String(value).trim().replace(/^€\s*/, '');
    if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(text)) {
        text = text.replace(/\./g, '').replace(',', '.');
    } else if (/^\d{1,3}(,\d{3})+\.\d{1,2}$/.test(text)) {
        text = text.replace(/,/g, '');
    } else if (/^\d+([.,]\d{1,2})?$/.test(text)) {
        text = text.replace(',', '.');
    } else {
        return null;
    }
    const [euros, fraction = ''] = text.split('.');
    const cents = BigInt(euros) * 100n + BigInt(fraction.padEnd(2, '0'));
    return cents <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(cents) : null;
}

function formatCents(cents) {
    const value = BigInt(cents);
    const euros = new Intl.NumberFormat('en-US').format(value / 100n);
    return `${euros}.${String(value % 100n).padStart(2, '0')}`;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { parseMoneyToCents, formatCents };
}
