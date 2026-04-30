import React, { useState, useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, SafeAreaView, ActivityIndicator, useWindowDimensions, Modal, TextInput, ScrollView, Image, Animated } from 'react-native';
import ResponsiveContainer from '../components/ResponsiveContainer';
import io from 'socket.io-client';
import client, { SOCKET_URL } from '../api/client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import * as Location from 'expo-location';
import { Platform } from 'react-native';

export default function CustomerMenuScreen({ route, navigation }: any) {
    const { 
        sessionId: initialSessionId, 
        isLocationVerified: initialLoc, 
        cafeId: initialCafeId, 
        tableNumber: initialTableNumber, 
        tableId, 
        isPreOrderMode, 
        partySize 
    } = route.params || {};
    const [sessionId, setSessionId] = useState(initialSessionId);
    const [cafeId, setCafeId] = useState(initialCafeId);
    const [tableNumber, setTableNumber] = useState(initialTableNumber);
    const [isLocationVerified, setIsLocationVerified] = useState(initialLoc || false);
    
    // Data States
    const [menuItems, setMenuItems] = useState<any[]>([]);
    const [settings, setSettings] = useState<any>(null);
    const [cafe, setCafe] = useState<any>(null);
    
    // UI States
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [cartModalVisible, setCartModalVisible] = useState(false);
    const [specialInstructions, setSpecialInstructions] = useState('');
    const [isPlacingOrder, setIsPlacingOrder] = useState(false);
    const [isRequestingCheckout, setIsRequestingCheckout] = useState(false);
    const [isCallingWaiter, setIsCallingWaiter] = useState(false);
    const [currentTableId, setCurrentTableId] = useState(tableId);
    
    // Cart & Order States
    const [cart, setCart] = useState<{ id: string; name: string; price: number; quantity: number }[]>([]);
    const [orders, setOrders] = useState<any[]>([]);
    const [socket, setSocket] = useState<any>(null);
    
    // Session & Auth States
    const [joinCode, setJoinCode] = useState('');
    const [isLocked, setIsLocked] = useState(false);
    const [showJoinModal, setShowJoinModal] = useState(false);
    const [isReservationEntry, setIsReservationEntry] = useState(false);
    const [finalBill, setFinalBill] = useState<any>(null);
    const [history, setHistory] = useState<any[]>([]);
    const [sessionOrdersVisible, setSessionOrdersVisible] = useState(false);
    const [selectedItem, setSelectedItem] = useState<any>(null);
    const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});

    // Animation & Edge Case States
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const [hasViewedOrders, setHasViewedOrders] = useState(true);

    const { width } = useWindowDimensions();
    // Swiggy Psychology: Force 1 column list always, but cap the width on web to 800px so it reads like a premium menu feed instead of a sparse grid.
    const numColumns = 1;

    useEffect(() => {
        const init = async () => {
            const savedCart = await AsyncStorage.getItem(`cart_${cafeId}`);
            if (savedCart) setCart(JSON.parse(savedCart));

            if (cafeId && tableNumber) {
                const savedSessionId = await AsyncStorage.getItem('active_session_id');
                if (savedSessionId) {
                    try {
                        const res = await client.get(`/session/${savedSessionId}`);
                        if (res.data.isActive) {
                            setSessionId(savedSessionId);
                            setOrders(res.data.orders || []);
                            // Ensure we use the cafeId from the session if it's different/more reliable
                            const sidCafeId = res.data.cafeId;
                            initMenuAndSocket(savedSessionId, sidCafeId);
                            return;
                        }
                    } catch (e) { 
                        AsyncStorage.removeItem('active_session_id');
                    }
                }
                
                if (!isPreOrderMode && !sessionId) {
                    autoStartSession();
                } else if (sessionId) {
                    initMenuAndSocket(sessionId);
                }
            } else if (sessionId) {
                // Entry via session only (e.g. from Resume button)
                try {
                    const res = await client.get(`/session/${sessionId}`);
                    if (res.data.isActive) {
                        setOrders(res.data.orders || []);
                        initMenuAndSocket(sessionId, res.data.cafeId);
                    }
                } catch (e) {
                    Alert.alert("Session Expired", "Please scan the QR code again.");
                    navigation.replace('ScanTable');
                }
            }
        };
        init();
    }, [sessionId, cafeId, tableNumber, isPreOrderMode]);

    // Persist cart
    useEffect(() => {
        if (cart.length > 0) {
            AsyncStorage.setItem(`cart_${cafeId}`, JSON.stringify(cart));
        } else {
            AsyncStorage.removeItem(`cart_${cafeId}`);
        }
    }, [cart, cafeId]);

    // Pulse animation logic
    useEffect(() => {
        let loop: any;
        if (!hasViewedOrders && orders.length > 0) {
            loop = Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, { toValue: 1.1, duration: 500, useNativeDriver: true }),
                    Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
                ])
            );
            loop.start();
        } else {
            pulseAnim.setValue(1);
        }
        return () => loop?.stop();
    }, [hasViewedOrders, orders.length, pulseAnim]);

    const autoStartSession = async (providedCode?: string) => {
        try {
            const qrToken = route.params?.qrToken || route.params?.token;
            
            if (!qrToken && !sessionId && !isPreOrderMode) {
                if (Platform.OS === 'web') window.alert('Missing secure table token. Please scan the QR code.');
                else Alert.alert('Security Error', 'Missing secure table token. Please scan the QR code.');
                navigation.replace('ScanTable');
                return;
            }
            
            let deviceId = await AsyncStorage.getItem('deviceId');
            if (!deviceId) {
                try {
                    if (Platform.OS === 'android') deviceId = await Application.getAndroidId();
                    else if (Platform.OS === 'ios') deviceId = await Application.getIosIdForVendorAsync();
                } catch (e) {
                    console.warn("Could not fetch hardware ID", e);
                }
                if (!deviceId) deviceId = Math.random().toString(36).substring(7);
                await AsyncStorage.setItem('deviceId', deviceId);
            }

            const res = await client.post('/session/start', {
                cafeId,
                tableNumber: parseInt(tableNumber),
                qrToken,
                deviceIdentifier: deviceId,
                joinCode: providedCode
            });

            if (res.data.status === 'LOCKED') {
                setIsLocked(true);
                setSessionId(res.data.sessionId);
                setIsReservationEntry(false);
                setJoinCode('');
                setShowJoinModal(true);
                return;
            }

            if (res.data.status === 'RESERVATION_READY') {
                setIsLocked(true);
                setSessionId(res.data.sessionId);
                setIsReservationEntry(true);
                setJoinCode('');
                setShowJoinModal(true);
                return;
            }

            if (res.data.session?.id) {
                const sid = res.data.session.id;
                setSessionId(sid);
                setIsLocked(false);
                setIsReservationEntry(false);
                setShowJoinModal(false);
                AsyncStorage.setItem('active_session_id', sid);
            }
        } catch (error: any) {
            setLoading(false); // Unblock the UI so Modals can render
            
            // Explicitly handle schema validation failures from the backend
            if (error.response?.data?.error === 'Validation failed') {
                const details = error.response.data.details?.map((d: any) => d.message).join('\n') || 'Invalid parameters.';
                if (Platform.OS === 'web') window.alert(`Invalid QR Code: ${details}`);
                else Alert.alert('Invalid QR Code', details);
                navigation.navigate('ScanTable');
                return;
            }

            // Explicitly handle the "join code required" requirement
            if (error.response?.status === 400 && error.response.data?.requiresJoinCode) {
                setIsLocked(false);
                setIsReservationEntry(Boolean(error.response.data?.isReservationEntry));
                if (error.response.data?.sessionId) {
                    setSessionId(error.response.data.sessionId);
                }
                setShowJoinModal(true);
            } else {
                const msg = error.response?.data?.error || error.response?.data?.details?.[0]?.message || error.message || 'Could not open table session.';
                if (Platform.OS === 'web') window.alert(`Session Error: ${msg}`);
                else Alert.alert('Session Error', msg);
                navigation.navigate('ScanTable');
            }
        }
    };

    const handleJoinWithCode = async () => {
        if (!joinCode) return;
        if (!isLocked) {
            autoStartSession(joinCode);
        } else {
            try {
                let deviceId = await AsyncStorage.getItem('deviceId');
                const res = await client.post('/session/join', {
                    sessionId,
                    joinCode,
                    deviceIdentifier: deviceId
                });
                const sid = res.data.session.id;
                setSessionId(sid);
                setShowJoinModal(false);
                setIsReservationEntry(false);
                AsyncStorage.setItem('active_session_id', sid);
            } catch (e: any) {
                const errorMsg = e.response?.data?.details?.[0]?.message || e.response?.data?.error || 'Invalid code';
                Alert.alert('Error', errorMsg);
            }
        }
    };

    const handleForgotCode = async () => {
        try {
            await client.post('/session/forgot-code', { sessionId, cafeId, tableNumber });
            Alert.alert('Waiter Notified', 'The waiter has been notified and will provide your code shortly.');
        } catch (e: any) {
            const errorMsg = e.response?.data?.details?.[0]?.message || e.response?.data?.error || 'Failed to notify waiter.';
            Alert.alert('Error', errorMsg);
        }
    };

    const initMenuAndSocket = async (sid?: string, cid?: string) => {
        const targetId = sid || sessionId;
        if (!targetId) return;

        // Update local cafeId if provided from session
        if (cid) setCafeId(cid);

        // Always fetch existing session orders and table details
        try {
            const sessionRes = await client.get(`/session/${targetId}`);
            if (sessionRes.data.tableId) {
                setCurrentTableId(sessionRes.data.tableId);
            }
            if (sessionRes.data.orders && sessionRes.data.orders.length > 0) {
                setOrders(sessionRes.data.orders);
            }
        } catch (e) {
            console.warn('Could not fetch session orders', e);
        }

        fetchData(cid);
        // Explicitly set role as CUSTOMER so backend middleware allows unauthenticated connection
        const newSocket = io(SOCKET_URL, {
            auth: { role: 'CUSTOMER' },
            transports: ['websocket', 'polling'] // Prefer websocket immediately
        });
        setSocket(newSocket);
        
        const activeCid = cid || cafeId;
        
        // Ensure we rejoin the room if the socket reconnects after backgrounding
        newSocket.on('connect', () => {
            newSocket.emit('join_room', { room: targetId, role: 'CUSTOMER' });
            if (activeCid) {
                newSocket.emit('join_room', { room: `CAFE_${activeCid}`, role: 'CUSTOMER' });
            }
        });

        // Real-time stock / visibility updates
        newSocket.on('menu_item_updated', (updatedItem: any) => {
            setMenuItems(prev => prev.map(m => m.id === updatedItem.id ? updatedItem : m));
        });

        newSocket.on('order_status_update', (data: any) => {
            setOrders(prev => prev.map(o => o.id === data.orderId ? { ...o, status: data.status } : o));
        });

        // Listen for new orders placed by others at the same table
        newSocket.on('new_order', (order: any) => {
            setOrders(prev => {
                if (prev.some(o => o.id === order.id)) return prev;
                return [...prev, order];
            });
        });

        newSocket.on('session_finalized', (data: any) => {
            setFinalBill(data.bill);
            const newHistoryItem = { ...data.bill, id: Date.now().toString() };
            setHistory(prev => {
                const updated = [newHistoryItem, ...prev];
                AsyncStorage.setItem('order_history', JSON.stringify(updated));
                return updated;
            });
            setSessionId(null);
            AsyncStorage.removeItem('active_session_id');
            AsyncStorage.removeItem(`cart_${cafeId}`);
        });

        return () => { newSocket.disconnect(); };
    };

    const fetchData = async (overrideCafeId?: string) => {
        try {
            const activeCid = overrideCafeId || cafeId;
            if (!activeCid) return;

            // 1. Fetch Cafe Basic Info (Supports slug/ID)
            const cafeRes = await client.get(`/tenant/${activeCid}`);
            const cafeData = cafeRes.data;
            setCafe(cafeData);
            
            // 2. Refresh local cafeId to UUID if it was a slug
            const actualUuid = cafeData.id;
            setCafeId(actualUuid);

            // 3. Fetch dependent data using UUID
            const [menuRes, settingsRes] = await Promise.all([
                client.get(`/menu?cafeId=${actualUuid}`),
                client.get(`/settings/public/${actualUuid}`)
            ]);

            setMenuItems(menuRes.data);
            setCafe(cafeRes.data);
            if (settingsRes.data) {
                setSettings(settingsRes.data);
            } else {
                // Fallback default settings
                setSettings({
                    paymentMode: 'WAITER_AT_TABLE',
                    currencySymbol: '$',
                    customerCanCallWaiter: true,
                    menuImagesEnabled: true,
                    dietaryTagsEnabled: true,
                    specialInstructions: true,
                });
            }

            if (cafeRes.data && !cafeRes.data.isActive) {
                Alert.alert("Store Offline", "This cafe is currently not accepting orders.");
            }
        } catch (error: any) {
            Alert.alert('Error', error.response?.data?.error || 'Failed to load menu data.');
        } finally {
            setLoading(false);
        }
    };

    // Derived Menu Items
    const categories = useMemo(() => {
        const cats = Array.from(new Set(menuItems.map(m => m.category)));
        return ['All', ...cats.sort()];
    }, [menuItems]);

    const filteredMenu = useMemo(() => {
        const baseFiltered = menuItems.filter(item => {
            const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                                  (item.desc && item.desc.toLowerCase().includes(searchQuery.toLowerCase()));
            return matchesSearch;
        });

        if (selectedCategory !== 'All') {
            return baseFiltered.filter(item => item.category === selectedCategory);
        }

        // Deep cluster by category if 'All' is selected
        const grouped: any[] = [];
        categories.filter(c => c !== 'All').forEach(cat => {
            const catItems = baseFiltered.filter(item => item.category === cat);
            if (catItems.length > 0) {
                grouped.push({ id: `header_${cat}`, isCategoryHeader: true, title: cat });
                if (!collapsedCategories[cat]) {
                    grouped.push(...catItems);
                }
            }
        });
        
        return grouped;
    }, [menuItems, selectedCategory, searchQuery, categories, collapsedCategories]);

    // Cart Handlers
    const addToCart = (item: any) => {
        setCart(prev => {
            const existing = prev.find(i => i.id === item.id);
            if (existing) return prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i);
            return [...prev, { ...item, quantity: 1 }];
        });
    };

    const updateQuantity = (id: string, delta: number) => {
        setCart(prev => {
            return prev.map(item => {
                if (item.id === id) {
                    const newQ = item.quantity + delta;
                    if (newQ <= 0) return null; // mark for removal
                    return { ...item, quantity: newQ };
                }
                return item;
            }).filter(Boolean) as any[];
        });
    };

    const removeFromCart = (id: string) => updateQuantity(id, -1);

    const placeOrder = async () => {
        if (cart.length === 0 && !isPreOrderMode) return;
        
        // --- Duplicate Protection ---
        if (orders.length > 0) {
            const lastOrder = orders[orders.length - 1]; // Assume chronological
            const timeDiff = new Date().getTime() - new Date(lastOrder.createdAt).getTime();
            
            // 5 minutes duplicate intercept block
            if (timeDiff < 5 * 60 * 1000) {
                const parsedItems = typeof lastOrder.items === 'string' ? JSON.parse(lastOrder.items) : lastOrder.items;
                const isExactMatch = cart.length === parsedItems?.length && cart.every(c => {
                    const match = parsedItems.find((p: any) => p.id === c.id);
                    return match && match.quantity === c.quantity;
                });
                
                if (isExactMatch) {
                    Alert.alert(
                        "Duplicate Order Detected",
                        "You just ordered this exact combination of items a few minutes ago. Did you mean to place it again?",
                        [
                            { text: "No, cancel", style: "cancel" },
                            { text: "Yes, order again", style: "destructive", onPress: runOrderApi }
                        ]
                    );
                    return; // Halt flow pending user confirmation
                }
            }
        }
        
        // If clean, just run it
        runOrderApi();
    };

    const runOrderApi = async () => {
        setIsPlacingOrder(true);
        try {
            if (isPreOrderMode) {
                const res = await client.post('/reservation/book', {
                    cafeId,
                    tableId,
                    partySize: route.params.partySize || 1,
                    items: cart,
                    deviceIdentifier: await AsyncStorage.getItem('deviceIdentifier')
                });
                
                setIsPlacingOrder(false);
                setCart([]);
                setSpecialInstructions('');
                setCartModalVisible(false);

                // Navigate to Success Screen
                navigation.replace('ReservationSuccess', { 
                    session: res.data.session, 
                    preOrder: res.data.preOrder, 
                    cafeName: res.data.cafeName || 'Our Cafe',
                    approvalRequired: res.data.approvalRequired,
                    paymentNotice: res.data.paymentNotice,
                    reservationStatus: res.data.reservationStatus,
                });
                return;
            } else {
                // NORMAL Ordering Flow
                let verified = isLocationVerified;
                
                // Real-time location verification if setting is enabled
                if (settings?.locationVerification && Platform.OS !== 'web') {
                    try {
                        const { status } = await Location.requestForegroundPermissionsAsync();
                        if (status === 'granted') {
                            const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
                            if (location) {
                                verified = true;
                                setIsLocationVerified(true);
                            }
                        } else {
                            // If permissions are denied, warn but proceed with 'verified = false' 
                            console.warn("Location permission denied");
                        }
                    } catch (err) {
                        console.warn("Could not fetch location", err);
                    }
                }

                // --- Price Sync Logic: Matches Backend order.ts exactly ---
                const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
                let tax = 0;
                let sc = 0;
                let total = subtotal;

                if (settings?.taxEnabled && !settings?.taxInclusive) {
                    tax = (subtotal * (settings.taxRate || 0)) / 100;
                }
                if (settings?.serviceChargeEnabled) {
                    sc = (subtotal * (settings.serviceChargeRate || 0)) / 100;
                }
                
                // Final Grand Total for Backend Validation
                total = subtotal + tax + sc;

                const res = await client.post('/order/place', {
                    sessionId, 
                    items: cart, 
                    totalAmount: total, 
                    isLocationVerified: verified,
                    specialInstructions: specialInstructions.trim() || undefined
                });

                if (res.data.alert) Alert.alert("Wait Time & Verification", res.data.alert);

                setOrders(prev => {
                    if (prev.some(o => o.id === res.data.order.id)) return prev;
                    return [...prev, res.data.order];
                });
                setCart([]);
                setSpecialInstructions('');
                setCartModalVisible(false);
                setHasViewedOrders(false); // Trigger attention pulse!
            }
        } catch (error: any) {
            if (error.response?.data?.error === 'Validation failed') {
                const details = error.response.data.details?.map((d: any) => d.message).join('\n') || 'Invalid order details.';
                Alert.alert('Invalid Order', details);
            } else {
                Alert.alert('Order Error', error.response?.data?.error || 'Could not process your request. Check your connection.');
            }
        } finally {
            setIsPlacingOrder(false);
        }
    };

    const callWaiterFn = () => {
        if (isCallingWaiter) return;

        if (!socket || !sessionId) {
            Alert.alert("Connection Error", "Cannot connect to the hotel system. Please refresh the page.");
            return;
        }

        socket.emit('call_waiter', {
            room: `WAITER_${cafeId}`,
            cafeId,
            tableId: currentTableId,
            sessionId,
            tableNumber,
            message: `Table ${tableNumber} needs assistance!`,
            type: 'WAITER_CALL'
        });

        setIsCallingWaiter(true);
        // Reset button after 5 seconds
        setTimeout(() => {
            setIsCallingWaiter(false);
        }, 5000);
    };

    const requestCheckout = async (type: string) => {
        if (orders.length === 0) return;
        setIsRequestingCheckout(true);
        try {
            const totalAmount = orders.reduce((sum, o) => sum + o.totalAmount, 0);
            
            if (type === 'COUNTER') {
                if (socket && sessionId) {
                    socket.emit('call_waiter', {
                        room: `WAITER_${cafeId}`,
                        cafeId,
                        tableId: currentTableId,
                        sessionId,
                        tableNumber,
                        message: `Table ${tableNumber} is coming to the counter to pay!`,
                        type: 'PAYMENT_NOTICE'
                    });
                }
                Alert.alert('Pay at Counter', `Please go to the counter and mention Table ${tableNumber}.\n\nTotal to pay: ${settings?.currencySymbol || '$'}${totalAmount.toFixed(2)}`);
            } else {
                if (socket && sessionId) {
                    socket.emit('call_waiter', {
                        room: `WAITER_${cafeId}`,
                        cafeId,
                        tableId: currentTableId,
                        sessionId,
                        tableNumber,
                        message: `Table ${tableNumber} requested the bill at their table.`,
                        type: 'BILL_REQUEST'
                    });
                }
                Alert.alert('Waiter Called', 'Please wait while the waiter brings your bill.');
            }
        } catch (error: any) {
            Alert.alert('Checkout Error', error.message || 'Could not request checkout.');
        } finally {
            setIsRequestingCheckout(false);
        }
    };

    const getStatusColor = (status: string) => {
        switch(status) {
            case 'PENDING_APPROVAL': return '#F59E0B';
            case 'RECEIVED': return '#3B82F6';
            case 'PREPARING': return '#8B5CF6';
            case 'READY': return '#10B981';
            case 'DELIVERED': return '#64748B';
            case 'REJECTED': return '#EF4444';
            default: return '#94A3B8';
        }
    };

    const getStatusLabel = (status: string) => {
        switch(status) {
            case 'PENDING_APPROVAL': return 'Awaiting Approval';
            case 'RECEIVED': return 'Order Accepted';
            case 'PREPARING': return 'Cooking';
            case 'READY': return 'Ready for Serving';
            case 'DELIVERED': return 'Delivered';
            case 'REJECTED': return 'Cancelled';
            default: return status.replace('_', ' ');
        }
    };

    const renderDietaryTag = (tag: string) => {
        if (!tag) return null;
        let color = '#94A3B8';
        let icon = '●';
        if (tag === 'VEG') { color = '#0D8A3F'; icon = '●'; }
        if (tag === 'NON_VEG') { color = '#E23744'; icon = '▲'; }
        if (tag === 'VEGAN') { color = '#0D8A3F'; icon = '◆'; }
        if (tag === 'EGGETARIAN') { color = '#E8A317'; icon = '●'; }

        return (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                <View style={{
                    width: 16, height: 16, borderWidth: 1.5, borderColor: color,
                    borderRadius: 3, justifyContent: 'center', alignItems: 'center', marginRight: 6,
                }}>
                    <Text style={{ color, fontSize: 8, fontWeight: '900' }}>{icon}</Text>
                </View>
                <Text style={{ fontSize: 10, color, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' }}>
                    {tag.replace('_', ' ')}
                </Text>
            </View>
        );
    };

    const toggleCategory = (cat: string) => {
        setCollapsedCategories(prev => ({ ...prev, [cat]: !prev[cat] }));
    };

    const renderItem = ({ item }: any) => {
        if (item.isCategoryHeader) {
            const isCollapsed = collapsedCategories[item.title];
            return (
                <TouchableOpacity onPress={() => toggleCategory(item.title)} style={{ marginTop: 12, marginBottom: 6, paddingHorizontal: 6, flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={{ fontSize: 18, fontWeight: '900', color: '#1C1C1C', letterSpacing: -0.5, textTransform: 'uppercase' }}>{item.title}</Text>
                    <View style={{ flex: 1, height: 1, backgroundColor: '#E8E8E8', marginHorizontal: 12 }} />
                    <Text style={{ fontSize: 24, color: '#93959F', fontWeight: '400', marginTop: -4 }}>{isCollapsed ? '+' : '−'}</Text>
                </TouchableOpacity>
            );
        }

        const isSoldOut = !item.isAvailable || (cafe && !cafe.isActive);
        const cartItem = cart.find(c => c.id === item.id);
        const qty = cartItem?.quantity || 0;
        const cs = settings?.currencySymbol || '₹';
        const isBestseller = item.price > 10;
        
        return (
            <TouchableOpacity 
                style={[styles.menuItemCompact, isSoldOut && { opacity: 0.5 }]} 
                onPress={() => setSelectedItem(item)}
                activeOpacity={0.7}
            >
                <View style={styles.menuInfoCompact}>
                    {isBestseller && (
                        <View style={{ marginBottom: 2 }}>
                            <Text style={{ color: '#E23744', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 }}>⭐ BESTSELLER</Text>
                        </View>
                    )}
                    {settings?.dietaryTagsEnabled && renderDietaryTag(item.dietaryTag)}
                    <Text style={styles.itemNameCompact} numberOfLines={2}>{item.name}</Text>
                    <Text style={styles.itemPriceCompact}>{cs}{item.price.toFixed(2)}</Text>
                </View>
                
                <View style={{ justifyContent: 'center', alignItems: 'flex-end', minWidth: 80 }}>
                    {qty > 0 ? (
                        <View style={styles.qtyBoxCompact}>
                            <TouchableOpacity onPress={(e) => { e.stopPropagation(); removeFromCart(item.id); }} style={styles.qtyTouchableCompact}>
                                <Text style={styles.qtyBtnMinusCompact}>−</Text>
                            </TouchableOpacity>
                            <Text style={styles.qtyCountCompact}>{qty}</Text>
                            <TouchableOpacity onPress={(e) => { e.stopPropagation(); addToCart(item); }} style={styles.qtyTouchableCompact}>
                                <Text style={styles.qtyBtnPlusCompact}>+</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <TouchableOpacity 
                            style={styles.addBtnCompact} 
                            onPress={(e) => { e.stopPropagation(); !isSoldOut && addToCart(item); }}
                            disabled={isSoldOut}
                        >
                            <Text style={styles.addBtnTextCompact}>ADD</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </TouchableOpacity>
        );
    };

    if (loading) {
        return (
            <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
                <Text style={{ fontSize: 50, marginBottom: 15 }}>🍜</Text>
                <ActivityIndicator size="large" color="#E23744" />
                <Text style={{ marginTop: 14, color: '#1C1C1C', fontWeight: '700', fontSize: 16 }}>Preparing your menu...</Text>
                <Text style={{ marginTop: 4, color: '#93959F', fontSize: 13 }}>Hang tight, deliciousness awaits</Text>
            </View>
        );
    }

    const cartTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
    const pendingAmount = orders.reduce((sum, o) => sum + o.totalAmount, 0);

    return (
        <SafeAreaView style={styles.container}>
            <ResponsiveContainer maxWidth={768} style={{ flex: 1, alignSelf: 'center', width: '100%', backgroundColor: '#fff', 
                ...(Platform.OS === 'web' && { boxShadow: '0 0 20px rgba(0,0,0,0.05)' }) 
            }}>
                
                {!sessionId && !showJoinModal && !finalBill ? (
                    <View style={styles.historyContainer}>
                        <Text style={styles.headerTitle}>Order History</Text>
                        <FlatList
                            data={history}
                            keyExtractor={i => i.id}
                            renderItem={({ item }) => (
                                <View style={styles.card}>
                                    <Text style={styles.cardTitle}>{item.cafeName} - Table {item.tableNumber}</Text>
                                    <Text style={styles.cardSubtitle}>{new Date(item.date).toLocaleDateString()}</Text>
                                    <Text style={styles.priceLabel}>Total paid: {settings?.currencySymbol || '$'}{item.totalAmount.toFixed(2)}</Text>
                                </View>
                            )}
                            ListEmptyComponent={
                                <View style={{ alignItems: 'center', marginTop: 40 }}>
                                    <Text style={{ fontSize: 40, marginBottom: 10 }}>🧾</Text>
                                    <Text style={styles.emptyText}>No past orders found.</Text>
                                </View>
                            }
                        />
                        <TouchableOpacity style={styles.placeOrderBtn} onPress={() => navigation.navigate('ScanTable')}>
                            <Text style={styles.btnText}>Scan New Table</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <>
                        {route.params?.isPrebooked && (
                            <View style={styles.prebookBanner}>
                                <Text style={styles.prebookBannerText}>✅ Table pre-booked. Paid advance: {settings?.currencySymbol || '$'}{route.params.advancePaid?.toFixed(2) || '0.00'}. Food implies prep.</Text>
                            </View>
                        )}
                        
                        {/* === SWIGGY-STYLE DARK HEADER === */}
                        <View style={styles.headerTop}>
                            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
                                <Text style={{ fontSize: 13, marginRight: 4 }}>📍</Text>
                                <Text style={styles.headerTitle}>{cafe?.name || 'Restaurant'}</Text>
                                <Text style={{ color: '#E0E0E0', marginHorizontal: 6, fontSize: 16 }}>|</Text>
                                <Text style={styles.subHeader}>T-{tableNumber} • {isPreOrderMode ? 'Pre-Order' : 'Dine-In'}</Text>
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                                    <TouchableOpacity 
                                        style={styles.callBtn} 
                                        onPress={() => {
                                            setHasViewedOrders(true);
                                            setSessionOrdersVisible(true);
                                        }}>
                                        <Text style={{ fontSize: 15 }}>📋</Text>
                                        <Text style={styles.callBtnText}>Your Orders</Text>
                                    </TouchableOpacity>
                                </Animated.View>
                                {!isPreOrderMode && settings?.customerCanCallWaiter && (
                                    <TouchableOpacity 
                                        style={[styles.callBtn, isCallingWaiter && { backgroundColor: '#10B981', borderColor: '#059669' }]} 
                                        onPress={callWaiterFn}
                                        disabled={isCallingWaiter}
                                    >
                                        <Text style={{ fontSize: 15 }}>{isCallingWaiter ? '✅' : '🛎️'}</Text>
                                        <Text style={[styles.callBtnText, isCallingWaiter && { color: 'white' }]}>
                                            {isCallingWaiter ? 'Waiter Alerted!' : 'Call Waiter'}
                                        </Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        </View>

                        {/* Estimated Prep Time Banner */}
                        {settings?.showPrepTime && (
                            <View style={styles.prepBanner}>
                                <Text style={styles.prepBannerText}>
                                    🍳 Est. Prep Time: <Text style={{ fontWeight: '900' }}>{settings.avgPrepTimeMinutes} mins</Text>
                                </Text>
                            </View>
                        )}

                        {/* === SEARCH BAR === */}
                        <View style={styles.searchContainer}>
                            <Text style={{ marginRight: 10, fontSize: 16, color: '#93959F' }}>🔍</Text>
                            <TextInput 
                                style={styles.searchInput}
                                placeholder="Search for dishes..."
                                placeholderTextColor="#93959F"
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                            />
                            {searchQuery.length > 0 && (
                                <TouchableOpacity onPress={() => setSearchQuery('')}>
                                    <Text style={{ color: '#93959F', fontSize: 18 }}>✕</Text>
                                </TouchableOpacity>
                            )}
                        </View>

                        {/* === CATEGORY PILLS === */}
                        <View style={{ paddingBottom: 8 }}>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryTabsWrap}>
                                {categories.map(cat => (
                                    <TouchableOpacity 
                                        key={cat} 
                                        style={[styles.catTab, selectedCategory === cat && styles.catTabActive]}
                                        onPress={() => setSelectedCategory(cat)}
                                    >
                                        <Text style={[styles.catTabText, selectedCategory === cat && styles.catTabTextActive]}>
                                            {cat}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        </View>


                        <FlatList
                            key={numColumns}
                            data={filteredMenu}
                            keyExtractor={(item) => item.id.toString()}
                            renderItem={renderItem}
                            numColumns={numColumns}
                            columnWrapperStyle={numColumns > 1 ? { justifyContent: 'space-between' } : null}
                            showsVerticalScrollIndicator={false}
                            contentContainerStyle={styles.scrollContent}
                            ListEmptyComponent={
                                <View style={{ alignItems: 'center', marginTop: 40 }}>
                                    <Text style={{ fontSize: 40, marginBottom: 10 }}>🍽️</Text>
                                    <Text style={styles.emptyText}>No items found matching your filter.</Text>
                                </View>
                            }
                            ListFooterComponent={<View style={{ height: 120 }} />} // Spacer for bottom bar
                        />

                        {/* Sticky Bottom Bar for Cart/Checkout */}
                        <View style={styles.bottomBar}>
                            {cart.length > 0 || isPreOrderMode ? (
                                <TouchableOpacity style={styles.viewCartBtn} onPress={() => setCartModalVisible(true)}>
                                    <View style={styles.cartBadge}><Text style={styles.cartBadgeText}>{cartCount}</Text></View>
                                    <Text style={styles.btnText}>{isPreOrderMode ? 'Review Reservation' : 'Review Feast'}</Text>
                                    <Text style={styles.btnTextPrice}>{settings?.currencySymbol || '$'}{cartTotal.toFixed(2)}</Text>
                                </TouchableOpacity>
                            ) : orders.length > 0 ? (
                                <View style={styles.paymentSection}>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Text style={styles.pendingText}>Current Bill: {settings?.currencySymbol || '$'}{pendingAmount.toFixed(2)}</Text>
                                        <TouchableOpacity 
                                            onPress={() => {
                                                setHasViewedOrders(true);
                                                setSessionOrdersVisible(true);
                                            }}
                                        >
                                            <Text style={{ color: '#0EA5E9', fontWeight: '700', fontSize: 13 }}>View Session</Text>
                                        </TouchableOpacity>
                                    </View>

                                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                                        {(settings?.paymentMode === 'WAITER_AT_TABLE' || settings?.paymentMode === 'BOTH') && (
                                            <TouchableOpacity style={[styles.checkoutBtn, { backgroundColor: '#F59E0B' }, isRequestingCheckout && {opacity: 0.7}]} onPress={() => requestCheckout('WAITER')} disabled={isRequestingCheckout}>
                                                <Text style={styles.btnTextSecondary}>{isRequestingCheckout ? 'Calling...' : 'Call Waiter for Bill'}</Text>
                                            </TouchableOpacity>
                                        )}
                                        {(settings?.paymentMode === 'PAY_AT_COUNTER' || settings?.paymentMode === 'BOTH') && (
                                            <TouchableOpacity style={[styles.checkoutBtn, { backgroundColor: '#3B82F6' }, isRequestingCheckout && {opacity: 0.7}]} onPress={() => requestCheckout('COUNTER')} disabled={isRequestingCheckout}>
                                                <Text style={styles.btnTextSecondary}>{isRequestingCheckout ? 'Processing...' : 'Pay at Counter'}</Text>
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                </View>
                            ) : null}
                        </View>
                    </>
                )}
            </ResponsiveContainer>

            {/* Session Join Modal */}
            <Modal visible={showJoinModal} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>{isLocked ? 'Enter Table PIN' : 'Secure Your Table'}</Text>
                        <Text style={styles.modalDesc}>
                            {isReservationEntry
                                ? 'This table is reserved. Enter your booking code to unlock the reserved session.'
                                : isLocked
                                    ? 'Ask the person who scanned first for the PIN.'
                                    : 'Set a 4-digit PIN so others can join your table session.'}
                        </Text>
                        <TextInput
                            style={styles.modalInputLarge}
                            placeholder={isReservationEntry ? 'Booking Code' : 'PIN (4-Digits)'}
                            keyboardType="number-pad"
                            maxLength={isReservationEntry ? 8 : 4}
                            value={joinCode}
                            onChangeText={setJoinCode}
                        />
                        <TouchableOpacity style={styles.modalBtn} onPress={handleJoinWithCode}>
                            <Text style={styles.modalBtnText}>
                                {isReservationEntry ? 'Unlock Reservation' : isLocked ? 'Join Session' : 'Set PIN & Start'}
                            </Text>
                        </TouchableOpacity>
                        {isLocked && !isReservationEntry && (
                            <TouchableOpacity onPress={handleForgotCode} style={{ marginTop: 15 }}>
                                <Text style={{ color: '#E23744', fontWeight: 'bold' }}>Forgot PIN? Ask Waiter</Text>
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity onPress={() => navigation.navigate('Landing')} style={{ marginTop: 20 }}>
                            <Text style={{ color: '#7F8C8D' }}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Cart Review Modal */}
            <Modal visible={cartModalVisible} transparent animationType="slide">
                <View style={styles.bottomSheetOverlay}>
                    <View style={styles.bottomSheet}>
                        <View style={styles.sheetHeader}>
                            <Text style={styles.sheetTitle}>Review Order</Text>
                            <TouchableOpacity onPress={() => setCartModalVisible(false)}>
                                <Text style={styles.closeText}>Close</Text>
                            </TouchableOpacity>
                        </View>
                        
                        <ScrollView style={{ maxHeight: 300, marginBottom: 15 }}>
                            {cart.map((c) => (
                                <View key={c.id} style={styles.cartRow}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.cartItemName}>{c.name}</Text>
                                        <Text style={styles.cartItemPrice}>{settings?.currencySymbol || '$'}{(c.price * c.quantity).toFixed(2)}</Text>
                                    </View>
                                    <View style={styles.qtyControls}>
                                        <TouchableOpacity style={styles.qtyBtn} onPress={() => updateQuantity(c.id, -1)}>
                                            <Text style={styles.qtyBtnText}>-</Text>
                                        </TouchableOpacity>
                                        <Text style={styles.qtyText}>{c.quantity}</Text>
                                        <TouchableOpacity style={styles.qtyBtn} onPress={() => updateQuantity(c.id, 1)}>
                                            <Text style={styles.qtyBtnText}>+</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            ))}
                        </ScrollView>

                        {settings?.specialInstructions && (
                            <View style={{ marginBottom: 20 }}>
                                <Text style={styles.subsectionTitle}>Special Instructions</Text>
                                <TextInput 
                                    style={styles.modalInput} 
                                    placeholder="e.g. No onions, extra spicy" 
                                    value={specialInstructions}
                                    onChangeText={setSpecialInstructions}
                                    multiline
                                />
                            </View>
                        )}

                        <View style={styles.paymentPreview}>
                            <Text style={styles.previewLabel}>Estimated Subtotal</Text>
                            <Text style={styles.previewValue}>{settings?.currencySymbol || '$'}{cartTotal.toFixed(2)}</Text>
                        </View>
                        
                        {isPreOrderMode && (
                            <View style={styles.preOrderCalc}>
                                <Text style={styles.taxNote}>* Final advance to pay now ({settings?.preOrderAdvanceRate || 40}% of order + {settings?.currencySymbol || '$'}{settings?.platformFeeAmount || 10} platform fee).</Text>
                                <View style={styles.paymentPreview}>
                                    <Text style={styles.previewLabel}>Pre-booking Advance:</Text>
                                    <Text style={styles.previewValueActive}>{settings?.currencySymbol || '$'}{((cartTotal * ((settings?.preOrderAdvanceRate || 40) / 100)) + (settings?.platformFeeAmount || 10)).toFixed(2)}</Text>
                                </View>
                            </View>
                        )}
                        
                        {!isPreOrderMode && settings?.taxEnabled && (
                            <Text style={[styles.taxNote, settings.taxInclusive && { color: '#0D8A3F' }]}>
                                * {settings.taxInclusive ? `Prices include ${settings.taxLabel || 'Tax'} (${settings.taxRate || 0}%).` : `Does not include ${settings.taxLabel || 'Tax'} (${settings.taxRate || 0}%)`} and service charges which will be applied to final bill.
                            </Text>
                        )}

                        <TouchableOpacity 
                            style={[styles.placeOrderBtnHeavy, isPlacingOrder && {opacity: 0.7}]} 
                            onPress={placeOrder} 
                            disabled={isPlacingOrder}
                            accessibilityRole="button"
                            accessibilityLabel={isPreOrderMode ? "Pay Advance and Confirm Reservation" : "Send to Chef"}
                        >
                            <Text style={styles.btnText}>{isPlacingOrder ? 'Warming up the pans...' : (isPreOrderMode ? 'Lock it in & Reserve' : 'Send to Chef 👨‍🍳')}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Item Detail Modal */}
            <Modal visible={!!selectedItem} transparent animationType="slide">
                <View style={[styles.bottomSheetOverlay, { justifyContent: 'flex-end' }]}>
                    <View style={[styles.bottomSheet, { padding: 0, overflow: 'hidden' }]}>
                        <TouchableOpacity 
                            style={{ position: 'absolute', top: 15, right: 15, zIndex: 10, backgroundColor: 'rgba(0,0,0,0.6)', width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' }} 
                            onPress={() => setSelectedItem(null)}
                        >
                            <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 16 }}>✕</Text>
                        </TouchableOpacity>
                        
                        {settings?.menuImagesEnabled && selectedItem?.imageUrl ? (
                            <Image source={{ uri: `${SOCKET_URL}${selectedItem.imageUrl}` }} style={styles.itemDetailImage} resizeMode="cover" />
                        ) : null}
                        
                        <View style={{ padding: 24, paddingTop: 16 }}>
                            {settings?.dietaryTagsEnabled && selectedItem?.dietaryTag && renderDietaryTag(selectedItem.dietaryTag)}
                            <Text style={{ fontSize: 24, fontWeight: '900', color: '#1C1C1C', marginBottom: 8 }}>{selectedItem?.name}</Text>
                            
                            {selectedItem?.desc ? (
                                <Text style={{ fontSize: 15, color: '#686B78', lineHeight: 22, marginBottom: 24 }}>{selectedItem.desc}</Text>
                            ) : null}
                            
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                                <View>
                                    <Text style={{ fontSize: 22, fontWeight: '900', color: '#1C1C1C' }}>{settings?.currencySymbol || '₹'}{selectedItem?.price?.toFixed(2)}</Text>
                                    {selectedItem?.isAvailable && (!cafe || cafe.isActive) && (
                                        <Text style={{ fontSize: 12, color: '#0D8A3F', fontWeight: '700', marginTop: 4 }}>Available</Text>
                                    )}
                                </View>
                                
                                <TouchableOpacity 
                                    style={[styles.addBtnCompact, { backgroundColor: '#0D8A3F', paddingHorizontal: 20, height: 44, borderRadius: 22, borderWidth: 0 }, (!selectedItem?.isAvailable || (cafe && !cafe.isActive)) && {opacity: 0.5}]} 
                                    onPress={() => {
                                        if (selectedItem?.isAvailable && (!cafe || cafe.isActive)) {
                                            addToCart(selectedItem);
                                            setSelectedItem(null);
                                        }
                                    }}
                                    disabled={!selectedItem?.isAvailable || (cafe && !cafe.isActive)}
                                >
                                    <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 15 }}>Craving this! 🤤</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Session Orders Modal (Multi-Phase Tracker) */}
            <Modal visible={sessionOrdersVisible} transparent animationType="slide">
                <View style={styles.bottomSheetOverlay}>
                    <View style={styles.bottomSheet}>
                        <View style={styles.sheetHeader}>
                            <View>
                                <Text style={styles.sheetTitle}>Session Orders</Text>
                                <Text style={styles.subHeader}>
                                    Session ID: #{sessionId?.slice(-6).toUpperCase() || 'NEW'}
                                </Text>
                            </View>
                            <TouchableOpacity onPress={() => setSessionOrdersVisible(false)}>
                                <Text style={styles.closeText}>Close</Text>
                            </TouchableOpacity>
                        </View>

                        {orders.length === 0 ? (
                            <View style={{ padding: 40, alignItems: 'center' }}>
                                <Text style={{ fontSize: 40, marginBottom: 10 }}>🍽️</Text>
                                <Text style={styles.emptyText}>You haven't placed any orders yet.</Text>
                            </View>
                        ) : (
                            <ScrollView style={{ maxHeight: 450, marginBottom: 15 }}>
                                {orders.map((order: any, idx: number) => {
                                    const parsedItems = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
                                    return (
                                        <View key={order.id} style={{ marginBottom: 20, backgroundColor: '#F8F8F8', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#F0F0F5' }}>
                                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, borderBottomWidth: 1, borderBottomColor: '#E8E8E8', paddingBottom: 10 }}>
                                                <Text style={{ fontSize: 15, fontWeight: '800', color: '#1C1C1C' }}>
                                                    Order {idx + 1}
                                                </Text>
                                                <View style={{ backgroundColor: getStatusColor(order.status) + '20', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
                                                    <Text style={{ color: getStatusColor(order.status), fontWeight: '800', fontSize: 10, textTransform: 'uppercase' }}>
                                                        {getStatusLabel(order.status)}
                                                    </Text>
                                                </View>
                                            </View>
                                            
                                            {parsedItems?.map((item: any, i: number) => (
                                                <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                                                    <Text style={{ fontSize: 14, color: '#686B78', flex: 1 }}>{item.quantity}x {item.name}</Text>
                                                    <Text style={{ fontSize: 14, color: '#1C1C1C', fontWeight: '600' }}>{settings?.currencySymbol || '$'}{(item.price * item.quantity).toFixed(2)}</Text>
                                                </View>
                                            ))}
                                            
                                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#E8E8E8' }}>
                                                <Text style={{ fontSize: 13, color: '#93959F' }}>{new Date(order.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</Text>
                                                <Text style={{ fontSize: 15, fontWeight: '800', color: '#0D8A3F' }}>{settings?.currencySymbol || '$'}{order.totalAmount.toFixed(2)}</Text>
                                            </View>
                                        </View>
                                    );
                                })}
                            </ScrollView>
                        )}
                        
                        {(orders.length > 0) && (
                            <View style={styles.paymentPreview}>
                                <Text style={styles.previewLabel}>Running Subtotal</Text>
                                <Text style={styles.previewValueActive}>{settings?.currencySymbol || '$'}{pendingAmount.toFixed(2)}</Text>
                            </View>
                        )}
                    </View>
                </View>
            </Modal>

            <Modal visible={!!finalBill} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { maxHeight: '85%', padding: 0, overflow: 'hidden' }]}>
                        {/* Receipt Header */}
                        <View style={{ backgroundColor: '#1C1C1C', width: '100%', padding: 20, alignItems: 'center' }}>
                            <Text style={{ color: 'white', fontSize: 20, fontWeight: '900', letterSpacing: 1 }}>DIGITAL RECEIPT</Text>
                            <Text style={{ color: '#93959F', fontSize: 12, marginTop: 4 }}>Order ID: #{finalBill?.sessionId || 'N/A'}</Text>
                        </View>

                        <ScrollView style={{ width: '100%', padding: 24 }}>
                            <View style={{ alignItems: 'center', marginBottom: 20 }}>
                                <Text style={{ fontSize: 24, fontWeight: '900', color: '#1C1C1C' }}>{finalBill?.cafeName}</Text>
                                {finalBill?.cafeAddress && <Text style={{ fontSize: 13, color: '#93959F', textAlign: 'center', marginTop: 4 }}>{finalBill.cafeAddress}</Text>}
                                {finalBill?.gstNumber && (
                                    <View style={{ backgroundColor: '#F0F0F5', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 8, marginTop: 10 }}>
                                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#686B78' }}>GST: {finalBill.gstNumber}</Text>
                                    </View>
                                )}
                            </View>

                            {/* Divider */}
                            <Text style={{ color: '#E8E8E8', textAlign: 'center', marginBottom: 15 }}>- - - - - - - - - - - - - - - - - - - - - - - - - - - - -</Text>

                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 }}>
                                <View>
                                    <Text style={{ fontSize: 11, color: '#93959F', textTransform: 'uppercase' }}>Table</Text>
                                    <Text style={{ fontSize: 16, fontWeight: '800', color: '#1C1C1C' }}>Table {finalBill?.tableNumber}</Text>
                                </View>
                                <View style={{ alignItems: 'flex-end' }}>
                                    <Text style={{ fontSize: 11, color: '#93959F', textTransform: 'uppercase' }}>Date & Time</Text>
                                    <Text style={{ fontSize: 13, fontWeight: '600', color: '#1C1C1C' }}>{finalBill?.date ? new Date(finalBill.date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : ''}</Text>
                                </View>
                            </View>

                            <View style={{ marginBottom: 15 }}>
                                <Text style={{ fontSize: 12, fontWeight: '800', color: '#1C1C1C', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>Bill Summary</Text>
                                {finalBill?.items.map((item: any, idx: number) => (
                                    <View key={idx} style={[styles.billRow, { borderBottomWidth: 0, paddingVertical: 4 }]}>
                                        <Text style={[styles.billItem, { fontSize: 14, color: '#1C1C1C' }]}>{item.quantity} x {item.name}</Text>
                                        <Text style={[styles.billPrice, { fontSize: 14 }]}>{settings?.currencySymbol || '₹'}{(item.price * item.quantity).toFixed(2)}</Text>
                                    </View>
                                ))}
                            </View>

                            <Text style={{ color: '#E8E8E8', textAlign: 'center', marginVertical: 10 }}>- - - - - - - - - - - - - - - - - - - - - - - - - - - - -</Text>

                            <View style={{ gap: 6 }}>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                    <Text style={{ fontSize: 14, color: '#686B78' }}>Subtotal</Text>
                                    <Text style={{ fontSize: 14, color: '#1C1C1C', fontWeight: '600' }}>{settings?.currencySymbol || '₹'}{finalBill?.subtotal?.toFixed(2)}</Text>
                                </View>
                                
                                {finalBill?.taxAmount > 0 && (
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                        <Text style={{ fontSize: 14, color: '#686B78' }}>{finalBill.taxLabel || 'GST'} ({finalBill.taxRate}%)</Text>
                                        <Text style={{ fontSize: 14, color: '#1C1C1C', fontWeight: '600' }}>{settings?.currencySymbol || '₹'}{finalBill.taxAmount.toFixed(2)}</Text>
                                    </View>
                                )}

                                {finalBill?.serviceCharge > 0 && (
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                        <Text style={{ fontSize: 14, color: '#686B78' }}>Service Charge ({finalBill.serviceChargeRate}%)</Text>
                                        <Text style={{ fontSize: 14, color: '#1C1C1C', fontWeight: '600' }}>{settings?.currencySymbol || '₹'}{finalBill.serviceCharge.toFixed(2)}</Text>
                                    </View>
                                )}

                                {finalBill?.platformFee > 0 && (
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                        <Text style={{ fontSize: 14, color: '#686B78' }}>Platform Fee</Text>
                                        <Text style={{ fontSize: 14, color: '#1C1C1C', fontWeight: '600' }}>{settings?.currencySymbol || '₹'}{finalBill.platformFee.toFixed(2)}</Text>
                                    </View>
                                )}
                                
                                {finalBill?.advancePaid > 0 && (
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                        <Text style={{ fontSize: 14, color: '#0D8A3F', fontWeight: '600' }}>Advance Paid</Text>
                                        <Text style={{ fontSize: 14, color: '#0D8A3F', fontWeight: '700' }}>-{settings?.currencySymbol || '₹'}{finalBill.advancePaid.toFixed(2)}</Text>
                                    </View>
                                )}

                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 15, paddingTop: 15, borderTopWidth: 2, borderTopColor: '#1C1C1C' }}>
                                    <Text style={{ fontSize: 20, fontWeight: '900', color: '#1C1C1C' }}>GRAND TOTAL</Text>
                                    <Text style={{ fontSize: 22, fontWeight: '900', color: '#0D8A3F' }}>{settings?.currencySymbol || '₹'}{finalBill?.totalAmount?.toFixed(2)}</Text>
                                </View>
                            </View>

                            <View style={{ alignItems: 'center', marginTop: 30, marginBottom: 20 }}>
                                <View style={{ backgroundColor: '#E8F5E9', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, flexDirection: 'row', alignItems: 'center' }}>
                                    <Text style={{ color: '#2E7D32', fontWeight: '800', fontSize: 12 }}>PAID SUCCESSFULLY ✓</Text>
                                </View>
                                <Text style={{ fontSize: 11, color: '#93959F', marginTop: 12, textAlign: 'center' }}>Thank you for dining with us!{"\n"}Please visit again.</Text>
                            </View>
                        </ScrollView>

                        <TouchableOpacity style={{ backgroundColor: '#E23744', padding: 20, width: '100%', alignItems: 'center' }} onPress={() => {
                            setFinalBill(null);
                            navigation.navigate('ScanTable');
                        }}>
                            <Text style={{ color: 'white', fontWeight: '900', fontSize: 16 }}>DONE</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    // === BASE ===
    container: { flex: 1, backgroundColor: '#F8F8F8' },
    prebookBanner: { backgroundColor: '#E8F5E9', padding: 12, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#C8E6C9' },
    prebookBannerText: { color: '#2E7D32', fontWeight: '700', fontSize: 13 },
    prepBanner: { backgroundColor: '#FFF9E6', paddingVertical: 8, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#FFECB3', alignItems: 'center' },
    prepBannerText: { color: '#856404', fontSize: 12, fontWeight: '600' },
    
    // === HEADER (Swiggy-style) ===
    headerTop: { 
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', 
        paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6,
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 1, borderBottomColor: '#F0F0F5',
    },
    headerTitle: { fontSize: 16, fontWeight: '800', color: '#1C1C1C', letterSpacing: -0.3 },
    subHeader: { fontSize: 12, color: '#93959F', fontWeight: '500' },
    callBtn: { 
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
        backgroundColor: '#FFFFFF', paddingHorizontal: 8, paddingVertical: 4, 
        borderRadius: 20, borderWidth: 1, borderColor: '#E23744',
    },
    callBtnText: { color: '#E23744', fontWeight: '700', fontSize: 11 },
    
    // === SEARCH (Zomato-style) ===
    searchContainer: { 
        marginHorizontal: 16, marginTop: 8, marginBottom: 4, flexDirection: 'row', alignItems: 'center', 
        backgroundColor: '#FFFFFF', borderRadius: 12, paddingHorizontal: 12, height: 38,
        borderWidth: 1, borderColor: '#E8E8E8',
    },
    searchInput: { flex: 1, fontSize: 14, color: '#1C1C1C', fontWeight: '400' },
    
    // === CATEGORY PILLS ===
    categoryTabsWrap: { paddingHorizontal: 16, gap: 6, paddingBottom: 6 },
    catTab: { 
        paddingHorizontal: 16, paddingVertical: 5, borderRadius: 20, 
        backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E0E0E0',
    },
    catTabActive: { backgroundColor: '#E23744', borderColor: '#E23744' },
    catTabText: { color: '#686B78', fontWeight: '600', fontSize: 12 },
    catTabTextActive: { color: '#FFFFFF', fontWeight: '700' },
    
    // === MENU ITEMS COMPACT (High Density layout) ===
    scrollContent: { paddingHorizontal: 16, paddingTop: 6 },
    menuItemCompact: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingVertical: 10, paddingHorizontal: 16, 
        backgroundColor: '#FFFFFF', marginBottom: 6,
        borderRadius: 12,
        borderWidth: 1, borderColor: '#E8E8E8',
        width: '100%',
        ...Platform.select({ 
            web: { boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }, 
            default: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 } 
        }),
    },
    menuInfoCompact: { flex: 1, paddingRight: 10 },
    itemNameCompact: { fontSize: 16, fontWeight: '700', color: '#1C1C1C', marginBottom: 2 },
    itemPriceCompact: { fontSize: 14, fontWeight: '600', color: '#686B78' },
    qtyBoxCompact: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        backgroundColor: '#F8F8F8', borderRadius: 8, borderWidth: 1, borderColor: '#0D8A3F',
        overflow: 'hidden', height: 32, width: 84,
    },
    qtyTouchableCompact: { paddingHorizontal: 10, height: '100%', justifyContent: 'center' },
    qtyBtnMinusCompact: { color: '#0D8A3F', fontSize: 16, fontWeight: '800' },
    qtyBtnPlusCompact: { color: '#0D8A3F', fontSize: 16, fontWeight: '800' },
    qtyCountCompact: { fontSize: 13, fontWeight: '700', color: '#1C1C1C', flex: 1, textAlign: 'center' },
    addBtnCompact: {
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: '#FFFFFF', paddingHorizontal: 20, height: 32,
        borderRadius: 8, borderWidth: 1, borderColor: '#0D8A3F',
    },
    addBtnTextCompact: { color: '#0D8A3F', fontWeight: '800', fontSize: 12 },
    itemDetailImage: { width: '100%', height: 260, borderTopLeftRadius: 24, borderTopRightRadius: 24 },

    // === SWIGGY ADD BUTTON ===
    addBtnOverlay: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        backgroundColor: '#FFFFFF', paddingHorizontal: 24, paddingVertical: 8,
        borderRadius: 10, borderWidth: 1.5, borderColor: '#0D8A3F',
        minWidth: 96,
        ...Platform.select({ 
            web: { boxShadow: '0 3px 8px rgba(0,0,0,0.12)' }, 
            default: { shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 8, elevation: 4 } 
        }),
    },
    addBtnText: { color: '#0D8A3F', fontWeight: '800', fontSize: 15, letterSpacing: 0.5 },
    addBtnPlus: { color: '#0D8A3F', fontWeight: '400', fontSize: 10, position: 'absolute', top: 2, right: 6 },
    
    // === QUANTITY COUNTER ===
    qtyBox: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        backgroundColor: '#0D8A3F', paddingHorizontal: 6, paddingVertical: 6,
        borderRadius: 10, minWidth: 96,
        ...Platform.select({ 
            web: { boxShadow: '0 3px 8px rgba(0,0,0,0.15)' }, 
            default: { shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 5 } 
        }),
    },
    qtyTouchable: { width: 28, height: 28, justifyContent: 'center', alignItems: 'center' },
    qtyBtnMinus: { color: '#FFFFFF', fontSize: 20, fontWeight: '600' },
    qtyBtnPlus: { color: '#FFFFFF', fontSize: 20, fontWeight: '600' },
    qtyCount: { color: '#FFFFFF', fontSize: 16, fontWeight: '800', paddingHorizontal: 10, minWidth: 28, textAlign: 'center' },
    
    // === BOTTOM BAR (Zomato green cart) ===
    bottomBar: { 
        position: 'absolute', bottom: 0, left: 0, right: 0, 
        paddingHorizontal: 16, paddingVertical: 12, 
        backgroundColor: '#FFFFFF', 
        borderTopWidth: 1, borderTopColor: '#F0F0F5',
        ...Platform.select({ 
            web: { boxShadow: '0 -4px 16px rgba(0,0,0,0.08)' }, 
            default: { shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.08, shadowRadius: 16, elevation: 10 } 
        }),
    },
    viewCartBtn: { 
        backgroundColor: '#0D8A3F', padding: 16, borderRadius: 14, 
        flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    },
    cartBadge: { 
        position: 'absolute', left: 16, backgroundColor: '#FFFFFF', 
        width: 26, height: 26, borderRadius: 13, justifyContent: 'center', alignItems: 'center',
    },
    cartBadgeText: { color: '#0D8A3F', fontWeight: '900', fontSize: 13 },
    btnText: { color: '#FFF', fontWeight: '700', fontSize: 16, letterSpacing: 0.3 },
    btnTextPrice: { color: '#FFF', fontWeight: '800', fontSize: 16, position: 'absolute', right: 20 },
    paymentSection: { width: '100%' },
    pendingText: { fontSize: 14, fontWeight: '600', color: '#686B78' },
    checkoutBtn: { flex: 1, padding: 14, borderRadius: 12, alignItems: 'center' },
    btnTextSecondary: { color: '#FFF', fontWeight: '700', fontSize: 14 },
    
    // === MODALS ===
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
    modalContent: { backgroundColor: 'white', padding: 28, borderRadius: 20, width: '100%', alignItems: 'center' },
    modalTitle: { fontSize: 22, fontWeight: '800', color: '#1C1C1C', marginBottom: 8 },
    modalSubtitle: { fontSize: 14, color: '#93959F', marginBottom: 20, fontWeight: '500' },
    modalDesc: { color: '#93959F', textAlign: 'center', marginBottom: 20, fontSize: 14 },
    modalInputLarge: { 
        borderWidth: 2, borderColor: '#E8E8E8', padding: 15, width: '100%', 
        borderRadius: 14, fontSize: 22, textAlign: 'center', marginBottom: 20, 
        fontWeight: '700', color: '#1C1C1C', letterSpacing: 6 
    },
    modalInput: { 
        borderWidth: 1, borderColor: '#E8E8E8', padding: 15, width: '100%', 
        borderRadius: 12, fontSize: 14, backgroundColor: '#F8F8F8', color: '#1C1C1C', 
        minHeight: 80, textAlignVertical: 'top' 
    },
    modalBtn: { backgroundColor: '#E23744', padding: 16, borderRadius: 14, width: '100%', alignItems: 'center' },
    modalBtnText: { color: 'white', fontWeight: '800', fontSize: 16 },
    
    // === CART BOTTOM SHEET ===
    bottomSheetOverlay: { flex: 1, backgroundColor: 'rgba(28, 28, 28, 0.7)', justifyContent: 'flex-end' },
    bottomSheet: { backgroundColor: '#FFFFFF', padding: 24, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%' },
    sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    sheetTitle: { fontSize: 20, fontWeight: '800', color: '#1C1C1C' },
    closeText: { fontSize: 15, fontWeight: '600', color: '#93959F' },
    cartRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F0F0F5' },
    cartItemName: { fontSize: 15, color: '#1C1C1C', fontWeight: '600', marginBottom: 4 },
    cartItemPrice: { fontSize: 14, color: '#0D8A3F', fontWeight: '700' },
    qtyControls: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0D8A3F', borderRadius: 8, paddingHorizontal: 2, paddingVertical: 2 },
    qtyBtn: { width: 28, height: 28, justifyContent: 'center', alignItems: 'center' },
    qtyBtnText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
    qtyText: { paddingHorizontal: 10, fontSize: 14, fontWeight: '800', color: '#FFFFFF' },
    subsectionTitle: { fontSize: 15, fontWeight: '700', color: '#1C1C1C', marginBottom: 10 },
    paymentPreview: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 15, borderTopWidth: 1, borderTopColor: '#E8E8E8' },
    previewLabel: { fontSize: 16, fontWeight: '700', color: '#1C1C1C' },
    taxNote: { fontSize: 11, color: '#93959F', marginBottom: 20 },
    preOrderCalc: { backgroundColor: '#FFF5F5', padding: 15, borderRadius: 12, marginBottom: 20, borderWidth: 1, borderColor: '#FFCDD2' },
    previewValueActive: { fontSize: 18, fontWeight: '800', color: '#E23744' },
    placeOrderBtnHeavy: { backgroundColor: '#0D8A3F', padding: 18, borderRadius: 14, alignItems: 'center' },
    
    // === BILL SUMMARY ===
    billRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F0F0F5' },
    billItem: { fontSize: 14, color: '#686B78', flex: 1 },
    billPrice: { fontSize: 14, color: '#1C1C1C', fontWeight: '600' },
    billTotalRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 15, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#E8E8E8' },
    billChargeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 5 },
    billChargeLabel: { fontSize: 13, color: '#93959F' },
    billChargeValue: { fontSize: 13, color: '#93959F' },
    billGrandTotalRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTopWidth: 2, borderTopColor: '#1C1C1C' },
    billTotalLabel: { fontSize: 16, fontWeight: '700', color: '#1C1C1C' },
    billTotalValue: { fontSize: 18, fontWeight: '800', color: '#0D8A3F' },
    
    // === HISTORY ===
    historyContainer: { padding: 20, flex: 1, justifyContent: 'center' },
    card: { 
        backgroundColor: '#FFFFFF', padding: 20, borderRadius: 16, marginBottom: 12, 
        borderWidth: 1, borderColor: '#F0F0F5',
        ...Platform.select({ 
            web: { boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }, 
            default: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 } 
        }),
    },
    cardTitle: { fontSize: 16, fontWeight: '700', color: '#1C1C1C', marginBottom: 4 },
    cardSubtitle: { fontSize: 13, color: '#93959F', marginBottom: 10 },
    priceLabel: { fontSize: 15, fontWeight: '800', color: '#0D8A3F' },
    placeOrderBtn: { backgroundColor: '#E23744', padding: 16, borderRadius: 14, alignItems: 'center', marginTop: 20 },
    emptyText: { textAlign: 'center', marginTop: 50, color: '#93959F', fontSize: 14, fontStyle: 'italic' },
} as any);
