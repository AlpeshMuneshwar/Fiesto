import React, { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import {
    ArrowLeft,
    Calendar,
    ChevronDown,
    ChevronUp,
    Clock,
    Mail,
    MapPin,
    Phone,
    Search,
    User,
} from 'lucide-react-native';
import client from '../api/client';

const PROFILE_NAME_KEY = 'customerName';
const PROFILE_EMAIL_KEY = 'customerEmail';
const PROFILE_PHONE_KEY = 'customerPhone';
const QUICK_DURATION_OPTIONS = [30, 45, 60, 90, 120];
const BLOCKING_ORDER_STATUSES = ['PENDING_APPROVAL', 'RECEIVED', 'PREPARING', 'READY', 'AWAITING_PICKUP'];

function pad(value: number) {
    return String(value).padStart(2, '0');
}

function toDateInput(date: Date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toTimeInput(date: Date) {
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseDateTime(dateInput: string, timeInput: string) {
    const dateMatch = /^\d{4}-\d{2}-\d{2}$/.test(dateInput);
    const timeMatch = /^\d{2}:\d{2}$/.test(timeInput);
    if (!dateMatch || !timeMatch) return null;

    const [year, month, day] = dateInput.split('-').map((n) => parseInt(n, 10));
    const [hour, minute] = timeInput.split(':').map((n) => parseInt(n, 10));
    const date = new Date(year, month - 1, day, hour, minute, 0, 0);
    return Number.isNaN(date.getTime()) ? null : date;
}

function toTimeLabel(date: Date) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatWindow(startAt: Date | string, durationMinutes: number) {
    const start = typeof startAt === 'string' ? new Date(startAt) : new Date(startAt);
    if (Number.isNaN(start.getTime())) return '--';
    const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
    return `${start.toLocaleDateString()} ${toTimeLabel(start)} - ${toTimeLabel(end)}`;
}

function isBlockingBookingForCafe(booking: any, cafeId?: string) {
    if (!booking || !cafeId || booking.cafeId !== cafeId) {
        return false;
    }

    if (['MISSED', 'COMPLETED'].includes(booking.reservationStatus)) {
        return false;
    }

    if (['AWAITING_APPROVAL', 'APPROVED_PAYMENT_PENDING', 'APPROVED_PAYMENT_COMPLETED'].includes(booking.approvalDisplayStatus)) {
        return true;
    }

    if (['QUEUED', 'READY_FOR_CHECKIN', 'CHECKED_IN', 'ACTIVE'].includes(booking.reservationStatus)) {
        return true;
    }

    const latestStatus = booking.latestOrder?.status;
    return Boolean(latestStatus && BLOCKING_ORDER_STATUSES.includes(latestStatus));
}

function formatBlockingBookingText(booking: any) {
    const slotTimeRaw = booking?.slotStartAt || booking?.scheduledAt || booking?.session?.scheduledAt || booking?.createdAt || null;
    const slotTime = slotTimeRaw ? new Date(slotTimeRaw) : null;
    const when = slotTime && !Number.isNaN(slotTime.getTime()) ? slotTime.toLocaleString() : '--';
    const status = String(
        booking?.approvalDisplayStatus
        || booking?.latestOrder?.status
        || booking?.status
        || booking?.reservationStatus
        || 'PENDING'
    ).replace(/_/g, ' ');
    return `You already have a booking at this cafe (${status}). Scheduled around ${when}. Complete or cancel it before creating another booking.`;
}

export default function CafeDetailsScreen({ route, navigation }: any) {
    const cafe = route.params?.cafe;
    const oneHourLater = useMemo(() => {
        const date = new Date(Date.now() + 60 * 60 * 1000);
        date.setMinutes(Math.ceil(date.getMinutes() / 15) * 15, 0, 0);
        return date;
    }, []);

    const [plannerMode, setPlannerMode] = useState<'preorder' | 'takeaway'>('preorder');
    const [loading, setLoading] = useState(true);
    const [tableLoading, setTableLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const [menuItems, setMenuItems] = useState<any[]>([]);
    const [tablesWithSchedule, setTablesWithSchedule] = useState<any[]>([]);
    const [businessOpenTime, setBusinessOpenTime] = useState('08:00');
    const [businessCloseTime, setBusinessCloseTime] = useState('22:00');
    const [selectedTableId, setSelectedTableId] = useState<string | null>(null);

    const [partySize, setPartySize] = useState('2');
    const [scheduledDate, setScheduledDate] = useState(toDateInput(oneHourLater));
    const [scheduledTime, setScheduledTime] = useState(toTimeInput(oneHourLater));
    const [customHours, setCustomHours] = useState('1');
    const [customMinutes, setCustomMinutes] = useState('0');
    const [specialInstructions, setSpecialInstructions] = useState('');

    const [customerName, setCustomerName] = useState('');
    const [customerEmail, setCustomerEmail] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [authIdentity, setAuthIdentity] = useState<{ name?: string; email?: string; phoneNumber?: string } | null>(null);
    const [editingIdentity, setEditingIdentity] = useState(false);

    const [menuSearch, setMenuSearch] = useState('');
    const [activeCategory, setActiveCategory] = useState('All');
    const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});

    const [cart, setCart] = useState<{ id: string; name: string; price: number; quantity: number }[]>([]);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
    const [tableLoadError, setTableLoadError] = useState<string | null>(null);
    const [existingCafeBooking, setExistingCafeBooking] = useState<any | null>(null);

    const slotMinutes = useMemo(() => {
        const h = parseInt(customHours, 10) || 0;
        const m = parseInt(customMinutes, 10) || 0;
        const total = h * 60 + m;
        if (total === 0) return 60; // fallback
        return Math.max(20, Math.min(360, total));
    }, [customHours, customMinutes]);

    const scheduledDateTime = useMemo(
        () => parseDateTime(scheduledDate, scheduledTime),
        [scheduledDate, scheduledTime]
    );
    const scheduledAtIso = scheduledDateTime?.toISOString() || '';

    const generatedTimeSlots = useMemo(() => {
        if (!selectedTableId || plannerMode !== 'preorder') return [];
        
        const table = tablesWithSchedule.find(t => t.id === selectedTableId);
        if (!table) return [];

        const [openHour, openMin] = businessOpenTime.split(':').map(Number);
        const [closeHour, closeMin] = businessCloseTime.split(':').map(Number);
        
        const targetDate = parseDateTime(scheduledDate, '00:00');
        if (!targetDate) return [];

        const startTime = new Date(targetDate);
        startTime.setHours(openHour, openMin, 0, 0);
        
        const endTime = new Date(targetDate);
        endTime.setHours(closeHour, closeMin, 0, 0);
        if (endTime < startTime) endTime.setDate(endTime.getDate() + 1);

        const now = new Date();
        const slots: { time: string, disabled: boolean }[] = [];
        
        let current = new Date(startTime);
        
        while (current < endTime) {
            const slotStart = new Date(current);
            const slotEnd = new Date(current.getTime() + slotMinutes * 60 * 1000);
            
            let disabled = false;
            
            if (slotStart.getTime() <= now.getTime()) {
                disabled = true; // Past time
            } else if (slotEnd > endTime) {
                disabled = true; // Exceeds closing time
            } else {
                for (const booking of table.bookedSlots || []) {
                    const bStart = new Date(booking.start).getTime();
                    const bEnd = new Date(booking.end).getTime();
                    // Overlap: start before booking ends AND end after booking starts
                    if (slotStart.getTime() < bEnd && slotEnd.getTime() > bStart) {
                        disabled = true;
                        break;
                    }
                }
            }
            
            slots.push({ time: toTimeInput(slotStart), disabled });
            current.setMinutes(current.getMinutes() + 15);
        }
        
        return slots;
    }, [scheduledDate, businessOpenTime, businessCloseTime, selectedTableId, slotMinutes, tablesWithSchedule, plannerMode]);

    const takeawayTimeSlots = useMemo(() => {
        if (plannerMode !== 'takeaway') return [];

        const [openHour, openMin] = businessOpenTime.split(':').map(Number);
        const [closeHour, closeMin] = businessCloseTime.split(':').map(Number);
        
        const targetDate = parseDateTime(scheduledDate, '00:00');
        if (!targetDate) return [];

        const startTime = new Date(targetDate);
        startTime.setHours(openHour, openMin, 0, 0);
        
        const endTime = new Date(targetDate);
        endTime.setHours(closeHour, closeMin, 0, 0);
        if (endTime < startTime) endTime.setDate(endTime.getDate() + 1);

        const now = new Date();
        const slots: { time: string, disabled: boolean }[] = [];
        
        let current = new Date(startTime);
        
        while (current < endTime) {
            const slotStart = new Date(current);
            let disabled = false;
            if (slotStart.getTime() <= now.getTime() + 15 * 60 * 1000) {
                // Must order at least 15 mins in advance
                disabled = true;
            }
            slots.push({ time: toTimeInput(slotStart), disabled });
            current.setMinutes(current.getMinutes() + 15);
        }
        
        return slots;
    }, [scheduledDate, businessOpenTime, businessCloseTime, plannerMode]);

    const groupedMenu = useMemo(() => {
        const search = menuSearch.trim().toLowerCase();
        const filtered = !search
            ? menuItems
            : menuItems.filter((item) =>
                item.name.toLowerCase().includes(search) ||
                (item.category || 'General').toLowerCase().includes(search)
            );

        const grouped: Record<string, any[]> = {};
        filtered.forEach((item) => {
            const category = item.category || 'General';
            if (!grouped[category]) grouped[category] = [];
            grouped[category].push(item);
        });
        return grouped;
    }, [menuItems, menuSearch]);

    const categoryList = useMemo(() => ['All', ...Object.keys(groupedMenu).sort()], [groupedMenu]);
    const visibleCategories = useMemo(() => {
        const all = Object.keys(groupedMenu).sort();
        return activeCategory === 'All' ? all : all.filter((category) => category === activeCategory);
    }, [groupedMenu, activeCategory]);

    useEffect(() => {
        load();
    }, []);

    useEffect(() => {
        if (plannerMode === 'preorder') {
            loadTables();
        }
    }, [plannerMode, partySize, scheduledDate]);

    // Clear selected time if table or duration changes
    useEffect(() => {
        setScheduledTime('');
    }, [selectedTableId, slotMinutes]);

    useEffect(() => {
        if (!categoryList.includes(activeCategory)) {
            setActiveCategory('All');
        }
    }, [categoryList, activeCategory]);

    async function load() {
        setLoading(true);
        try {
            const bookingsRequest = client.get('/customer/bookings').catch(() => ({ data: [] as any[] }));
            const [menuRes, profile, storedUserRaw, bookingsRes] = await Promise.all([
                client.get(`/menu?cafeId=${cafe.id}`),
                AsyncStorage.multiGet([PROFILE_NAME_KEY, PROFILE_EMAIL_KEY, PROFILE_PHONE_KEY]),
                AsyncStorage.getItem('user'),
                bookingsRequest,
            ]);

            let storedUser: any = null;
            try {
                storedUser = storedUserRaw ? JSON.parse(storedUserRaw) : null;
            } catch {
                storedUser = null;
            }

            setMenuItems((menuRes.data || []).filter((item: any) => item.isAvailable !== false && item.isActive !== false));
            const derivedName = profile[0]?.[1] || storedUser?.name || '';
            const derivedEmail = profile[1]?.[1] || storedUser?.email || '';
            const derivedPhone = profile[2]?.[1] || storedUser?.phoneNumber || '';
            setCustomerName(derivedName);
            setCustomerEmail(derivedEmail);
            setCustomerPhone(derivedPhone);
            setAuthIdentity(storedUser ? { name: storedUser.name, email: storedUser.email, phoneNumber: storedUser.phoneNumber } : null);

            const customerBookings = Array.isArray((bookingsRes as any)?.data) ? (bookingsRes as any).data : [];
            const blockingBooking = customerBookings.find((booking: any) => isBlockingBookingForCafe(booking, cafe.id)) || null;
            setExistingCafeBooking(blockingBooking);
            await loadTables();
        } catch (error: any) {
            Alert.alert('Error', error.response?.data?.error || 'Failed to load cafe details.');
        } finally {
            setLoading(false);
        }
    }

    async function loadTables() {
        if (!cafe?.id || plannerMode !== 'preorder') return;

        if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate)) {
            setTableLoadError('Enter valid date like 2026-04-25');
            setTablesWithSchedule([]);
            setSelectedTableId(null);
            return;
        }

        setTableLoading(true);
        try {
            setTableLoadError(null);
            const res = await client.get(
                `/discover/cafes/${cafe.id}/daily-tables?partySize=${Math.max(1, parseInt(partySize || '1', 10))}&date=${scheduledDate}`
            );

            const tables = res.data.tables || [];
            setTablesWithSchedule(tables);
            if (res.data.businessOpenTime) setBusinessOpenTime(res.data.businessOpenTime);
            if (res.data.businessCloseTime) setBusinessCloseTime(res.data.businessCloseTime);

            const valid = new Set(tables.map((table: any) => table.id));
            const fallback = tables?.[0]?.id || null;
            setSelectedTableId((current) => (current && valid.has(current) ? current : fallback));
        } catch {
            setTablesWithSchedule([]);
            setSelectedTableId(null);
            setTableLoadError('Could not load table schedule. Check server and retry.');
        } finally {
            setTableLoading(false);
        }
    }

    function addCart(item: any, delta: number) {
        setCart((previous) => {
            const existing = previous.find((entry) => entry.id === item.id);
            if (!existing && delta > 0) {
                return [...previous, { id: item.id, name: item.name, price: Number(item.price || 0), quantity: 1 }];
            }
            return previous
                .map((entry) => {
                    if (entry.id !== item.id) return entry;
                    const nextQty = entry.quantity + delta;
                    return nextQty > 0 ? { ...entry, quantity: nextQty } : null;
                })
                .filter(Boolean) as any[];
        });
    }

    function toggleCategory(category: string) {
        setCollapsedCategories((prev) => ({ ...prev, [category]: !prev[category] }));
    }

    const subtotal = useMemo(() => cart.reduce((sum, item) => sum + item.price * item.quantity, 0), [cart]);
    const platformFee = cafe?.settings?.platformFeeAmount || 0;
    const advanceRate = cafe?.settings?.preOrderAdvanceRate || 0;
    const payNow = subtotal * (advanceRate / 100) + platformFee;

    const selectedTable = useMemo(
        () => tablesWithSchedule.find((table) => table.id === selectedTableId) || null,
        [tablesWithSchedule, selectedTableId]
    );

    const finalName = (customerName || authIdentity?.name || '').trim();
    const finalEmail = (customerEmail || authIdentity?.email || '').trim().toLowerCase();
    const finalPhone = (customerPhone || authIdentity?.phoneNumber || '').trim();

    async function submit() {
        setSubmitError(null);
        setSubmitSuccess(null);

        if (existingCafeBooking) {
            setSubmitError('You already have a pending or active booking at this cafe. Complete or cancel it before creating another booking.');
            return;
        }

        if (!finalName || !finalEmail || !finalPhone) {
            setSubmitError('Name, email, and phone are required for preorder or takeaway.');
            setEditingIdentity(true);
            return;
        }
        if (!scheduledDateTime) {
            setSubmitError('Enter valid booking date and time.');
            return;
        }
        if (cart.length === 0) {
            setSubmitError('Select at least one menu item.');
            return;
        }
        if (plannerMode === 'preorder' && !selectedTableId) {
            setSubmitError('Select a table before confirming preorder.');
            return;
        }

        setSubmitting(true);
        try {
            await AsyncStorage.multiSet([
                [PROFILE_NAME_KEY, finalName],
                [PROFILE_EMAIL_KEY, finalEmail],
                [PROFILE_PHONE_KEY, finalPhone],
            ]);

            if (plannerMode === 'takeaway') {
                const res = await client.post(`/discover/cafes/${cafe.id}/takeaway`, {
                    items: cart,
                    specialInstructions: specialInstructions.trim() || undefined,
                    customerName: finalName,
                    customerEmail: finalEmail,
                    customerPhone: finalPhone,
                    pickupTime: scheduledAtIso,
                });

                const queueRank = res.data.queuePosition || 0;
                const readyTime = res.data.estimatedReadyAt ? new Date(res.data.estimatedReadyAt) : null;
                const message = `Takeaway request submitted for owner/manager approval. Queue #${queueRank}${readyTime ? ` | Est. ready ${toTimeLabel(readyTime)}` : ''}. Pay deposit within 1 hour after approval.`;
                setSubmitSuccess(message);
                if (Platform.OS === 'web') window.alert(message);
            } else {
                const res = await client.post(`/discover/cafes/${cafe.id}/pre-order`, {
                    tableId: selectedTableId,
                    partySize: Math.max(1, parseInt(partySize || '1', 10)),
                    scheduledAt: scheduledAtIso,
                    bookingDurationMinutes: slotMinutes,
                    items: cart,
                    specialInstructions: specialInstructions.trim() || undefined,
                    customerName: finalName,
                    customerEmail: finalEmail,
                    customerPhone: finalPhone,
                });

                const queuePosition = res.data.queuePosition || 0;
                const assignedStart = res.data.assignedStartAt ? new Date(res.data.assignedStartAt) : scheduledDateTime;
                const assignedDuration = res.data.bookingDurationMinutes || slotMinutes;
                const slotLabel = formatWindow(assignedStart, assignedDuration);
                const message = queuePosition > 0
                    ? `Preorder queued at rank #${queuePosition}. Assigned slot: ${slotLabel}. Owner/manager approval is required before payment.`
                    : `Preorder request submitted. Your slot: ${slotLabel}. Owner/manager approval is required before payment.`;

                setSubmitSuccess(message);
                if (Platform.OS === 'web') window.alert(message);
                await loadTables();
            }
        } catch (error: any) {
            console.error('[CafeDetails submit error]', error?.response?.data || error);
            setSubmitError(error.response?.data?.error || 'Could not complete booking.');
            if (error?.response?.data?.code === 'EXISTING_ACTIVE_BOOKING') {
                setExistingCafeBooking((prev: any) => prev || { ...error.response.data.existingBooking, cafeId: cafe.id });
            }
        } finally {
            setSubmitting(false);
        }
    }

    if (!cafe) {
        return (
            <View style={styles.center}>
                <Text style={styles.title}>Cafe not found</Text>
            </View>
        );
    }

    if (loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color="#111827" />
            </View>
        );
    }


    return (
        <View style={styles.screen}>
            <StatusBar style="dark" />
            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
                <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
                    <ArrowLeft size={16} color="#0F172A" />
                    <Text style={styles.backText}>Back to discovery</Text>
                </TouchableOpacity>

                <Image
                    source={{ uri: cafe.coverImage || cafe.featuredImage || 'https://images.unsplash.com/photo-1445116572660-236099ec97a0?q=80&w=1200' }}
                    style={styles.hero}
                />

                <View style={styles.headerCard}>
                    <Text style={styles.title}>{cafe.name}</Text>
                    <View style={styles.metaRow}>
                        <MapPin size={14} color="#64748B" />
                        <Text style={styles.metaText}>{cafe.address || cafe.city || 'Location unavailable'}</Text>
                    </View>
                </View>

                {existingCafeBooking ? (
                    <View style={styles.activeBookingBanner}>
                        <Text style={styles.activeBookingTitle}>Existing Booking Found</Text>
                        <Text style={styles.activeBookingText}>{formatBlockingBookingText(existingCafeBooking)}</Text>
                    </View>
                ) : null}

                <View style={styles.segmentRow}>
                    <TouchableOpacity style={[styles.segment, plannerMode === 'preorder' && styles.segmentActive]} onPress={() => setPlannerMode('preorder')}>
                        <Text style={[styles.segmentText, plannerMode === 'preorder' && styles.segmentTextActive]}>Dine-in / Preorder</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.segment, plannerMode === 'takeaway' && styles.segmentActive]} onPress={() => setPlannerMode('takeaway')}>
                        <Text style={[styles.segmentText, plannerMode === 'takeaway' && styles.segmentTextActive]}>Takeaway</Text>
                    </TouchableOpacity>
                </View>

                {/* STEP 1: WHEN & WHERE */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>1. {plannerMode === 'preorder' ? 'Table Reservation' : 'Pickup Details'}</Text>
                    
                    {plannerMode === 'preorder' ? (
                        <>
                            <View style={styles.gridRow}>
                                <View style={styles.gridItem}>
                                    <View style={styles.labelRow}><User size={14} color="#64748B" /><Text style={styles.labelText}>Guests</Text></View>
                                    <View style={[styles.qtyRow, { marginBottom: 10, justifyContent: 'center' }]}>
                                        <TouchableOpacity style={styles.qtyBtn} onPress={() => {
                                            const num = parseInt(partySize, 10) || 1;
                                            if (num > 1) setPartySize(String(num - 1));
                                        }}>
                                            <Text style={styles.qtyText}>-</Text>
                                        </TouchableOpacity>
                                        <Text style={styles.qtyValueLarge}>{partySize}</Text>
                                        <TouchableOpacity style={styles.qtyBtn} onPress={() => {
                                            const num = parseInt(partySize, 10) || 1;
                                            if (num < 20) setPartySize(String(num + 1));
                                        }}>
                                            <Text style={styles.qtyText}>+</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                                <View style={styles.gridItem}>
                                    <View style={styles.labelRow}><Calendar size={14} color="#64748B" /><Text style={styles.labelText}>Date</Text></View>
                                    <TextInput
                                        style={styles.input}
                                        value={scheduledDate}
                                        onChangeText={setScheduledDate}
                                        placeholder="YYYY-MM-DD"
                                        placeholderTextColor="#94A3B8"
                                    />
                                </View>
                            </View>

                            <View style={styles.divider} />
                            <View style={styles.durationHeader}>
                                <Text style={styles.subSectionTitle}>Select Table</Text>
                                {tableLoading && <ActivityIndicator size="small" color="#111827" />}
                            </View>
                            
                            {tableLoadError ? <Text style={styles.errorText}>{tableLoadError}</Text> : null}
                            {tablesWithSchedule.length === 0 && !tableLoading ? (
                                <Text style={styles.emptyInlineText}>No tables available for this party size.</Text>
                            ) : null}
                            
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.timeSuggestionRow}>
                                {tablesWithSchedule.map((table) => (
                                    <TouchableOpacity
                                        key={table.id}
                                        style={[styles.chip, selectedTableId === table.id && styles.chipActive]}
                                        onPress={() => setSelectedTableId(table.id)}
                                    >
                                        <Text style={[styles.chipText, selectedTableId === table.id && styles.chipTextActive]}>Table {table.number}</Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>

                            <View style={styles.divider} />
                            <View style={styles.durationHeader}>
                                <Text style={styles.subSectionTitle}>Duration</Text>
                                <Text style={styles.durationValue}>{slotMinutes} min</Text>
                            </View>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.timeSuggestionRow}>
                                {QUICK_DURATION_OPTIONS.map((minutes) => (
                                    <TouchableOpacity
                                        key={minutes}
                                        style={[styles.chip, slotMinutes === minutes && styles.chipActive]}
                                        onPress={() => {
                                            setCustomHours(String(Math.floor(minutes / 60)));
                                            setCustomMinutes(String(minutes % 60));
                                        }}
                                    >
                                        <Text style={[styles.chipText, slotMinutes === minutes && styles.chipTextActive]}>{minutes}m</Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>

                            <View style={styles.gridRow}>
                                <View style={styles.gridItem}>
                                    <View style={styles.labelRow}><Clock size={14} color="#64748B" /><Text style={styles.labelText}>Hours</Text></View>
                                    <TextInput
                                        style={styles.input}
                                        value={customHours}
                                        onChangeText={setCustomHours}
                                        placeholder="0"
                                        placeholderTextColor="#94A3B8"
                                        keyboardType="number-pad"
                                    />
                                </View>
                                <View style={styles.gridItem}>
                                    <View style={styles.labelRow}><Clock size={14} color="#64748B" /><Text style={styles.labelText}>Minutes</Text></View>
                                    <TextInput
                                        style={styles.input}
                                        value={customMinutes}
                                        onChangeText={setCustomMinutes}
                                        placeholder="0"
                                        placeholderTextColor="#94A3B8"
                                        keyboardType="number-pad"
                                    />
                                </View>
                            </View>

                            <View style={styles.divider} />
                            <Text style={styles.subSectionTitle}>Select Time</Text>
                            
                            {selectedTableId ? (
                                generatedTimeSlots.length === 0 ? (
                                    <Text style={styles.emptyInlineText}>No time slots available today for this duration.</Text>
                                ) : (
                                    <View style={styles.chipGrid}>
                                        {generatedTimeSlots.map((slot) => (
                                            <TouchableOpacity
                                                key={slot.time}
                                                style={[
                                                    styles.chip,
                                                    styles.gridChip,
                                                    slot.disabled && styles.chipDisabled,
                                                    scheduledTime === slot.time && !slot.disabled && styles.chipActive
                                                ]}
                                                onPress={() => {
                                                    if (!slot.disabled) setScheduledTime(slot.time);
                                                }}
                                                disabled={slot.disabled}
                                            >
                                                <Text style={[
                                                    styles.chipText,
                                                    slot.disabled && styles.chipTextDisabled,
                                                    scheduledTime === slot.time && !slot.disabled && styles.chipTextActive
                                                ]}>
                                                    {slot.time}
                                                </Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                )
                            ) : (
                                <Text style={styles.emptyInlineText}>Please select a table to view available times.</Text>
                            )}
                        </>
                    ) : (
                        <>
                            <View style={styles.gridRow}>
                                <View style={styles.gridItem}>
                                    <View style={styles.labelRow}><Calendar size={14} color="#64748B" /><Text style={styles.labelText}>Date</Text></View>
                                    <TextInput
                                        style={styles.input}
                                        value={scheduledDate}
                                        onChangeText={setScheduledDate}
                                        placeholder="YYYY-MM-DD"
                                        placeholderTextColor="#94A3B8"
                                    />
                                </View>
                            </View>
                            
                            <View style={styles.divider} />
                            <Text style={styles.subSectionTitle}>Pickup Time</Text>
                            
                            {takeawayTimeSlots.length === 0 ? (
                                <Text style={styles.emptyInlineText}>No pickup times available.</Text>
                            ) : (
                                <View style={styles.chipGrid}>
                                    {takeawayTimeSlots.map((slot) => (
                                        <TouchableOpacity
                                            key={slot.time}
                                            style={[
                                                styles.chip,
                                                styles.gridChip,
                                                slot.disabled && styles.chipDisabled,
                                                scheduledTime === slot.time && !slot.disabled && styles.chipActive
                                            ]}
                                            onPress={() => {
                                                if (!slot.disabled) setScheduledTime(slot.time);
                                            }}
                                            disabled={slot.disabled}
                                        >
                                            <Text style={[
                                                styles.chipText,
                                                slot.disabled && styles.chipTextDisabled,
                                                scheduledTime === slot.time && !slot.disabled && styles.chipTextActive
                                            ]}>
                                                {slot.time}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            )}
                        </>
                    )}
                    
                    <View style={styles.divider} />
                    <View style={styles.slotSummary}>
                        <Text style={styles.slotSummaryTitle}>{plannerMode === 'preorder' ? 'Planned table window' : 'Planned pickup time'}</Text>
                        <Text style={styles.slotSummaryText}>
                            {scheduledDateTime ? (plannerMode === 'preorder' ? formatWindow(scheduledDateTime, slotMinutes) : `${scheduledDateTime.toLocaleDateString()} ${toTimeLabel(scheduledDateTime)}`) : 'Select date and time'}
                        </Text>
                    </View>
                </View>

                {/* STEP 2: MENU */}
                <View style={styles.card}>
                    <View style={styles.rowBetween}>
                        <Text style={styles.cardTitle}>2. Select Items</Text>
                        <Text style={styles.counterText}>{cart.reduce((sum, item) => sum + item.quantity, 0)} items</Text>
                    </View>

                    <View style={styles.searchWrap}>
                        <Search size={14} color="#94A3B8" />
                        <TextInput
                            style={styles.searchInput}
                            value={menuSearch}
                            onChangeText={setMenuSearch}
                            placeholder="Search menu or category"
                            placeholderTextColor="#94A3B8"
                        />
                    </View>

                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.timeSuggestionRow}>
                        {categoryList.map((category) => (
                            <TouchableOpacity
                                key={category}
                                style={[styles.chip, activeCategory === category && styles.chipActive]}
                                onPress={() => setActiveCategory(category)}
                            >
                                <Text style={[styles.chipText, activeCategory === category && styles.chipTextActive]}>{category}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>

                    {visibleCategories.length === 0 ? <Text style={styles.emptyInlineText}>No items found for this filter.</Text> : null}

                    {visibleCategories.map((category) => {
                        const items = groupedMenu[category] || [];
                        const collapsed = Boolean(collapsedCategories[category]);

                        return (
                            <View key={category} style={styles.categoryBlock}>
                                <TouchableOpacity style={styles.categoryHeader} onPress={() => toggleCategory(category)}>
                                    <Text style={styles.categoryTitle}>{category}</Text>
                                    <View style={styles.categoryHeaderRight}>
                                        <Text style={styles.categoryCount}>{items.length}</Text>
                                        {collapsed ? <ChevronDown size={16} color="#64748B" /> : <ChevronUp size={16} color="#64748B" />}
                                    </View>
                                </TouchableOpacity>

                                {!collapsed && items.map((item) => {
                                    const qty = cart.find((x) => x.id === item.id)?.quantity || 0;
                                    return (
                                        <View key={item.id} style={styles.menuRow}>
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.menuName}>{item.name}</Text>
                                                <Text style={styles.menuMeta}>Rs. {Number(item.price || 0).toFixed(0)}</Text>
                                            </View>
                                            <View style={styles.qtyRow}>
                                                <TouchableOpacity style={styles.qtyBtn} onPress={() => addCart(item, -1)}>
                                                    <Text style={styles.qtyText}>-</Text>
                                                </TouchableOpacity>
                                                <Text style={styles.qtyValue}>{qty}</Text>
                                                <TouchableOpacity style={styles.qtyBtn} onPress={() => addCart(item, 1)}>
                                                    <Text style={styles.qtyText}>+</Text>
                                                </TouchableOpacity>
                                            </View>
                                        </View>
                                    );
                                })}
                            </View>
                        );
                    })}

                    <TextInput
                        style={[styles.input, { minHeight: 84 }]}
                        value={specialInstructions}
                        onChangeText={setSpecialInstructions}
                        placeholder="Special instructions"
                        placeholderTextColor="#94A3B8"
                        multiline
                    />
                </View>

                {/* STEP 3: IDENTITY */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>3. Your Details</Text>
                    {authIdentity?.email && !editingIdentity ? (
                        <>
                            <View style={styles.identityRow}><User size={14} color="#64748B" /><Text style={styles.identityText}>{finalName || authIdentity.name || '-'}</Text></View>
                            <View style={styles.identityRow}><Mail size={14} color="#64748B" /><Text style={styles.identityText}>{finalEmail || authIdentity.email || '-'}</Text></View>
                            <View style={styles.identityRow}><Phone size={14} color="#64748B" /><Text style={styles.identityText}>{finalPhone || authIdentity.phoneNumber || '-'}</Text></View>
                            <TouchableOpacity style={styles.linkBtn} onPress={() => setEditingIdentity(true)}>
                                <Text style={styles.linkText}>Use different details</Text>
                            </TouchableOpacity>
                        </>
                    ) : (
                        <>
                            <TextInput
                                style={styles.input}
                                value={customerName}
                                onChangeText={setCustomerName}
                                placeholder="Your name"
                                placeholderTextColor="#94A3B8"
                            />
                            <TextInput
                                style={styles.input}
                                value={customerEmail}
                                onChangeText={setCustomerEmail}
                                placeholder="Your email"
                                placeholderTextColor="#94A3B8"
                                autoCapitalize="none"
                            />
                            <TextInput
                                style={styles.input}
                                value={customerPhone}
                                onChangeText={setCustomerPhone}
                                placeholder="Your phone number"
                                placeholderTextColor="#94A3B8"
                                keyboardType="phone-pad"
                            />
                            {authIdentity?.email ? (
                                <TouchableOpacity style={styles.linkBtn} onPress={() => setEditingIdentity(false)}>
                                    <Text style={styles.linkText}>Use logged-in account details</Text>
                                </TouchableOpacity>
                            ) : null}
                        </>
                    )}
                </View>



                <View style={styles.summary}>
                    <Text style={styles.summaryLine}>Subtotal: Rs. {subtotal.toFixed(2)}</Text>
                    <Text style={styles.summaryLine}>Advance: {advanceRate}%</Text>
                    <Text style={styles.summaryLine}>Platform fee: Rs. {platformFee.toFixed(2)}</Text>
                    <Text style={styles.summaryTotal}>Pay now: Rs. {payNow.toFixed(2)}</Text>
                </View>

                {submitError ? <Text style={styles.errorText}>{submitError}</Text> : null}
                {submitSuccess ? <Text style={styles.successText}>{submitSuccess}</Text> : null}

                <TouchableOpacity style={styles.confirmBtn} onPress={submit} disabled={submitting}>
                    <Text style={styles.confirmText}>{submitting ? 'Processing...' : `Confirm ${plannerMode === 'preorder' ? 'Preorder' : 'Takeaway'}`}</Text>
                </TouchableOpacity>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: '#F1F5F9' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    scroll: { padding: 14, paddingBottom: 30 },
    backBtn: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginBottom: 10 },
    backText: { marginLeft: 6, color: '#0F172A', fontWeight: '700' },
    hero: { width: '100%', height: 200, borderRadius: 20, marginBottom: 10, backgroundColor: '#E2E8F0' },
    headerCard: { backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 1, borderColor: '#E2E8F0', padding: 14, marginBottom: 10 },
    title: { color: '#0F172A', fontSize: 30, fontWeight: '900' },
    metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
    metaText: { marginLeft: 6, color: '#64748B', fontWeight: '600' },

    segmentRow: { flexDirection: 'row', marginBottom: 10 },
    segment: { flex: 1, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF', borderRadius: 999, paddingVertical: 11, alignItems: 'center', marginRight: 8 },
    segmentActive: { backgroundColor: '#111827', borderColor: '#111827' },
    segmentText: { color: '#334155', fontWeight: '800' },
    segmentTextActive: { color: '#FFFFFF' },

    card: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 18, padding: 14, marginBottom: 10 },
    cardTitle: { color: '#0F172A', fontSize: 19, fontWeight: '900', marginBottom: 10 },
    gridRow: { flexDirection: 'row' },
    gridItem: { flex: 1, marginRight: 8 },
    labelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
    labelText: { marginLeft: 6, color: '#64748B', fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
    input: { borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 12, backgroundColor: '#FFFFFF', color: '#0F172A', paddingHorizontal: 12, paddingVertical: 11, marginBottom: 10, fontWeight: '600' },

    timeSuggestionRow: { paddingBottom: 8 },
    chip: { borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, marginRight: 8, marginBottom: 8 },
    chipActive: { borderColor: '#111827', backgroundColor: '#111827' },
    chipDisabled: { borderColor: '#E2E8F0', backgroundColor: '#F8FAFC' },
    chipText: { color: '#334155', fontWeight: '700' },
    chipTextActive: { color: '#FFFFFF' },
    chipTextDisabled: { color: '#94A3B8' },
    chipGrid: { flexDirection: 'row', flexWrap: 'wrap' },
    gridChip: { marginRight: 6, marginBottom: 6 },
    durationHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
    durationValue: { color: '#111827', fontWeight: '900', fontSize: 13 },
    divider: { height: 1, backgroundColor: '#E2E8F0', marginVertical: 14 },

    slotSummary: { borderRadius: 12, borderWidth: 1, borderColor: '#DBEAFE', backgroundColor: '#EFF6FF', padding: 10, marginTop: 2 },
    slotSummaryTitle: { color: '#1D4ED8', fontWeight: '800', marginBottom: 4 },
    slotSummaryText: { color: '#1E3A8A', fontWeight: '700' },
    identityRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
    identityText: { marginLeft: 8, color: '#0F172A', fontWeight: '700' },
    linkBtn: { alignSelf: 'flex-start', marginTop: 2 },
    linkText: { color: '#0F766E', fontWeight: '700' },

    rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    smallBtn: { borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 10, backgroundColor: '#FFFFFF', paddingHorizontal: 10, paddingVertical: 6 },
    smallBtnText: { color: '#0F172A', fontWeight: '700' },
    subSectionTitle: { color: '#334155', fontWeight: '800', marginTop: 2, marginBottom: 8, textTransform: 'uppercase', fontSize: 12 },
    tableCard: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, backgroundColor: '#FFFFFF', padding: 10, marginBottom: 8 },
    tableCardActive: { borderColor: '#111827', backgroundColor: '#F8FAFC' },
    tableName: { color: '#0F172A', fontWeight: '900', marginBottom: 3 },
    tableMeta: { color: '#64748B', fontWeight: '600' },

    searchWrap: { borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 12, backgroundColor: '#FFFFFF', paddingHorizontal: 10, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
    searchInput: { flex: 1, marginLeft: 8, color: '#0F172A', fontWeight: '600' },
    counterText: { color: '#475569', fontWeight: '700' },

    categoryBlock: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, padding: 10, marginBottom: 8, backgroundColor: '#F8FAFC' },
    categoryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    categoryHeaderRight: { flexDirection: 'row', alignItems: 'center' },
    categoryTitle: { color: '#0F172A', fontWeight: '900' },
    categoryCount: { color: '#334155', borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, marginRight: 6, fontWeight: '700', fontSize: 12 },
    menuRow: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, backgroundColor: '#FFFFFF', padding: 10, marginBottom: 8, flexDirection: 'row', alignItems: 'center' },
    menuName: { color: '#0F172A', fontWeight: '800' },
    menuMeta: { color: '#64748B', marginTop: 2, fontWeight: '600' },
    qtyRow: { flexDirection: 'row', alignItems: 'center' },
    qtyBtn: { width: 30, height: 30, borderRadius: 9, backgroundColor: '#111827', alignItems: 'center', justifyContent: 'center' },
    qtyText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
    qtyValue: { minWidth: 24, textAlign: 'center', color: '#0F172A', fontWeight: '900' },
    qtyValueLarge: { minWidth: 40, textAlign: 'center', color: '#0F172A', fontWeight: '900', fontSize: 18 },
    partySizeContainer: { marginBottom: 12, marginTop: 4 },

    summary: { borderRadius: 16, backgroundColor: '#111827', borderWidth: 1, borderColor: '#1F2937', padding: 14, marginBottom: 10 },
    summaryLine: { color: '#CBD5E1', marginBottom: 3, fontWeight: '600' },
    summaryTotal: { color: '#FDE68A', fontSize: 20, fontWeight: '900', marginTop: 4 },
    confirmBtn: { backgroundColor: '#111827', borderWidth: 1, borderColor: '#111827', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
    confirmText: { color: '#FFFFFF', fontWeight: '900', fontSize: 15 },

    errorText: { color: '#B91C1C', fontWeight: '700', marginBottom: 8 },
    successText: { color: '#166534', fontWeight: '700', marginBottom: 8 },
    emptyInlineText: { color: '#64748B', fontWeight: '600', marginBottom: 8 },
    warningBox: { backgroundColor: '#FEF2F2', padding: 10, borderRadius: 8, marginTop: 10, borderWidth: 1, borderColor: '#FCA5A5' },
    warningText: { color: '#B91C1C', fontWeight: '700', fontSize: 13 },
    activeBookingBanner: { backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#FDBA74', borderRadius: 14, padding: 12, marginBottom: 10 },
    activeBookingTitle: { color: '#9A3412', fontWeight: '900', fontSize: 12, textTransform: 'uppercase', marginBottom: 6 },
    activeBookingText: { color: '#9A3412', fontWeight: '700', fontSize: 13, lineHeight: 20 },
});
