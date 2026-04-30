import { DEFAULT_PREORDER_PAYMENT_WINDOW_MINUTES } from '../config/reservation-defaults';

export const ORDER_ROUTING_MODES = {
    STANDARD: 'STANDARD',
    DIRECT_ADMIN_MANAGEMENT: 'DIRECT_ADMIN_MANAGEMENT',
} as const;

export const APP_DISABLED_ERROR_CODE = 'APP_DISABLED_BY_MODE';

export type OrderRoutingMode = (typeof ORDER_ROUTING_MODES)[keyof typeof ORDER_ROUTING_MODES];

export interface MinimalCafeSettings {
    orderRoutingMode?: string | null;
    directAdminChefAppEnabled?: boolean | null;
    preorderPaymentWindowMinutes?: number | null;
}

export function normalizeOrderRoutingMode(mode?: string | null): OrderRoutingMode {
    return mode === ORDER_ROUTING_MODES.DIRECT_ADMIN_MANAGEMENT
        ? ORDER_ROUTING_MODES.DIRECT_ADMIN_MANAGEMENT
        : ORDER_ROUTING_MODES.STANDARD;
}

export function isDirectAdminManagementMode(settings?: MinimalCafeSettings | null): boolean {
    return normalizeOrderRoutingMode(settings?.orderRoutingMode) === ORDER_ROUTING_MODES.DIRECT_ADMIN_MANAGEMENT;
}

export function isChefAppEnabledInDirectMode(settings?: MinimalCafeSettings | null): boolean {
    return Boolean(settings?.directAdminChefAppEnabled);
}

export function shouldSendToChefApp(settings?: MinimalCafeSettings | null): boolean {
    if (!isDirectAdminManagementMode(settings)) {
        return true;
    }

    return isChefAppEnabledInDirectMode(settings);
}

export function getPreorderPaymentWindowMinutes(_settings?: MinimalCafeSettings | null): number {
    return DEFAULT_PREORDER_PAYMENT_WINDOW_MINUTES;
}

export function evaluateRoleAccessForMode(
    role: string,
    settings?: MinimalCafeSettings | null
): {
    blocked: boolean;
    message?: string;
    code?: string;
} {
    const directMode = isDirectAdminManagementMode(settings);
    if (!directMode) {
        return { blocked: false };
    }

    if (role === 'WAITER') {
        return {
            blocked: true,
            code: APP_DISABLED_ERROR_CODE,
            message: 'Direct Admin Management mode is enabled. Waiter app is currently inactive for this cafe.',
        };
    }

    if (role === 'CHEF' && !isChefAppEnabledInDirectMode(settings)) {
        return {
            blocked: true,
            code: APP_DISABLED_ERROR_CODE,
            message: 'Direct Admin Management mode is enabled and Chef app is disabled for this cafe.',
        };
    }

    return { blocked: false };
}

export function isPreorderType(orderType?: string | null, isPreorderFlag?: boolean | null): boolean {
    return Boolean(isPreorderFlag) || orderType === 'PRE_ORDER' || orderType === 'TAKEAWAY';
}
