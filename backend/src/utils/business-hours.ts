export type BusinessHours = {
    openTime?: string | null;
    closeTime?: string | null;
};

const TIME_ZONE = 'Asia/Kolkata';

const parseMinutes = (value?: string | null) => {
    if (!value) return null;
    const match = value.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;

    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
    return hours * 60 + minutes;
};

export const getCurrentMinutesInIndia = () => {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: TIME_ZONE,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).formatToParts(new Date());

    const hour = Number(parts.find((part) => part.type === 'hour')?.value || '0');
    const minute = Number(parts.find((part) => part.type === 'minute')?.value || '0');
    return hour * 60 + minute;
};

export const isWithinBusinessHours = (hours: BusinessHours) => {
    const openMinutes = parseMinutes(hours.openTime);
    const closeMinutes = parseMinutes(hours.closeTime);
    if (openMinutes === null || closeMinutes === null) {
        return true;
    }

    const nowMinutes = getCurrentMinutesInIndia();
    if (openMinutes === closeMinutes) {
        return true;
    }

    if (openMinutes < closeMinutes) {
        return nowMinutes >= openMinutes && nowMinutes < closeMinutes;
    }

    return nowMinutes >= openMinutes || nowMinutes < closeMinutes;
};

export const getBusinessHourMessage = (hours: BusinessHours) => {
    if (!hours.openTime || !hours.closeTime) {
        return 'Business hours are not configured yet.';
    }

    return `Orders are available from ${hours.openTime} to ${hours.closeTime} IST.`;
};
