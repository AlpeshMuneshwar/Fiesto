const GOOGLE_MAPS_HOST_PATTERNS = [
    /^maps\.app\.goo\.gl$/i,
    /^goo\.gl$/i,
    /^maps\.google\./i,
    /^google\./i,
    /^www\.google\./i,
];

const COORDINATE_PATTERNS = [
    /@([+-]?\d{1,2}(?:\.\d+)?),([+-]?\d{1,3}(?:\.\d+)?)/,
    /[?&](?:q|query|ll|saddr|daddr|destination)=([+-]?\d{1,2}(?:\.\d+)?),\s*([+-]?\d{1,3}(?:\.\d+)?)/,
    /!3d([+-]?\d{1,2}(?:\.\d+)?)!4d([+-]?\d{1,3}(?:\.\d+)?)/,
];

const hasValidCoordinates = (latitude: number, longitude: number) => {
    return (
        Number.isFinite(latitude) &&
        Number.isFinite(longitude) &&
        latitude >= -90 &&
        latitude <= 90 &&
        longitude >= -180 &&
        longitude <= 180
    );
};

const safeDecode = (value: string) => {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
};

const isAllowedGoogleMapsHost = (hostname: string) => {
    return GOOGLE_MAPS_HOST_PATTERNS.some((pattern) => pattern.test(hostname));
};

const extractCoordinatesFromText = (value: string) => {
    const decoded = safeDecode(value);

    for (const pattern of COORDINATE_PATTERNS) {
        const match = decoded.match(pattern);
        if (!match) continue;

        const latitude = Number(match[1]);
        const longitude = Number(match[2]);
        if (hasValidCoordinates(latitude, longitude)) {
            return { latitude, longitude };
        }
    }

    const genericMatch = decoded.match(/([+-]?\d{1,2}(?:\.\d+)?),\s*([+-]?\d{1,3}(?:\.\d+)?)/);
    if (genericMatch) {
        const latitude = Number(genericMatch[1]);
        const longitude = Number(genericMatch[2]);
        if (hasValidCoordinates(latitude, longitude)) {
            return { latitude, longitude };
        }
    }

    return null;
};

const resolveFinalGoogleMapsUrl = async (rawUrl: string) => {
    const response = await fetch(rawUrl, {
        method: 'GET',
        redirect: 'follow',
        headers: {
            'User-Agent': 'Cafe QR Solutions Discovery Resolver',
        },
    });

    try {
        await response.body?.cancel?.();
    } catch {
        // Ignore body cancellation issues. The final URL is all we need.
    }

    return response.url || rawUrl;
};

export interface ParsedGoogleMapsLocation {
    latitude: number;
    longitude: number;
    normalizedUrl: string;
}

export async function parseGoogleMapsLink(rawValue: string): Promise<ParsedGoogleMapsLocation> {
    const trimmed = rawValue.trim();
    if (!trimmed) {
        throw new Error('Google Maps link is required.');
    }

    let parsedUrl: URL;
    try {
        parsedUrl = new URL(trimmed);
    } catch {
        throw new Error('Paste a valid Google Maps link.');
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error('Google Maps link must start with http or https.');
    }

    if (!isAllowedGoogleMapsHost(parsedUrl.hostname)) {
        throw new Error('Paste a Google Maps share link so the location can be extracted.');
    }

    const directCoordinates = extractCoordinatesFromText(parsedUrl.toString());
    if (directCoordinates) {
        return {
            ...directCoordinates,
            normalizedUrl: parsedUrl.toString(),
        };
    }

    const resolvedUrl = await resolveFinalGoogleMapsUrl(parsedUrl.toString());
    const resolvedCoordinates = extractCoordinatesFromText(resolvedUrl);
    if (resolvedCoordinates) {
        return {
            ...resolvedCoordinates,
            normalizedUrl: resolvedUrl,
        };
    }

    throw new Error('Could not extract latitude and longitude from that Google Maps link.');
}
