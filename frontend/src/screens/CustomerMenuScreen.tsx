import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, SafeAreaView, ActivityIndicator, useWindowDimensions, Modal, TextInput, ScrollView, Image } from 'react-native';
import ResponsiveContainer from '../components/ResponsiveContainer';
import io from 'socket.io-client';
import client, { SOCKET_URL } from '../api/client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
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
    
    // Cart & Order States
    const [cart, setCart] = useState<{ id: string; name: string; price: number; quantity: number }[]>([]);
    const [orders, setOrders] = useState<any[]>([]);
    const [socket, setSocket] = useState<any>(null);
    
    // Session & Auth States
    const [joinCode, setJoinCode] = useState('');
    const [isLocked, setIsLocked] = useState(false);
    const [showJoinModal, setShowJoinModal] = useState(false);
    const [finalBill, setFinalBill] = useState<any>(null);
    const [history, setHistory] = useState<any[]>([]);

    const { width } = useWindowDimensions();
    const isWide = width > 768;
    const numColumns = isWide ? (width > 1100 ? 3 : 2) : 1;

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

    const autoStartSession = async (providedCode?: string) => {
        try {
            let deviceId = await AsyncStorage.getItem('deviceId');
            if (!deviceId) {
                deviceId = (await Application.getAndroidId()) ||
                    (await Application.getIosIdForVendorAsync()) ||
                    Math.random().toString(36).substring(7);
                await AsyncStorage.setItem('deviceId', deviceId);
            }

            const res = await client.post('/session/start', {
                cafeId,
                tableNumber: parseInt(tableNumber),
                deviceIdentifier: deviceId,
                joinCode: providedCode
            });

            if (res.data.status === 'LOCKED') {
                setIsLocked(true);
                setSessionId(res.data.sessionId);
                setShowJoinModal(true);
                return;
            }

            if (res.data.session?.id) {
                const sid = res.data.session.id;
                setSessionId(sid);
                setIsLocked(false);
                setShowJoinModal(false);
                AsyncStorage.setItem('active_session_id', sid);
            }
        } catch (error: any) {
            if (error.response?.status === 400 && !providedCode) {
                setIsLocked(false);
                setShowJoinModal(true);
            } else {
                Alert.alert('Session Error', error.response?.data?.error || 'Could not open table session.');
                navigation.navigate('Landing');
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
                AsyncStorage.setItem('active_session_id', sid);
            } catch (e: any) {
                Alert.alert('Error', e.response?.data?.error || 'Invalid code');
            }
        }
    };

    const handleForgotCode = async () => {
        try {
            await client.post('/session/forgot-code', { sessionId, cafeId, tableNumber });
            Alert.alert('Waiter Notified', 'The waiter has been notified and will provide your code shortly.');
        } catch (e) {
            Alert.alert('Error', 'Failed to notify waiter.');
        }
    };

    const initMenuAndSocket = (sid?: string, cid?: string) => {
        const targetId = sid || sessionId;
        if (!targetId) return;

        // Update local cafeId if provided from session
        if (cid) setCafeId(cid);

        fetchData(cid);
        const newSocket = io(SOCKET_URL);
        setSocket(newSocket);
        newSocket.emit('join_room', { room: targetId, role: 'CUSTOMER' });

        newSocket.on('order_status_update', (data: any) => {
            setOrders(prev => prev.map(o => o.id === data.orderId ? { ...o, status: data.status } : o));
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
        return menuItems.filter(item => {
            const matchesCat = selectedCategory === 'All' || item.category === selectedCategory;
            const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                                  (item.desc && item.desc.toLowerCase().includes(searchQuery.toLowerCase()));
            return matchesCat && matchesSearch;
        });
    }, [menuItems, selectedCategory, searchQuery]);

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

    const placeOrder = async () => {
        if (cart.length === 0 && !isPreOrderMode) return;
        setIsPlacingOrder(true);
        try {
            if (isPreOrderMode) {
                // PHASE 4: Pre-booking flow
                let deviceId = await AsyncStorage.getItem('deviceId');
                const res = await client.post('/reservation/book', {
                    cafeId,
                    tableId,
                    partySize: partySize || 2,
                    items: cart,
                    deviceIdentifier: deviceId
                });
                
                Alert.alert('Reservation Confirmed!', res.data.message);
                
                // Switch to active session mode using the newly created session
                const newSessionId = res.data.session.id;
                setSessionId(newSessionId);
                AsyncStorage.setItem('active_session_id', newSessionId);
                
                // Add the pre-order to local state if any items were ordered
                if (res.data.preOrder) {
                    setOrders([res.data.preOrder]);
                }
                
                setCart([]);
                setSpecialInstructions('');
                setCartModalVisible(false);
                
                // Clear the navigation history so they can't swipe back to TableSelection
                navigation.reset({
                    index: 0,
                    routes: [{ name: 'CustomerMenu', params: { sessionId: newSessionId, cafeId, tableNumber, isPrebooked: true, advancePaid: res.data.preOrder?.advancePaid } }],
                });
                
            } else {
                // NORMAL Ordering Flow
                const totalAmount = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
                const res = await client.post('/order/place', {
                    sessionId, 
                    items: cart, 
                    totalAmount, 
                    isLocationVerified,
                    specialInstructions: specialInstructions.trim() || undefined
                });

                if (res.data.alert) Alert.alert("Location Warning", res.data.alert);

                setOrders(prev => [...prev, res.data.order]);
                setCart([]);
                setSpecialInstructions('');
                setCartModalVisible(false);
                
                if (socket) socket.emit('new_order', res.data.order);
            }
        } catch (error: any) {
            Alert.alert('Error', error.response?.data?.error || 'Could not process your request. Check your connection.');
        } finally {
            setIsPlacingOrder(false);
        }
    };

    const callWaiterFn = () => {
        if (socket && sessionId) {
            socket.emit('call_waiter', {
                room: `WAITER_${cafeId}`,
                cafeId,
                tableId,
                sessionId,
                tableNumber,
                message: `Table ${tableNumber} needs assistance!`,
                type: 'WAITER_CALL'
            });
            Alert.alert("Assistance Requested", "A waiter will be with you shortly.");
        }
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
                        tableId,
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
                        tableId,
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

    const renderDietaryTag = (tag: string) => {
        if (!tag) return null;
        let color = '#94A3B8';
        if (tag === 'VEG') color = '#22C55E';
        if (tag === 'NON_VEG') color = '#EF4444';
        if (tag === 'VEGAN') color = '#10B981';
        if (tag === 'EGGETARIAN') color = '#F59E0B';

        return (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                <View style={[styles.dietSquare, { borderColor: color }]}>
                    <View style={[styles.dietDot, { backgroundColor: color }]} />
                </View>
                <Text style={{ fontSize: 10, color, marginLeft: 4, fontWeight: '700' }}>{tag.replace('_', ' ')}</Text>
            </View>
        );
    };

    const renderItem = ({ item }: any) => {
        const isSoldOut = !item.isAvailable || (cafe && !cafe.isActive);
        return (
            <View style={[
                styles.menuItem,
                isSoldOut && { opacity: 0.6 },
                numColumns > 1 && { width: (100 / numColumns) - 2 + '%' }
            ]}>
                {settings?.menuImagesEnabled && item.imageUrl && (
                    <Image source={{ uri: `${SOCKET_URL}${item.imageUrl}` }} style={styles.itemImage} resizeMode="cover" />
                )}
                
                <View style={styles.menuInfo}>
                    <Text style={styles.itemName}>{item.name}</Text>
                    {settings?.dietaryTagsEnabled && renderDietaryTag(item.dietaryTag)}
                    {item.desc ? <Text style={styles.itemDesc} numberOfLines={2}>{item.desc}</Text> : null}
                    <Text style={styles.itemPrice}>{settings?.currencySymbol || '$'}{item.price.toFixed(2)}</Text>
                    {isSoldOut && <Text style={styles.soldOutBadge}>SOLD OUT</Text>}
                </View>
                
                <TouchableOpacity
                    style={[styles.addButton, isSoldOut && styles.disabledButton]}
                    activeOpacity={0.7}
                    onPress={() => !isSoldOut && addToCart(item)}
                    disabled={isSoldOut}
                    accessibilityRole="button"
                    accessibilityLabel={isSoldOut ? `${item.name} is currently unavailable` : `Add ${item.name} to cart`}
                >
                    <Text style={[styles.addText, isSoldOut && { color: '#94A3B8' }]}>
                        {isSoldOut ? 'Unavailable' : '+ Add'}
                    </Text>
                </TouchableOpacity>
            </View>
        );
    };

    if (loading) {
        return (
            <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
                <ActivityIndicator size="large" color="#27AE60" />
                <Text style={{ marginTop: 10, color: '#7F8C8D' }}>Loading fresh menu...</Text>
            </View>
        );
    }

    const cartTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
    const pendingAmount = orders.reduce((sum, o) => sum + o.totalAmount, 0);

    return (
        <SafeAreaView style={styles.container}>
            <ResponsiveContainer maxWidth={1200} style={{ flex: 1 }}>
                
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
                        <View style={styles.headerTop}>
                            <View>
                                <Text style={styles.headerTitle}>{isPreOrderMode ? 'Pre-Order Menu' : 'Discover Menu'}</Text>
                                <Text style={styles.subHeader}>{cafe?.name || 'Loading Cafe...'} • Table {tableNumber}</Text>
                            </View>
                            {!isPreOrderMode && settings?.customerCanCallWaiter && (
                                <TouchableOpacity style={styles.callBtn} onPress={callWaiterFn}>
                                    <Text style={styles.callBtnText}>🔔 Waiter</Text>
                                </TouchableOpacity>
                            )}
                        </View>

                        {/* Search Bar */}
                        <View style={styles.searchContainer}>
                            <Text style={{ marginRight: 10, fontSize: 16 }}>🔍</Text>
                            <TextInput 
                                style={styles.searchInput}
                                placeholder="Search dishes..."
                                placeholderTextColor="#94A3B8"
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                            />
                        </View>

                        {/* Category Filter Tabs */}
                        <View style={{ paddingBottom: 10 }}>
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
                                    <Text style={styles.btnText}>{isPreOrderMode ? 'Review Reservation' : 'View Cart'}</Text>
                                    <Text style={styles.btnTextPrice}>{settings?.currencySymbol || '$'}{cartTotal.toFixed(2)}</Text>
                                </TouchableOpacity>
                            ) : orders.length > 0 ? (
                                <View style={styles.paymentSection}>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Text style={styles.pendingText}>Current Bill: {settings?.currencySymbol || '$'}{pendingAmount.toFixed(2)}</Text>
                                        <TouchableOpacity onPress={() => setCartModalVisible(true)}>
                                            <Text style={{ color: '#0EA5E9', fontWeight: '700', fontSize: 13 }}>View Session</Text>
                                        </TouchableOpacity>
                                    </View>
                                    
                                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10, marginBottom: 5 }}>
                                        {orders.map((o, i) => (
                                            <View key={o.id} style={{ backgroundColor: getStatusColor(o.status), paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
                                                <Text style={{ color: 'white', fontSize: 11, fontWeight: '700' }}>Order {i+1}: {o.status.replace('_', ' ')}</Text>
                                            </View>
                                        ))}
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
                        <Text style={styles.modalTitle}>{isLocked ? 'Enter Table Code' : 'Set Session Code'}</Text>
                        <Text style={styles.modalDesc}>
                            {isLocked ? 'Ask the person who scanned first for the code.' : 'Create a 4-digit code so others can join your table.'}
                        </Text>
                        <TextInput
                            style={styles.modalInputLarge}
                            placeholder="Code (e.g. 1234)"
                            keyboardType="number-pad"
                            maxLength={8}
                            value={joinCode}
                            onChangeText={setJoinCode}
                        />
                        <TouchableOpacity style={styles.modalBtn} onPress={handleJoinWithCode}>
                            <Text style={styles.modalBtnText}>{isLocked ? 'Join Session' : 'Start Session'}</Text>
                        </TouchableOpacity>
                        {isLocked && (
                            <TouchableOpacity onPress={handleForgotCode} style={{ marginTop: 15 }}>
                                <Text style={{ color: '#E74C3C', fontWeight: 'bold' }}>Forgot Code? Ask Waiter</Text>
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
                                <Text style={styles.taxNote}>* Final advance to pay now ({settings?.preOrderAdvanceRate || 30}% of order + {settings?.currencySymbol || '$'}{settings?.platformFeeAmount || 10} platform fee).</Text>
                                <View style={styles.paymentPreview}>
                                    <Text style={styles.previewLabel}>Pre-booking Advance:</Text>
                                    <Text style={styles.previewValueActive}>{settings?.currencySymbol || '$'}{((cartTotal * ((settings?.preOrderAdvanceRate || 30) / 100)) + (settings?.platformFeeAmount || 10)).toFixed(2)}</Text>
                                </View>
                            </View>
                        )}
                        
                        {!isPreOrderMode && settings?.taxEnabled && (
                            <Text style={styles.taxNote}>* Does not include {settings.taxLabel} ({settings.taxRate}%) and service charges which will be applied to final bill.</Text>
                        )}

                        <TouchableOpacity 
                            style={[styles.placeOrderBtnHeavy, isPlacingOrder && {opacity: 0.7}]} 
                            onPress={placeOrder} 
                            disabled={isPlacingOrder}
                            accessibilityRole="button"
                            accessibilityLabel={isPreOrderMode ? "Pay Advance and Confirm Reservation" : "Confirm and Place Order"}
                        >
                            <Text style={styles.btnText}>{isPlacingOrder ? 'Processing...' : (isPreOrderMode ? 'Pay Advance & Reserve' : 'Confirm & Place Order')}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Final Bill Modal */}
            <Modal visible={!!finalBill} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { maxHeight: '80%' }]}>
                        <Text style={styles.modalTitle}>Session Summary</Text>
                        <Text style={styles.modalSubtitle}>{finalBill?.cafeName} • Table {finalBill?.tableNumber}</Text>

                        <ScrollView style={{ width: '100%', marginVertical: 15 }}>
                            {finalBill?.items.map((item: any, idx: number) => (
                                <View key={idx} style={styles.billRow}>
                                    <Text style={styles.billItem}>{item.quantity}x {item.name}</Text>
                                    <Text style={styles.billPrice}>{settings?.currencySymbol || '$'}{(item.price * item.quantity).toFixed(2)}</Text>
                                </View>
                            ))}
                            <View style={styles.billTotalRow}>
                                <Text style={styles.billTotalLabel}>Subtotal</Text>
                                <Text style={styles.billTotalValue}>{settings?.currencySymbol || '$'}{finalBill?.subtotal?.toFixed(2)}</Text>
                            </View>
                            {(finalBill?.taxAmount > 0) && (
                                <View style={styles.billChargeRow}>
                                    <Text style={styles.billChargeLabel}>Tax</Text>
                                    <Text style={styles.billChargeValue}>{settings?.currencySymbol || '$'}{finalBill.taxAmount.toFixed(2)}</Text>
                                </View>
                            )}
                            {(finalBill?.serviceCharge > 0) && (
                                <View style={styles.billChargeRow}>
                                    <Text style={styles.billChargeLabel}>Service Charge</Text>
                                    <Text style={styles.billChargeValue}>{settings?.currencySymbol || '$'}{finalBill.serviceCharge.toFixed(2)}</Text>
                                </View>
                            )}
                            <View style={styles.billGrandTotalRow}>
                                <Text style={styles.billTotalLabel}>Grand Total</Text>
                                <Text style={styles.billTotalValue}>{settings?.currencySymbol || '$'}{finalBill?.grandTotal?.toFixed(2)}</Text>
                            </View>
                        </ScrollView>

                        <Text style={{ color: '#27AE60', fontWeight: '800', marginBottom: 20 }}>PAYMENT VERIFIED ✓</Text>

                        <TouchableOpacity style={styles.modalBtn} onPress={() => {
                            setFinalBill(null);
                            navigation.navigate('ScanTable');
                        }}>
                            <Text style={styles.modalBtnText}>Close & Return to Home</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#FAFAFA' },
    prebookBanner: { backgroundColor: '#E2F7E9', padding: 12, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#C0EED0' },
    prebookBannerText: { color: '#0A7A34', fontWeight: '700', fontSize: 13 },
    headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 10 },
    headerTitle: { fontSize: 26, fontWeight: '800', color: '#0F172A', letterSpacing: -0.5 },
    subHeader: { fontSize: 13, color: '#64748B', fontWeight: '600', marginTop: 2 },
    callBtn: { backgroundColor: '#F1F5F9', paddingHorizontal: 15, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0' },
    callBtnText: { color: '#0F172A', fontWeight: '700', fontSize: 12 },
    searchContainer: { marginHorizontal: 20, marginBottom: 15, flexDirection: 'row', alignItems: 'center', backgroundColor: '#F1F5F9', borderRadius: 12, paddingHorizontal: 15, height: 45 },
    searchInput: { flex: 1, fontSize: 15, color: '#0F172A' },
    categoryTabsWrap: { paddingHorizontal: 20, gap: 10 },
    catTab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
    catTabActive: { backgroundColor: '#0F172A', borderColor: '#0F172A' },
    catTabText: { color: '#64748B', fontWeight: '600', fontSize: 13 },
    catTabTextActive: { color: '#FFFFFF' },
    scrollContent: { paddingHorizontal: 20, paddingTop: 10 },
    menuItem: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        padding: 16, backgroundColor: '#FFFFFF', marginBottom: 15, borderRadius: 16,
        borderWidth: 1, borderColor: 'rgba(0,0,0,0.02)',
        ...Platform.select({ web: { boxShadow: '0 4px 10px rgba(0,0,0,0.03)' }, default: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 } }),
        width: '100%'
    },
    itemImage: { width: 60, height: 60, borderRadius: 12, marginRight: 15 },
    menuInfo: { flex: 1, paddingRight: 10 },
    itemName: { fontSize: 16, fontWeight: '700', color: '#0F172A', marginBottom: 2 },
    itemDesc: { fontSize: 12, color: '#64748B', marginBottom: 6, lineHeight: 16 },
    itemPrice: { fontSize: 15, fontWeight: '700', color: '#10B981' },
    dietSquare: { width: 10, height: 10, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
    dietDot: { width: 4, height: 4, borderRadius: 2 },
    addButton: { backgroundColor: '#F1F5F9', paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20 },
    addText: { color: '#0EA5E9', fontWeight: '700', fontSize: 13 },
    disabledButton: { backgroundColor: '#F8FAFC' },
    soldOutBadge: { color: '#EF4444', fontWeight: '800', fontSize: 10, marginTop: 4, letterSpacing: 0.5 },
    bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 20, paddingVertical: 15, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#F1F5F9' },
    viewCartBtn: { backgroundColor: '#0EA5E9', padding: 16, borderRadius: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
    cartBadge: { position: 'absolute', left: 20, backgroundColor: '#FFFFFF', width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    cartBadgeText: { color: '#0EA5E9', fontWeight: '800', fontSize: 12 },
    btnText: { color: '#FFF', fontWeight: '700', fontSize: 16 },
    btnTextPrice: { color: '#FFF', fontWeight: '800', fontSize: 16, position: 'absolute', right: 20 },
    paymentSection: { width: '100%' },
    pendingText: { fontSize: 14, fontWeight: '600', color: '#64748B', textAlign: 'center' },
    checkoutBtn: { flex: 1, padding: 14, borderRadius: 12, alignItems: 'center' },
    btnTextSecondary: { color: '#FFF', fontWeight: '700', fontSize: 14 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
    modalContent: { backgroundColor: 'white', padding: 30, borderRadius: 24, width: '100%', alignItems: 'center' },
    modalTitle: { fontSize: 22, fontWeight: '800', color: '#0F172A', marginBottom: 8 },
    modalSubtitle: { fontSize: 14, color: '#64748B', marginBottom: 20, fontWeight: '500' },
    modalDesc: { color: '#64748B', textAlign: 'center', marginBottom: 20, fontSize: 14 },
    modalInputLarge: { borderWidth: 2, borderColor: '#E2E8F0', padding: 15, width: '100%', borderRadius: 16, fontSize: 20, textAlign: 'center', marginBottom: 20, fontWeight: '700', color: '#0F172A' },
    modalInput: { borderWidth: 1, borderColor: '#E2E8F0', padding: 15, width: '100%', borderRadius: 12, fontSize: 14, backgroundColor: '#F8FAFC', color: '#0F172A', minHeight: 80, textAlignVertical: 'top' },
    modalBtn: { backgroundColor: '#10B981', padding: 16, borderRadius: 16, width: '100%', alignItems: 'center' },
    modalBtnText: { color: 'white', fontWeight: '800', fontSize: 16 },
    bottomSheetOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.6)', justifyContent: 'flex-end' },
    bottomSheet: { backgroundColor: '#FFFFFF', padding: 25, borderTopLeftRadius: 32, borderTopRightRadius: 32, maxHeight: '90%' },
    sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    sheetTitle: { fontSize: 22, fontWeight: '800', color: '#0F172A' },
    closeText: { fontSize: 15, fontWeight: '600', color: '#64748B' },
    cartRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
    cartItemName: { fontSize: 15, color: '#0F172A', fontWeight: '600', marginBottom: 4 },
    cartItemPrice: { fontSize: 14, color: '#10B981', fontWeight: '700' },
    qtyControls: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F1F5F9', borderRadius: 20, paddingHorizontal: 4, paddingVertical: 4 },
    qtyBtn: { width: 30, height: 30, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 15, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2 },
    qtyBtnText: { fontSize: 16, fontWeight: '600', color: '#0F172A' },
    qtyText: { paddingHorizontal: 12, fontSize: 15, fontWeight: '700', color: '#0F172A' },
    subsectionTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A', marginBottom: 10 },
    paymentPreview: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 15, borderTopWidth: 1, borderTopColor: '#E2E8F0' },
    previewLabel: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
    taxNote: { fontSize: 11, color: '#94A3B8', marginBottom: 20 },
    preOrderCalc: { backgroundColor: '#F0F9FF', padding: 15, borderRadius: 12, marginBottom: 20, borderWidth: 1, borderColor: '#BAE6FD' },
    previewValueActive: { fontSize: 18, fontWeight: '800', color: '#0EA5E9' },
    placeOrderBtnHeavy: { backgroundColor: '#0EA5E9', padding: 18, borderRadius: 16, alignItems: 'center' },
    billRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
    billItem: { fontSize: 14, color: '#475569', flex: 1 },
    billPrice: { fontSize: 14, color: '#0F172A', fontWeight: '600' },
    billTotalRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 15, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#E2E8F0' },
    billChargeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 5 },
    billChargeLabel: { fontSize: 13, color: '#64748B' },
    billChargeValue: { fontSize: 13, color: '#64748B' },
    billGrandTotalRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTopWidth: 2, borderTopColor: '#0F172A' },
    billTotalLabel: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
    billTotalValue: { fontSize: 18, fontWeight: '800', color: '#10B981' },
    historyContainer: { padding: 20, flex: 1, justifyContent: 'center' },
    card: { backgroundColor: '#FFFFFF', padding: 20, borderRadius: 16, marginBottom: 15, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
    cardTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A', marginBottom: 4 },
    cardSubtitle: { fontSize: 13, color: '#64748B', marginBottom: 10 },
    priceLabel: { fontSize: 15, fontWeight: '800', color: '#10B981' },
    emptyText: { textAlign: 'center', marginTop: 50, color: '#94A3B8', fontSize: 14, fontStyle: 'italic' }
} as any);
