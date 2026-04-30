import { Request } from 'express';

interface DiscoveryAssetLike {
    id: string;
    kind: string;
    sortOrder: number;
    createdAt?: Date;
}

interface DiscoveryCafeLike {
    coverImage?: string | null;
    galleryImages?: string | null;
    discoveryAssets?: DiscoveryAssetLike[];
}

export interface DiscoveryGalleryAsset {
    id: string | null;
    url: string;
    source: 'DATABASE' | 'LEGACY';
}

const splitLegacyImages = (value?: string | null) => {
    return String(value || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
};

export const parseLegacyGalleryImages = splitLegacyImages;

export const getRequestBaseUrl = (req: Request) => {
    const forwardedProto = req.header('x-forwarded-proto')?.split(',')[0]?.trim();
    const protocol = forwardedProto || req.protocol;
    const host = req.get('host');
    return `${protocol}://${host}`;
};

export const buildDiscoveryMediaUrl = (req: Request, assetId: string) => {
    return `${getRequestBaseUrl(req)}/api/discover/media/${assetId}`;
};

export const resolveDiscoveryMedia = (cafe: DiscoveryCafeLike, req: Request) => {
    const discoveryAssets = Array.isArray(cafe.discoveryAssets) ? cafe.discoveryAssets : [];
    const coverAssets = discoveryAssets
        .filter((asset) => asset.kind === 'COVER')
        .sort((a, b) => a.sortOrder - b.sortOrder);
    const galleryAssets = discoveryAssets
        .filter((asset) => asset.kind === 'GALLERY')
        .sort((a, b) => {
            if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
            return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
        });

    const coverAsset = coverAssets[0] || null;
    const legacyGalleryImages = splitLegacyImages(cafe.galleryImages);
    const galleryImageAssets: DiscoveryGalleryAsset[] = [
        ...galleryAssets.map((asset) => ({
            id: asset.id,
            url: buildDiscoveryMediaUrl(req, asset.id),
            source: 'DATABASE' as const,
        })),
        ...legacyGalleryImages.map((url) => ({
            id: null,
            url,
            source: 'LEGACY' as const,
        })),
    ];

    return {
        coverImage: coverAsset ? buildDiscoveryMediaUrl(req, coverAsset.id) : cafe.coverImage || null,
        coverImageAssetId: coverAsset?.id || null,
        galleryImages: galleryImageAssets.length > 0 ? galleryImageAssets.map((item) => item.url).join(',') : null,
        galleryImageAssets,
        legacyGalleryImages,
    };
};
