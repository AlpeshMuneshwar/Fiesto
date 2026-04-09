const LOCAL_DEV_ORIGINS = [
    'http://localhost:8081', 'http://127.0.0.1:8081',
    'http://localhost:8082', 'http://127.0.0.1:8082',
    'http://localhost:8083', 'http://127.0.0.1:8083',
    'http://localhost:19006', 'http://localhost:3000',
];

const IPV4_HOST_PATTERN = /^\d{1,3}(?:\.\d{1,3}){3}$/;

const trimTrailingSlashes = (value: string) => value.replace(/\/+$/, '');

const normalizeOrigin = (value: string) => {
    const trimmed = trimTrailingSlashes(value.trim());
    if (!trimmed) {
        return '';
    }

    try {
        return new URL(trimmed).origin;
    } catch {
        return trimmed;
    }
};

const splitOrigins = (value?: string) =>
    (value || '')
        .split(',')
        .map((origin) => normalizeOrigin(origin))
        .filter(Boolean);

const expandOriginAliases = (origin: string) => {
    try {
        const url = new URL(origin);
        const origins = new Set<string>([url.origin]);
        const isLocalHost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';

        if (!isLocalHost && !IPV4_HOST_PATTERN.test(url.hostname)) {
            const alternateHost = url.hostname.startsWith('www.')
                ? url.hostname.slice(4)
                : `www.${url.hostname}`;
            origins.add(`${url.protocol}//${alternateHost}${url.port ? `:${url.port}` : ''}`);
        }

        return [...origins];
    } catch {
        return [origin];
    }
};

const configuredPublicAppUrl = normalizeOrigin(
    process.env.APP_BASE_URL || process.env.PUBLIC_APP_URL || ''
);

export const publicAppUrl =
    configuredPublicAppUrl || (process.env.NODE_ENV === 'production' ? 'https://cafeqr.com' : 'http://localhost:8081');

export const allowedOrigins = (() => {
    const origins = new Set<string>(
        process.env.NODE_ENV === 'production' ? [] : LOCAL_DEV_ORIGINS
    );

    [...splitOrigins(process.env.CORS_ORIGINS), ...expandOriginAliases(publicAppUrl)]
        .filter(Boolean)
        .forEach((origin) => origins.add(origin));

    return [...origins];
})();

export const buildCafeTableUrl = (cafeSlug: string, tableNumber: number, qrToken: string) =>
    `${trimTrailingSlashes(publicAppUrl)}/cafe/${cafeSlug}/table/${tableNumber}?token=${qrToken}`;
