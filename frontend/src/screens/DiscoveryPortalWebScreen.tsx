import React, { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import { Home, ListChecks, LogOut, MapPin, Navigation, Search, Settings, Star, User } from 'lucide-react-native';
import client from '../api/client';

type PlannerMode = 'preorder' | 'takeaway';
type TabKey = 'home' | 'booking' | 'profile' | 'settings';

const TRACKERS_KEY = 'discoveryTrackers';
const PROFILE_NAME_KEY = 'customerName';
const PROFILE_EMAIL_KEY = 'customerEmail';

function getIsoInOneHour() {
    return new Date(Date.now() + 60 * 60 * 1000).toISOString();
}

export default function DiscoveryPortalWebScreen({ navigation }: any) {
    const [activeTab, setActiveTab] = useState<TabKey>('home');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const [city, setCity] = useState('');
    const [locationLabel, setLocationLabel] = useState('Detecting location...');
    const [locationPermissionDenied, setLocationPermissionDenied] = useState(false);
    const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
    const [searchText, setSearchText] = useState('');
    const [radiusKm, setRadiusKm] = useState('20');
    const [savedTrackers, setSavedTrackers] = useState<any[]>([]);

    const [featuredCafes, setFeaturedCafes] = useState<any[]>([]);
    const [nearbyCafes, setNearbyCafes] = useState<any[]>([]);
    const [hasUserLocation, setHasUserLocation] = useState(false);

    const [plannerVisible, setPlannerVisible] = useState(false);
    const [plannerMode, setPlannerMode] = useState<PlannerMode>('preorder');
    const [selectedCafe, setSelectedCafe] = useState<any>(null);
    const [plannerLoading, setPlannerLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [menuItems, setMenuItems] = useState<any[]>([]);
    const [tablesAvailable, setTablesAvailable] = useState<any[]>([]);
    const [tablesQueueable, setTablesQueueable] = useState<any[]>([]);
    const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
    const [partySize, setPartySize] = useState('2');
    const [scheduledAt, setScheduledAt] = useState(getIsoInOneHour());
    const [bookingDurationMinutes, setBookingDurationMinutes] = useState(40);
    const [specialInstructions, setSpecialInstructions] = useState('');
    const [cart, setCart] = useState<{ id: string; name: string; price: number; quantity: number }[]>([]);
    const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
    const [tablePickerVisible, setTablePickerVisible] = useState(false);

    const [customerName, setCustomerName] = useState('');
    const [customerEmail, setCustomerEmail] = useState('');

    const [requestModalVisible, setRequestModalVisible] = useState(false);
    const [requestLocality, setRequestLocality] = useState('');
    const [requestNote, setRequestNote] = useState('');

    const handleLogout = async () => {
        await AsyncStorage.multiRemove(['userToken', 'user', 'activeSessionId']);
        navigation.replace('Landing');
    };

    useEffect(() => {
        bootstrap();
    }, []);

    async function bootstrap() {
        try {
            const [name, email, trackersRaw, userRaw] = await Promise.all([
                AsyncStorage.getItem(PROFILE_NAME_KEY),
                AsyncStorage.getItem(PROFILE_EMAIL_KEY),
                AsyncStorage.getItem(TRACKERS_KEY),
                AsyncStorage.getItem('user'),
            ]);
            if (name) setCustomerName(name);
            if (email) setCustomerEmail(email);
            if ((!name || !email) && userRaw) {
                try {
                    const user = JSON.parse(userRaw);
                    if (!name && user?.name) setCustomerName(user.name);
                    if (!email && user?.email) setCustomerEmail(user.email);
                } catch {
                    // Ignore parse issues for cached user payload.
                }
            }
            if (trackersRaw) {
                try {
                    const parsed = JSON.parse(trackersRaw);
                    setSavedTrackers(Array.isArray(parsed) ? parsed : []);
                } catch {
                    setSavedTrackers([]);
                }
            }
            await detectLocation();
        } finally {
            await fetchDiscovery();
            setLoading(false);
        }
    }

    async function detectLocation() {
        try {
            const permission = await Location.requestForegroundPermissionsAsync();
            if (permission.status !== 'granted') {
                setLocationPermissionDenied(true);
                setLocationLabel('Location permission denied');
                return;
            }

            setLocationPermissionDenied(false);
            const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            setUserCoords({ lat, lng });

            const reverse = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
            const place = reverse?.[0];
            const detectedCity = place?.city || place?.subregion || '';
            setCity(detectedCity);
            setLocationLabel([place?.district, place?.city].filter(Boolean).join(', ') || 'Current location');
        } catch {
            setLocationPermissionDenied(true);
            setLocationLabel('Could not detect location');
        }
    }

    async function fetchDiscovery() {
        try {
            if (!loading) setRefreshing(true);
            const query: string[] = [];
            if (userCoords) {
                query.push(`lat=${encodeURIComponent(userCoords.lat)}`);
                query.push(`lng=${encodeURIComponent(userCoords.lng)}`);
            }
            if (city.trim()) query.push(`city=${encodeURIComponent(city.trim())}`);
            if (radiusKm.trim()) query.push(`radius=${encodeURIComponent(radiusKm.trim())}`);
            const suffix = query.length ? `?${query.join('&')}` : '';

            const res = await client.get(`/discover/cafes${suffix}`);
            setFeaturedCafes(res.data?.featuredCafes || []);
            setNearbyCafes(res.data?.nearbyCafes || []);
            setHasUserLocation(Boolean(res.data?.hasUserLocation));
        } catch (error: any) {
            Alert.alert('Error', error.response?.data?.error || 'Failed to load nearby cafes.');
        } finally {
            setRefreshing(false);
        }
    }

    const visibleNearby = useMemo(() => {
        const query = searchText.trim().toLowerCase();
        if (!query) return nearbyCafes;
        return nearbyCafes.filter((cafe) =>
            cafe.name.toLowerCase().includes(query) ||
            (cafe.address || '').toLowerCase().includes(query)
        );
    }, [nearbyCafes, searchText]);

    const topRestaurants = useMemo(() => {
        return [...nearbyCafes]
            .sort((a, b) => {
                if ((b.isFeatured ? 1 : 0) !== (a.isFeatured ? 1 : 0)) {
                    return (b.isFeatured ? 1 : 0) - (a.isFeatured ? 1 : 0);
                }
                if ((b.availableTables || 0) !== (a.availableTables || 0)) {
                    return (b.availableTables || 0) - (a.availableTables || 0);
                }
                return (a.queuedReservations || 0) - (b.queuedReservations || 0);
            })
            .slice(0, 12);
    }, [nearbyCafes]);

    const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const platformFee = selectedCafe?.settings?.platformFeeAmount || 0;
    const advanceRate = selectedCafe?.settings?.preOrderAdvanceRate || 0;
    const payNow = subtotal * (advanceRate / 100) + platformFee;

    function addCart(item: any, delta: number) {
        setCart((previous) => {
            const existing = previous.find((entry) => entry.id === item.id);
            if (!existing && delta > 0) {
                return [...previous, { id: item.id, name: item.name, price: Number(item.price || 0), quantity: 1 }];
            }
            return previous
                .map((entry) => {
                    if (entry.id !== item.id) return entry;
                    const next = entry.quantity + delta;
                    return next > 0 ? { ...entry, quantity: next } : null;
                })
                .filter(Boolean) as any[];
        });
    }

    async function openPlanner(cafe: any, mode: PlannerMode) {
        setPlannerVisible(true);
        setPlannerMode(mode);
        setSelectedCafe(cafe);
        setSpecialInstructions('');
        setCart([]);
        setSelectedTableId(null);
        setMenuItems([]);
        setTablesAvailable([]);
        setTablesQueueable([]);
        setPlannerLoading(true);
        setExpandedCategory(null);
        setTablePickerVisible(false);

        try {
            const menuPromise = client.get(`/menu?cafeId=${cafe.id}`);
            const tablePromise = mode === 'preorder'
                ? client.get(`/discover/cafes/${cafe.id}/tables?partySize=${Math.max(1, parseInt(partySize, 10))}&scheduledAt=${encodeURIComponent(scheduledAt)}&slotMinutes=${bookingDurationMinutes}`)
                : Promise.resolve({ data: { tablesAvailable: [], tablesQueueable: [] } });

            const [menuRes, tableRes] = await Promise.all([menuPromise, tablePromise]);
            setMenuItems((menuRes.data || []).filter((item: any) => item.isAvailable !== false && item.isActive !== false));
            setTablesAvailable(tableRes.data.tablesAvailable || []);
            setTablesQueueable(tableRes.data.tablesQueueable || []);
            setSelectedTableId(tableRes.data.tablesAvailable?.[0]?.id || tableRes.data.tablesQueueable?.[0]?.id || null);
        } catch (error: any) {
            Alert.alert('Error', error.response?.data?.error || 'Failed to load booking planner.');
        } finally {
            setPlannerLoading(false);
        }
    }

    async function submitPlanner() {
        if (!selectedCafe) return;
        if (!customerName.trim() || !customerEmail.trim()) {
            Alert.alert('Missing profile', 'Enter your name and email in Profile tab first.');
            setActiveTab('profile');
            return;
        }
        if (cart.length === 0) {
            Alert.alert('Add items', 'Select at least one menu item.');
            return;
        }

        setSubmitting(true);
        try {
            await AsyncStorage.multiSet([
                [PROFILE_NAME_KEY, customerName.trim()],
                [PROFILE_EMAIL_KEY, customerEmail.trim().toLowerCase()],
            ]);

            if (plannerMode === 'takeaway') {
                const res = await client.post(`/discover/cafes/${selectedCafe.id}/takeaway`, {
                    items: cart,
                    specialInstructions: specialInstructions.trim() || undefined,
                    customerName: customerName.trim(),
                    customerEmail: customerEmail.trim().toLowerCase(),
                    pickupTime: scheduledAt,
                });

                const trackersRaw = await AsyncStorage.getItem(TRACKERS_KEY);
                const trackers = trackersRaw ? JSON.parse(trackersRaw) : [];
                trackers.unshift({ sessionId: res.data.session.id, cafeId: selectedCafe.id, mode: 'takeaway', cafeName: selectedCafe.name });
                await AsyncStorage.setItem(TRACKERS_KEY, JSON.stringify(trackers.slice(0, 20)));
                setSavedTrackers(trackers.slice(0, 20));

                Alert.alert('Takeaway confirmed', `Queue rank #${res.data.queuePosition}`);
            } else {
                if (!selectedTableId) {
                    Alert.alert('Select table', 'Choose a table first.');
                    return;
                }

                const res = await client.post(`/discover/cafes/${selectedCafe.id}/pre-order`, {
                    tableId: selectedTableId,
                    partySize: Math.max(1, parseInt(partySize || '1', 10)),
                    scheduledAt,
                    bookingDurationMinutes,
                    items: cart,
                    specialInstructions: specialInstructions.trim() || undefined,
                    customerName: customerName.trim(),
                    customerEmail: customerEmail.trim().toLowerCase(),
                });

                const trackersRaw = await AsyncStorage.getItem(TRACKERS_KEY);
                const trackers = trackersRaw ? JSON.parse(trackersRaw) : [];
                trackers.unshift({ sessionId: res.data.session.id, cafeId: selectedCafe.id, joinCode: res.data.joinCode, mode: 'preorder', cafeName: selectedCafe.name });
                await AsyncStorage.setItem(TRACKERS_KEY, JSON.stringify(trackers.slice(0, 20)));
                setSavedTrackers(trackers.slice(0, 20));

                Alert.alert('Preorder confirmed', res.data.queuePosition > 0 ? `Queue rank #${res.data.queuePosition}` : 'Your table slot is confirmed.');
            }

            setPlannerVisible(false);
            setActiveTab('booking');
        } catch (error: any) {
            Alert.alert('Failed', error.response?.data?.error || 'Booking failed');
        } finally {
            setSubmitting(false);
        }
    }

    async function submitCafeRequest() {
        try {
            await client.post('/discover/request-cafe', {
                city: city.trim() || 'Unknown City',
                locality: requestLocality.trim() || undefined,
                latitude: userCoords?.lat,
                longitude: userCoords?.lng,
                note: requestNote.trim() || undefined,
                customerEmail: customerEmail.trim() || undefined,
                customerName: customerName.trim() || undefined,
            });
            setRequestModalVisible(false);
            setRequestLocality('');
            setRequestNote('');
            Alert.alert('Request submitted', 'We will notify you when cafes are available near your area.');
        } catch (error: any) {
            Alert.alert('Failed', error.response?.data?.error || 'Could not submit request.');
        }
    }

    const renderCafeCard = (cafe: any, featured = false) => {
        const images = [];
        if (cafe.coverImage) images.push(cafe.coverImage);
        if (cafe.galleryImages) {
            images.push(...cafe.galleryImages.split(',').map((u: string) => u.trim()).filter(Boolean));
        }
        if (images.length === 0) images.push(cafe.featuredImage || 'https://images.unsplash.com/photo-1445116572660-236099ec97a0?q=80&w=1200');

        return (
            <TouchableOpacity
                key={cafe.id}
                style={[styles.cafeCard, featured && styles.featuredCard]}
                activeOpacity={0.9}
                onPress={() => navigation.navigate('CafeDetails', { cafe })}
            >
                <View style={styles.imageSliderContainer}>
                    <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={{ width: '100%', height: 128 }}>
                        {images.map((img, i) => (
                            <Image
                                key={i}
                                source={{ uri: img }}
                                style={{ width: featured ? 280 : '100%', height: 128, backgroundColor: '#E2E8F0' }}
                                resizeMode="cover"
                            />
                        ))}
                    </ScrollView>
                    {images.length > 1 && (
                        <View style={styles.sliderTracker}>
                            {images.map((_, i) => <View key={i} style={styles.sliderDot} />)}
                        </View>
                    )}
                </View>
                <View style={styles.cafeBody}>
                <View style={styles.cafeTitleRow}>
                    <Text style={styles.cafeTitle} numberOfLines={1}>{cafe.name}</Text>
                    {featured && <Star size={14} color="#F59E0B" fill="#F59E0B" />}
                </View>
                <Text style={styles.cafeMeta} numberOfLines={1}>{cafe.address || cafe.city || 'Cafe location'}</Text>
                <View style={styles.pillRow}>
                    <View style={styles.pill}>
                        <Text style={styles.pillText}>{cafe.availableTables}/{cafe.totalTables} tables</Text>
                    </View>
                    <View style={styles.pill}>
                        <Text style={styles.pillText}>{cafe.distanceKm !== null && cafe.distanceKm !== undefined ? `${cafe.distanceKm.toFixed(1)} km` : 'distance N/A'}</Text>
                    </View>
                </View>
                <View style={styles.actionRow}>
                    <TouchableOpacity style={styles.primaryBtnSmall} onPress={() => navigation.navigate('CafeDetails', { cafe })}>
                        <Text style={styles.primaryBtnSmallText}>View Cafe</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.secondaryBtnSmall} onPress={() => navigation.navigate('CafeDetails', { cafe })}>
                        <Text style={styles.secondaryBtnSmallText}>Open</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </TouchableOpacity>
        );
    };

    return (
        <View style={styles.screen}>
            <StatusBar style="dark" />
            {loading ? (
                <View style={styles.loadingWrap}>
                    <ActivityIndicator size="large" color="#0F172A" />
                    <Text style={styles.loadingText}>Loading cafes...</Text>
                </View>
            ) : (
                <View style={styles.shell}>
                    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
                        {activeTab === 'home' && (
                            <>
                                <View style={styles.topBar}>
                                    <TouchableOpacity style={styles.iconButton}>
                                        <Navigation size={18} color="#0F172A" />
                                    </TouchableOpacity>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.topLabel}>Your Location</Text>
                                        <Text style={styles.locationText}>{locationLabel}</Text>
                                    </View>
                                    <TouchableOpacity style={styles.avatarBtn} onPress={() => setActiveTab('profile')}>
                                        <User size={18} color="#0F172A" />
                                    </TouchableOpacity>
                                </View>

                                <View style={styles.searchBox}>
                                    <Search size={17} color="#94A3B8" />
                                    <TextInput
                                        style={styles.searchInput}
                                        placeholder="Search cafes"
                                        placeholderTextColor="#94A3B8"
                                        value={searchText}
                                        onChangeText={setSearchText}
                                    />
                                </View>

                                <View style={styles.bannerCard}>
                                    <Text style={styles.bannerTitle}>Featured Restaurants</Text>
                                    <Text style={styles.bannerSubTitle}>
                                        Admin-curated picks for {city || 'your city'}, sorted by distance.
                                    </Text>
                                    <TouchableOpacity style={styles.bannerCta} onPress={fetchDiscovery} disabled={refreshing}>
                                        <Text style={styles.bannerCtaText}>{refreshing ? 'Refreshing...' : 'Refresh Feed'}</Text>
                                    </TouchableOpacity>
                                </View>

                                <View style={styles.sectionHeader}>
                                    <Text style={styles.sectionTitle}>Featured Restaurants</Text>
                                </View>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalList}>
                                    {featuredCafes.length === 0 ? (
                                        <View style={styles.emptyInline}><Text style={styles.emptyInlineText}>No featured cafes in this city yet.</Text></View>
                                    ) : (
                                        featuredCafes.map((cafe) => (
                                            <View key={cafe.id} style={styles.horizontalCard}>{renderCafeCard(cafe, true)}</View>
                                        ))
                                    )}
                                </ScrollView>

                                <View style={styles.sectionHeader}>
                                    <Text style={styles.sectionTitle}>{hasUserLocation ? 'Nearby Cafes' : 'Top Restaurants'}</Text>
                                </View>

                                {!hasUserLocation ? (
                                    topRestaurants.length === 0 ? (
                                        <View style={styles.emptyStateCard}>
                                            <MapPin size={34} color="#0F172A" />
                                            <Text style={styles.emptyStateTitle}>Location is off</Text>
                                            <Text style={styles.emptyStateText}>
                                                Enable location permission to get cafes sorted by distance, or browse top restaurants below.
                                            </Text>
                                            <TouchableOpacity style={styles.secondaryAction} onPress={detectLocation}>
                                                <Text style={styles.secondaryActionText}>Enable Location & Retry</Text>
                                            </TouchableOpacity>
                                        </View>
                                    ) : (
                                        topRestaurants.map((cafe) => renderCafeCard(cafe))
                                    )
                                ) : visibleNearby.length === 0 ? (
                                    <View style={styles.emptyStateCard}>
                                        <MapPin size={34} color="#0F172A" />
                                        <Text style={styles.emptyStateTitle}>No cafes near you</Text>
                                        <Text style={styles.emptyStateText}>
                                            We could not find cafes in your nearby area. Request onboarding for your locality.
                                        </Text>
                                        <TouchableOpacity style={styles.primaryAction} onPress={() => setRequestModalVisible(true)}>
                                            <Text style={styles.primaryActionText}>Request Cafe Near You</Text>
                                        </TouchableOpacity>
                                        {!hasUserLocation && (
                                            <TouchableOpacity style={styles.secondaryAction} onPress={detectLocation}>
                                                <Text style={styles.secondaryActionText}>Enable Location & Retry</Text>
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                ) : visibleNearby.map((cafe) => renderCafeCard(cafe))}
                            </>
                        )}

                        {activeTab === 'booking' && (
                            <View style={styles.placeholderCard}>
                                <Text style={styles.placeholderTitle}>Current Booking</Text>
                                <Text style={styles.placeholderText}>
                                    Track your latest preorder/takeaway confirmations. Queue rank and slot updates are also visible in Booking History.
                                </Text>
                                <View style={styles.infoRow}>
                                    <Text style={styles.infoLabel}>Saved trackers</Text>
                                    <Text style={styles.infoValue}>{savedTrackers.length}</Text>
                                </View>
                                {savedTrackers.slice(0, 3).map((tracker, index) => (
                                    <View key={`${tracker.sessionId}-${index}`} style={styles.trackerCard}>
                                        <Text style={styles.trackerTitle}>{tracker.cafeName || 'Cafe'}</Text>
                                        <Text style={styles.trackerMeta}>
                                            {tracker.mode === 'preorder' ? 'Preorder' : 'Takeaway'} | Session {String(tracker.sessionId || '').slice(0, 8)}
                                        </Text>
                                    </View>
                                ))}
                                <TouchableOpacity style={styles.primaryAction} onPress={() => navigation.navigate('CustomerProfile')}>
                                    <Text style={styles.primaryActionText}>Open Booking History</Text>
                                </TouchableOpacity>
                            </View>
                        )}

                        {activeTab === 'profile' && (
                            <View style={styles.placeholderCard}>
                                <Text style={styles.placeholderTitle}>Profile</Text>
                                <View style={styles.infoRow}>
                                    <Text style={styles.infoLabel}>Location mode</Text>
                                    <Text style={styles.infoValue}>{hasUserLocation ? 'Precise nearby' : 'Top restaurants fallback'}</Text>
                                </View>
                                <View style={styles.infoRow}>
                                    <Text style={styles.infoLabel}>Saved queue trackers</Text>
                                    <Text style={styles.infoValue}>{savedTrackers.length}</Text>
                                </View>
                                <TextInput style={styles.input} value={customerName} onChangeText={setCustomerName} placeholder="Your name" placeholderTextColor="#94A3B8" />
                                <TextInput style={styles.input} value={customerEmail} onChangeText={setCustomerEmail} placeholder="Your email" placeholderTextColor="#94A3B8" autoCapitalize="none" />
                                <TouchableOpacity
                                    style={styles.primaryAction}
                                    onPress={async () => {
                                        await AsyncStorage.multiSet([
                                            [PROFILE_NAME_KEY, customerName.trim()],
                                            [PROFILE_EMAIL_KEY, customerEmail.trim().toLowerCase()],
                                        ]);
                                        Alert.alert('Saved', 'Profile updated.');
                                    }}
                                >
                                    <Text style={styles.primaryActionText}>Save Profile</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.secondaryAction} onPress={() => navigation.navigate('CustomerProfile')}>
                                    <Text style={styles.secondaryActionText}>Open Full Profile & History</Text>
                                </TouchableOpacity>
                            </View>
                        )}

                        {activeTab === 'settings' && (
                            <View style={styles.placeholderCard}>
                                <Text style={styles.placeholderTitle}>Settings</Text>
                                <Text style={styles.placeholderText}>
                                    Tune discovery behavior for your city and search radius. If location is denied, app automatically falls back to top restaurants.
                                </Text>
                                <TextInput
                                    style={styles.input}
                                    value={city}
                                    onChangeText={setCity}
                                    placeholder="Preferred city"
                                    placeholderTextColor="#94A3B8"
                                />
                                <TextInput
                                    style={styles.input}
                                    value={radiusKm}
                                    onChangeText={setRadiusKm}
                                    placeholder="Search radius in km (1-100)"
                                    placeholderTextColor="#94A3B8"
                                    keyboardType="number-pad"
                                />
                                <TouchableOpacity style={styles.primaryAction} onPress={fetchDiscovery}>
                                    <Text style={styles.primaryActionText}>Apply Discovery Filters</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.secondaryAction} onPress={detectLocation}>
                                    <Text style={styles.secondaryActionText}>{locationPermissionDenied ? 'Retry Location Permission' : 'Refresh Current Location'}</Text>
                                </TouchableOpacity>
                                <View style={styles.infoRow}>
                                    <Text style={styles.infoLabel}>Permission status</Text>
                                    <Text style={styles.infoValue}>{locationPermissionDenied ? 'Denied / unavailable' : 'Granted'}</Text>
                                </View>
                                <View style={{ marginTop: 20 }}>
                                    <TouchableOpacity style={styles.dangerButton} onPress={handleLogout}>
                                        <LogOut color="#B91C1C" size={16} />
                                        <Text style={styles.dangerButtonText}>Logout of Account</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        )}
                    </ScrollView>

                    <View style={styles.bottomNav}>
                        <TabButton icon={<Home size={18} color={activeTab === 'home' ? '#fff' : '#64748B'} />} label="Home" active={activeTab === 'home'} onPress={() => setActiveTab('home')} />
                        <TabButton icon={<ListChecks size={18} color={activeTab === 'booking' ? '#fff' : '#64748B'} />} label="Booking" active={activeTab === 'booking'} onPress={() => setActiveTab('booking')} />
                        <TabButton icon={<User size={18} color={activeTab === 'profile' ? '#fff' : '#64748B'} />} label="Profile" active={activeTab === 'profile'} onPress={() => setActiveTab('profile')} />
                        <TabButton icon={<Settings size={18} color={activeTab === 'settings' ? '#fff' : '#64748B'} />} label="Settings" active={activeTab === 'settings'} onPress={() => setActiveTab('settings')} />
                    </View>
                </View>
            )}

            <Modal visible={requestModalVisible} transparent animationType="slide" onRequestClose={() => setRequestModalVisible(false)}>
                <View style={styles.modalWrap}>
                    <View style={styles.modalCard}>
                        <Text style={styles.modalTitle}>Request a cafe near you</Text>
                        <TextInput style={styles.input} value={city} onChangeText={setCity} placeholder="City" placeholderTextColor="#94A3B8" />
                        <TextInput style={styles.input} value={requestLocality} onChangeText={setRequestLocality} placeholder="Locality / Area" placeholderTextColor="#94A3B8" />
                        <TextInput style={[styles.input, { minHeight: 90 }]} multiline value={requestNote} onChangeText={setRequestNote} placeholder="Anything specific?" placeholderTextColor="#94A3B8" />
                        <TouchableOpacity style={styles.primaryAction} onPress={submitCafeRequest}>
                            <Text style={styles.primaryActionText}>Submit Request</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.secondaryAction} onPress={() => setRequestModalVisible(false)}>
                            <Text style={styles.secondaryActionText}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            <Modal visible={plannerVisible} transparent animationType="slide" onRequestClose={() => setPlannerVisible(false)}>
                <View style={styles.modalWrap}>
                    <View style={styles.modalCard}>
                        <ScrollView showsVerticalScrollIndicator={false}>
                            <Text style={styles.modalTitle}>{plannerMode === 'preorder' ? 'Preorder Table' : 'Takeaway Order'}</Text>
                            <Text style={styles.modalSubTitle}>{selectedCafe?.name}</Text>

                            <View style={styles.segmentRow}>
                                <TouchableOpacity style={[styles.segment, plannerMode === 'preorder' && styles.segmentActive]} onPress={() => setPlannerMode('preorder')}>
                                    <Text style={[styles.segmentText, plannerMode === 'preorder' && styles.segmentTextActive]}>Preorder</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.segment, plannerMode === 'takeaway' && styles.segmentActive]} onPress={() => setPlannerMode('takeaway')}>
                                    <Text style={[styles.segmentText, plannerMode === 'takeaway' && styles.segmentTextActive]}>Takeaway</Text>
                                </TouchableOpacity>
                            </View>

                            <TextInput style={styles.input} value={partySize} onChangeText={setPartySize} keyboardType="number-pad" placeholder="Party size" placeholderTextColor="#94A3B8" />
                            <TextInput style={styles.input} value={scheduledAt} onChangeText={setScheduledAt} placeholder="ISO datetime (e.g. 2026-04-25T12:00:00.000Z)" placeholderTextColor="#94A3B8" />

                            {plannerMode === 'preorder' && (
                                <View style={styles.durationRow}>
                                    {[40, 60, 90].map((d) => (
                                        <TouchableOpacity key={d} style={[styles.durationChip, bookingDurationMinutes === d && styles.durationChipActive]} onPress={() => setBookingDurationMinutes(d)}>
                                            <Text style={[styles.durationText, bookingDurationMinutes === d && styles.durationTextActive]}>{d}m</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            )}

                            {plannerMode === 'preorder' && (
                                <View style={{ marginBottom: 14 }}>
                                    <Text style={styles.listTitle}>Table Selection</Text>
                                    <TouchableOpacity 
                                        style={styles.tableSelectBtn} 
                                        onPress={() => setTablePickerVisible(!tablePickerVisible)}
                                    >
                                        <Text style={styles.tableSelectBtnText}>
                                            {selectedTableId 
                                                ? `Table ${[...tablesAvailable, ...tablesQueueable].find(t => t.id === selectedTableId)?.number || ''} Selected` 
                                                : 'Select a Table'}
                                        </Text>
                                    </TouchableOpacity>

                                    {tablePickerVisible && (
                                        <View style={styles.tablePickerContainer}>
                                            {plannerLoading ? <ActivityIndicator color="#0F172A" /> : [...tablesAvailable, ...tablesQueueable].map((table) => (
                                                <TouchableOpacity 
                                                    key={table.id} 
                                                    style={[styles.tableCard, selectedTableId === table.id && styles.tableCardActive]} 
                                                    onPress={() => {
                                                        setSelectedTableId(table.id);
                                                        setTablePickerVisible(false);
                                                    }}
                                                >
                                                    <Text style={styles.tableTitle}>Table {table.number} ({table.capacity} seats)</Text>
                                                    <Text style={styles.tableMeta}>{table.waitMinutes > 0 ? `Queue #${table.queuePosition} · ${table.waitMinutes} min` : 'Available for selected time'}</Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                    )}
                                </View>
                            )}

                            <Text style={styles.listTitle}>Menu Items</Text>
                            {Array.from(new Set(menuItems.map(m => m.category || 'General'))).map((category) => {
                                const categoryItems = menuItems.filter(m => (m.category || 'General') === category);
                                const isExpanded = expandedCategory === category;
                                return (
                                    <View key={category} style={styles.categoryWrap}>
                                        <TouchableOpacity 
                                            style={styles.categoryHeader} 
                                            onPress={() => setExpandedCategory(isExpanded ? null : category)}
                                        >
                                            <Text style={styles.categoryTitle}>{category} ({categoryItems.length})</Text>
                                            <Text style={styles.categoryIcon}>{isExpanded ? '−' : '+'}</Text>
                                        </TouchableOpacity>
                                        
                                        {isExpanded && categoryItems.map((item) => {
                                            const qty = cart.find((x) => x.id === item.id)?.quantity || 0;
                                            return (
                                                <View key={item.id} style={styles.menuRow}>
                                                    <View style={{ flex: 1 }}>
                                                        <Text style={styles.menuName}>{item.name}</Text>
                                                        <Text style={styles.menuPrice}>Rs. {Number(item.price || 0).toFixed(0)}</Text>
                                                    </View>
                                                    <View style={styles.qtyRow}>
                                                        <TouchableOpacity style={styles.qtyBtn} onPress={() => addCart(item, -1)}><Text style={styles.qtyBtnText}>-</Text></TouchableOpacity>
                                                        <Text style={styles.qtyValue}>{qty}</Text>
                                                        <TouchableOpacity style={styles.qtyBtn} onPress={() => addCart(item, 1)}><Text style={styles.qtyBtnText}>+</Text></TouchableOpacity>
                                                    </View>
                                                </View>
                                            );
                                        })}
                                    </View>
                                );
                            })}

                            <TextInput style={[styles.input, { minHeight: 80 }]} multiline value={specialInstructions} onChangeText={setSpecialInstructions} placeholder="Special instructions" placeholderTextColor="#94A3B8" />

                            <View style={styles.summary}>
                                <Text style={styles.summaryLine}>Subtotal: Rs. {subtotal.toFixed(2)}</Text>
                                <Text style={styles.summaryLine}>Advance: {advanceRate}%</Text>
                                <Text style={styles.summaryLine}>Platform fee: Rs. {platformFee.toFixed(2)}</Text>
                                <Text style={styles.summaryTotal}>Pay now: Rs. {payNow.toFixed(2)}</Text>
                            </View>

                            <TouchableOpacity style={styles.primaryAction} onPress={submitPlanner} disabled={submitting}>
                                <Text style={styles.primaryActionText}>{submitting ? 'Processing...' : 'Confirm Booking'}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.secondaryAction} onPress={() => setPlannerVisible(false)}>
                                <Text style={styles.secondaryActionText}>Close</Text>
                            </TouchableOpacity>
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

function TabButton({ icon, label, active, onPress }: { icon: React.ReactNode; label: string; active: boolean; onPress: () => void }) {
    return (
        <TouchableOpacity style={[styles.tabBtn, active && styles.tabBtnActive]} onPress={onPress}>
            {icon}
            <Text style={[styles.tabBtnText, active && styles.tabBtnTextActive]}>{label}</Text>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: '#EEF1F4' },
    shell: { flex: 1, width: '100%', maxWidth: 560, alignSelf: 'center', backgroundColor: '#F8FAFC' },
    scroll: { padding: 14, paddingBottom: 120 },
    loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    loadingText: { marginTop: 10, color: '#64748B', fontWeight: '600' },

    topBar: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
    iconButton: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', marginRight: 10, borderWidth: 1, borderColor: '#E2E8F0' },
    topLabel: { color: '#64748B', fontSize: 12, fontWeight: '700' },
    locationText: { color: '#0F172A', fontSize: 15, fontWeight: '800' },
    avatarBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E2E8F0' },

    searchBox: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#E2E8F0', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12 },
    searchInput: { flex: 1, marginLeft: 8, color: '#0F172A', fontWeight: '600' },

    bannerCard: { backgroundColor: '#0F172A', borderRadius: 18, padding: 16, marginBottom: 14 },
    bannerTitle: { color: '#fff', fontSize: 24, fontWeight: '900', marginBottom: 6 },
    bannerSubTitle: { color: '#CBD5E1', lineHeight: 21, marginBottom: 12, fontWeight: '600' },
    bannerCta: { alignSelf: 'flex-start', backgroundColor: '#22C55E', paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999 },
    bannerCtaText: { color: '#fff', fontWeight: '800' },

    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, marginBottom: 8 },
    sectionTitle: { color: '#0F172A', fontSize: 24, fontWeight: '900' },
    horizontalList: { paddingBottom: 6 },
    horizontalCard: { width: 280, marginRight: 10 },
    emptyInline: { width: 280, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', justifyContent: 'center', alignItems: 'center', padding: 18 },
    emptyInlineText: { color: '#64748B', textAlign: 'center', fontWeight: '600' },

    cafeCard: { backgroundColor: '#fff', borderRadius: 18, borderWidth: 1, borderColor: '#E2E8F0', overflow: 'hidden', marginBottom: 12 },
    featuredCard: { borderColor: '#FCD34D' },
    imageSliderContainer: { width: '100%', height: 128, position: 'relative' },
    sliderTracker: { position: 'absolute', bottom: 8, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 6 },
    sliderDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.8)' },
    cafeImage: { width: '100%', height: 128, backgroundColor: '#E2E8F0' },
    cafeBody: { padding: 12 },
    cafeTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    cafeTitle: { color: '#0F172A', fontSize: 18, fontWeight: '900', flex: 1, marginRight: 6 },
    cafeMeta: { color: '#64748B', marginTop: 4, marginBottom: 8, fontWeight: '600' },
    pillRow: { flexDirection: 'row', marginBottom: 10 },
    pill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', marginRight: 8 },
    pillText: { color: '#334155', fontSize: 12, fontWeight: '700' },
    actionRow: { flexDirection: 'row' },
    primaryBtnSmall: { flex: 1, backgroundColor: '#0F172A', borderRadius: 10, paddingVertical: 11, alignItems: 'center', marginRight: 6 },
    primaryBtnSmallText: { color: '#fff', fontWeight: '800' },
    secondaryBtnSmall: { flex: 1, backgroundColor: '#ECFDF5', borderRadius: 10, borderWidth: 1, borderColor: '#BBF7D0', paddingVertical: 11, alignItems: 'center' },
    secondaryBtnSmallText: { color: '#065F46', fontWeight: '800' },

    emptyStateCard: { backgroundColor: '#fff', borderRadius: 18, borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center', padding: 22 },
    emptyStateTitle: { color: '#0F172A', fontSize: 22, fontWeight: '900', marginTop: 10, marginBottom: 8 },
    emptyStateText: { color: '#64748B', textAlign: 'center', lineHeight: 22, marginBottom: 12, fontWeight: '600' },

    placeholderCard: { backgroundColor: '#fff', borderRadius: 18, borderWidth: 1, borderColor: '#E2E8F0', padding: 16 },
    placeholderTitle: { color: '#0F172A', fontSize: 22, fontWeight: '900', marginBottom: 8 },
    placeholderText: { color: '#64748B', lineHeight: 22, marginBottom: 12, fontWeight: '600' },
    infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, backgroundColor: '#F8FAFC', paddingHorizontal: 10, paddingVertical: 8, marginBottom: 8 },
    infoLabel: { color: '#475569', fontWeight: '700' },
    infoValue: { color: '#0F172A', fontWeight: '800' },
    trackerCard: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, backgroundColor: '#FFFFFF', padding: 10, marginBottom: 8 },
    trackerTitle: { color: '#0F172A', fontWeight: '800', marginBottom: 3 },
    trackerMeta: { color: '#64748B', fontWeight: '600' },
    input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12, color: '#0F172A', marginBottom: 10, fontWeight: '600' },

    primaryAction: { backgroundColor: '#0F172A', borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 4 },
    primaryActionText: { color: '#fff', fontWeight: '800' },
    secondaryAction: { borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 10, backgroundColor: '#fff' },
    secondaryActionText: { color: '#0F172A', fontWeight: '700' },

    bottomNav: { position: 'absolute', left: 10, right: 10, bottom: 10, flexDirection: 'row', backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 16, padding: 8 },
    tabBtn: { flex: 1, alignItems: 'center', borderRadius: 10, paddingVertical: 7 },
    tabBtnActive: { backgroundColor: '#0F172A' },
    tabBtnText: { fontSize: 11, color: '#64748B', marginTop: 3, fontWeight: '700' },
    tabBtnTextActive: { color: '#fff' },

    modalWrap: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.55)', justifyContent: 'center', padding: 12 },
    modalCard: { backgroundColor: '#F8FAFC', borderRadius: 18, borderWidth: 1, borderColor: '#E2E8F0', maxHeight: '94%', padding: 14 },
    modalTitle: { color: '#0F172A', fontSize: 24, fontWeight: '900', marginBottom: 6 },
    modalSubTitle: { color: '#64748B', marginBottom: 10, fontWeight: '700' },

    segmentRow: { flexDirection: 'row', marginBottom: 10 },
    segment: { flex: 1, borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 999, paddingVertical: 9, alignItems: 'center', backgroundColor: '#fff', marginRight: 8 },
    segmentActive: { backgroundColor: '#0F172A', borderColor: '#0F172A' },
    segmentText: { color: '#334155', fontWeight: '700' },
    segmentTextActive: { color: '#fff' },

    durationRow: { flexDirection: 'row', marginBottom: 10 },
    durationChip: { borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, marginRight: 8, backgroundColor: '#fff' },
    durationChipActive: { backgroundColor: '#0F172A', borderColor: '#0F172A' },
    durationText: { color: '#334155', fontWeight: '700' },
    durationTextActive: { color: '#fff' },

    listTitle: { color: '#0F172A', fontWeight: '900', fontSize: 17, marginBottom: 8, marginTop: 4 },
    tableSelectBtn: { borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 12, backgroundColor: '#F8FAFC', marginBottom: 8 },
    tableSelectBtnText: { color: '#0F172A', fontWeight: '700', textAlign: 'center' },
    tablePickerContainer: { backgroundColor: '#F1F5F9', borderRadius: 12, padding: 10, marginBottom: 10 },
    tableCard: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, padding: 10, marginBottom: 8, backgroundColor: '#fff' },
    tableCardActive: { borderColor: '#0F172A', backgroundColor: '#EEF2FF' },
    tableTitle: { color: '#0F172A', fontWeight: '800', marginBottom: 3 },
    tableMeta: { color: '#64748B', fontWeight: '600' },

    categoryWrap: { marginBottom: 10 },
    categoryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F8FAFC', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0' },
    categoryTitle: { color: '#0F172A', fontWeight: '800', fontSize: 15 },
    categoryIcon: { color: '#64748B', fontWeight: '900', fontSize: 18 },

    menuRow: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, backgroundColor: '#fff', padding: 10, marginBottom: 8, marginTop: 8, flexDirection: 'row', alignItems: 'center' },
    menuName: { color: '#0F172A', fontWeight: '800' },
    menuPrice: { color: '#64748B', marginTop: 2, fontWeight: '600' },
    qtyRow: { flexDirection: 'row', alignItems: 'center' },
    qtyBtn: { width: 28, height: 28, borderRadius: 8, backgroundColor: '#0F172A', alignItems: 'center', justifyContent: 'center' },
    qtyBtnText: { color: '#fff', fontSize: 16, fontWeight: '900' },
    qtyValue: { minWidth: 24, textAlign: 'center', color: '#0F172A', fontWeight: '800' },

    summary: { borderRadius: 12, backgroundColor: '#0F172A', padding: 12, marginTop: 4 },
    summaryLine: { color: '#CBD5E1', marginBottom: 3, fontWeight: '600' },
    summaryTotal: { color: '#FDE68A', fontSize: 18, fontWeight: '900', marginTop: 4 },

    dangerButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF1F2', paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: '#FECACA' },
    dangerButtonText: { color: '#B91C1C', fontWeight: '800', marginLeft: 8 },
});
