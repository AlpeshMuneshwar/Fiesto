const parseBoolean = (value: string | undefined, fallback: boolean): boolean => {
    if (typeof value !== 'string') {
        return fallback;
    }

    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
    return fallback;
};

const parseNumber = (
    value: string | undefined,
    fallback: number,
    min: number,
    max: number,
    round = false
): number => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }

    const normalized = round ? Math.round(parsed) : parsed;
    if (normalized < min || normalized > max) {
        return fallback;
    }
    return normalized;
};

export const DEFAULT_RESERVATIONS_ENABLED = parseBoolean(process.env.RESERVATIONS_ENABLED_DEFAULT, true);
export const DEFAULT_PLATFORM_FEE_AMOUNT = parseNumber(process.env.PLATFORM_FEE_AMOUNT, 10, 0, 10000);
export const DEFAULT_PREORDER_ADVANCE_RATE = parseNumber(process.env.PRE_ORDER_ADVANCE_RATE, 40, 0, 100);
export const DEFAULT_PREORDER_PAYMENT_WINDOW_MINUTES = parseNumber(
    process.env.PREORDER_PAYMENT_WINDOW_MINUTES,
    60,
    10,
    240,
    true
);

export interface ReservationDefaultsInput {
    reservationsEnabled?: boolean | null;
    platformFeeAmount?: number | null;
    preOrderAdvanceRate?: number | null;
    preorderPaymentWindowMinutes?: number | null;
}

export const resolveReservationDefaults = (settings?: ReservationDefaultsInput | null) => ({
    reservationsEnabled:
        typeof settings?.reservationsEnabled === 'boolean'
            ? settings.reservationsEnabled
            : DEFAULT_RESERVATIONS_ENABLED,
    platformFeeAmount:
        typeof settings?.platformFeeAmount === 'number'
            ? settings.platformFeeAmount
            : DEFAULT_PLATFORM_FEE_AMOUNT,
    preOrderAdvanceRate:
        typeof settings?.preOrderAdvanceRate === 'number'
            ? settings.preOrderAdvanceRate
            : DEFAULT_PREORDER_ADVANCE_RATE,
    preorderPaymentWindowMinutes:
        typeof settings?.preorderPaymentWindowMinutes === 'number'
            ? settings.preorderPaymentWindowMinutes
            : DEFAULT_PREORDER_PAYMENT_WINDOW_MINUTES,
});

export const platformReservationDefaults = {
    reservationsEnabled: DEFAULT_RESERVATIONS_ENABLED,
    platformFeeAmount: DEFAULT_PLATFORM_FEE_AMOUNT,
    preOrderAdvanceRate: DEFAULT_PREORDER_ADVANCE_RATE,
    preorderPaymentWindowMinutes: DEFAULT_PREORDER_PAYMENT_WINDOW_MINUTES,
};
