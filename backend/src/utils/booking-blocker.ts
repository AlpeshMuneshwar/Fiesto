import { DEFAULT_SESSION_MINUTES, getSessionEnd } from './reservation-queue';

export const BLOCKING_BOOKING_ORDER_STATUSES: string[] = [
    'PENDING_APPROVAL',
    'RECEIVED',
    'PREPARING',
    'READY',
    'AWAITING_PICKUP',
];

type BlockingSessionCandidate = {
    id: string;
    isActive: boolean;
    isPrebooked: boolean;
    deviceIdentifier?: string | null;
    scheduledAt?: Date | null;
    slotDurationMinutes?: number | null;
    createdAt: Date;
    updatedAt: Date;
};

type BlockingOrderCandidate = {
    session?: BlockingSessionCandidate | null;
};

export function isStillBlockingBooking(order: BlockingOrderCandidate, nowMs = Date.now()) {
    const session = order?.session;
    if (!session) return false;

    if (session.isActive) return true;
    if (!session.isPrebooked) return false;
    if (session.deviceIdentifier) return false;

    const slotMinutes = session.slotDurationMinutes || DEFAULT_SESSION_MINUTES;
    const slotEnd = getSessionEnd(
        {
            id: session.id,
            isActive: session.isActive,
            isPrebooked: session.isPrebooked,
            scheduledAt: session.scheduledAt || null,
            slotDurationMinutes: session.slotDurationMinutes,
            createdAt: session.createdAt,
            updatedAt: session.updatedAt,
        },
        slotMinutes
    );

    return slotEnd.getTime() >= nowMs;
}
