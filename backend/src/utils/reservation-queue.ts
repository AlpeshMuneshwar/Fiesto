import { prisma } from '../prisma';
import { recordActivity } from './audit';
import { io } from '../socket';
import { sendPushNotifications } from '../push';

export const DEFAULT_SESSION_MINUTES = 90;

type QueueSession = {
    id: string;
    isActive: boolean;
    isPrebooked: boolean;
    scheduledAt?: Date | null;
    slotDurationMinutes?: number | null;
    createdAt: Date;
    updatedAt: Date;
};

const addMinutes = (date: Date, minutes: number) => new Date(date.getTime() + minutes * 60 * 1000);

export function getSessionStart(session: QueueSession): Date {
    return new Date(session.scheduledAt || session.updatedAt || session.createdAt);
}

export function getSessionEnd(session: QueueSession, slotMinutes = DEFAULT_SESSION_MINUTES): Date {
    const sessionSlotMinutes = normalizeSlotMinutes(session.slotDurationMinutes || slotMinutes);
    return addMinutes(getSessionStart(session), sessionSlotMinutes);
}

export function normalizeSlotMinutes(input: number | undefined | null): number {
    if (!input || Number.isNaN(input)) return DEFAULT_SESSION_MINUTES;
    return Math.max(20, Math.min(180, Math.round(input)));
}

export function computeAssignedSlot(
    existingSessions: QueueSession[],
    requestedStart: Date,
    slotMinutes: number
) {
    const safeSlotMinutes = normalizeSlotMinutes(slotMinutes);
    const now = new Date();
    let assignedStart = new Date(requestedStart);
    let queueAhead = 0;

    const relevant = existingSessions
        .filter((session) => session.isActive || session.isPrebooked)
        .map((session) => ({
            ...session,
            start: getSessionStart(session),
            end: getSessionEnd(session, safeSlotMinutes),
        }))
        .filter((session) => session.end > now)
        .sort((a, b) => {
            if (a.start.getTime() === b.start.getTime()) {
                return a.createdAt.getTime() - b.createdAt.getTime();
            }
            return a.start.getTime() - b.start.getTime();
        });

    for (const session of relevant) {
        const assignedEnd = addMinutes(assignedStart, safeSlotMinutes);

        if (assignedEnd <= session.start) {
            break;
        }

        if (assignedStart < session.end) {
            assignedStart = new Date(session.end);
            queueAhead += 1;
        }
    }

    const assignedEnd = addMinutes(assignedStart, safeSlotMinutes);
    const waitMinutes = Math.max(0, Math.ceil((assignedStart.getTime() - requestedStart.getTime()) / 60000));

    return {
        assignedStart,
        assignedEnd,
        queueAhead,
        queuePosition: queueAhead > 0 ? queueAhead + 1 : 0,
        waitMinutes,
    };
}

export async function activateNextQueuedReservation(tableId?: string | null, cafeId?: string | null) {
    if (!tableId || !cafeId) {
        return null;
    }

    const nextReservation = await prisma.session.findFirst({
        where: {
            tableId,
            cafeId,
            isPrebooked: true,
            isActive: false,
        },
        include: {
            table: true,
        },
        orderBy: [
            { scheduledAt: 'asc' },
            { createdAt: 'asc' },
        ],
    });

    if (!nextReservation) {
        return null;
    }

    const activatedSession = await prisma.session.update({
        where: { id: nextReservation.id },
        data: {
            isActive: true,
            updatedBy: 'SYSTEM_QUEUE',
        },
        include: {
            table: true,
            customer: {
                select: {
                    id: true,
                    pushToken: true,
                },
            },
            cafe: {
                select: {
                    name: true,
                },
            },
        },
    });

    recordActivity({
        cafeId,
        actionType: 'SESSION_START',
        message: `Queued reservation is now ready for Table ${activatedSession.table?.number ?? '-'}`,
        metadata: {
            sessionId: activatedSession.id,
            tableId,
            promotedFromQueue: true,
        },
    });

    io.to(activatedSession.id).emit('reservation_ready', {
        sessionId: activatedSession.id,
        tableId,
        tableNumber: activatedSession.table?.number ?? null,
        message: `Your table ${activatedSession.table?.number ?? ''} is ready for check-in.`.trim(),
    });

    if (activatedSession.customer?.pushToken) {
        await sendPushNotifications([{
            to: activatedSession.customer.pushToken,
            title: `${activatedSession.cafe?.name || 'Cafe'} table ready`,
            body: `Table ${activatedSession.table?.number ?? ''} is ready. Open the app and check in with your reservation code.`.trim(),
            data: {
                type: 'RESERVATION_READY',
                sessionId: activatedSession.id,
                cafeId,
                tableId,
                tableNumber: activatedSession.table?.number ?? null,
            },
        }]);
    }

    return activatedSession;
}
