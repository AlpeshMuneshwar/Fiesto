export const normalizePhoneNumber = (value: unknown) => {
    if (typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }

    let normalized = trimmed.replace(/[^\d+]/g, '');
    if (normalized.startsWith('+')) {
        normalized = `+${normalized.slice(1).replace(/\+/g, '')}`;
    } else {
        normalized = normalized.replace(/\+/g, '');
    }

    const digits = normalized.replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 15) {
        throw new Error('Enter a valid phone number with 7 to 15 digits.');
    }

    return normalized.startsWith('+') ? `+${digits}` : digits;
};

export const toDialablePhone = (value: string | null | undefined) => {
    if (!value) {
        return null;
    }

    const normalized = value.replace(/[^\d+]/g, '');
    if (!normalized) {
        return null;
    }

    if (normalized.startsWith('+')) {
        return `+${normalized.slice(1).replace(/\+/g, '')}`;
    }

    return normalized.replace(/\+/g, '');
};
