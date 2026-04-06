import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, SafeAreaView, Image, Animated, Platform, TextInput } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Search, MapPin, Clock, Star, ArrowRight, Home, User } from 'lucide-react-native';
import client from '../api/client';
import ResponsiveContainer from '../components/ResponsiveContainer';

const AvailabilityPill = ({ available }: { available: boolean }) => {
    const pulseAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        if (available) {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, { toValue: 1.2, duration: 1000, useNativeDriver: true }),
                    Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
                ])
            ).start();
        }
    }, [available]);

    return (
        <View style={[styles.pillContainer, { backgroundColor: available ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)' }]}>
            <Animated.View style={[
                styles.pulseDot, 
                { 
                    backgroundColor: available ? '#10B981' : '#EF4444',
                    transform: [{ scale: pulseAnim }],
                    opacity: available ? 0.6 : 0.4
                }
            ]} />
            <Text style={[styles.pillText, { color: available ? '#10B981' : '#F87171' }]}>
                {available ? 'Tables Available' : 'Currently Full'}
            </Text>
        </View>
    );
};

export default function DiscoveryPortalScreen({ navigation }: any) {
    const [cafes, setCafes] = useState<any[]>([]);
    const [filteredCafes, setFilteredCafes] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchText, setSearchText] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('All');
    const scrollY = useRef(new Animated.Value(0)).current;

    const categories = ['All', 'Italian', 'Chinese', 'Cafe', 'Beverages', 'Indian', 'Desserts'];

    useEffect(() => {
        fetchCafes();
    }, []);

    useEffect(() => {
        filterResults();
    }, [searchText, selectedCategory, cafes]);

    const fetchCafes = async () => {
        setLoading(true);
        try {
            const res = await client.get('/discover/cafes');
            setCafes(res.data);
            setFilteredCafes(res.data);
        } catch (error: any) {
            Alert.alert('Error', 'Failed to load cafes.');
        } finally {
            setLoading(false);
        }
    };

    const filterResults = () => {
        let results = cafes;

        if (selectedCategory !== 'All') {
            results = results.filter(c => c.tags.includes(selectedCategory));
        }

        if (searchText.trim()) {
            const query = searchText.toLowerCase();
            results = results.filter(c => 
                c.name.toLowerCase().includes(query) || 
                (c.address && c.address.toLowerCase().includes(query))
            );
        }

        setFilteredCafes(results);
    };

    const handleCafeSelect = async (cafeId: string) => {
        const token = await AsyncStorage.getItem('userToken');
        if (!token) {
            Alert.alert(
                'Join the Community',
                'Log in to reserve your table and enjoy a premium dining experience.',
                [
                    { text: 'Later', style: 'cancel' },
                    { text: 'Log In Now', onPress: () => navigation.navigate('Login', { loginMode: 'customer' }) }
                ]
            );
            return;
        }
        navigation.navigate('TableSelection', { cafeId });
    };

    const handleTakeawayOrder = async (cafeId: string) => {
        const token = await AsyncStorage.getItem('userToken');
        if (!token) {
            Alert.alert(
                'Join the Community',
                'Log in to place takeaway orders.',
                [
                    { text: 'Later', style: 'cancel' },
                    { text: 'Log In Now', onPress: () => navigation.navigate('Login', { loginMode: 'customer' }) }
                ]
            );
            return;
        }
        navigation.navigate('TakeawayOrder', { cafeId });
    };

    const handlePreOrder = async (cafeId: string) => {
        const token = await AsyncStorage.getItem('userToken');
        if (!token) {
            Alert.alert(
                'Join the Community',
                'Log in to pre-order and reserve your table.',
                [
                    { text: 'Later', style: 'cancel' },
                    { text: 'Log In Now', onPress: () => navigation.navigate('Login', { loginMode: 'customer' }) }
                ]
            );
            return;
        }
        navigation.navigate('PreOrderFlow', { cafeId });
    };

    if (loading) {
        return (
            <SafeAreaView style={styles.centerContainer}>
                <StatusBar style="light" />
                <ActivityIndicator size="large" color="#38BDF8" />
                <Text style={styles.loadingText}>Curating nearby spots...</Text>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar style="light" />
            <ScrollView 
                showsVerticalScrollIndicator={false} 
                contentContainerStyle={styles.scrollContent}
                onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
                scrollEventThrottle={16}
            >
                <ResponsiveContainer maxWidth={800}>
                    {/* Hero Header */}
                    <View style={styles.header}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <View>
                                <Text style={styles.greeting}>Discover Unique</Text>
                                <Text style={styles.title}>Dining Spots</Text>
                            </View>
                            <View style={{ flexDirection: 'row', gap: 12 }}>
                                <TouchableOpacity onPress={() => navigation.navigate('CustomerProfile')} style={styles.homeBtn}>
                                    <User color="#38BDF8" size={24} />
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => navigation.navigate('Landing')} style={styles.homeBtn}>
                                    <Home color="#38BDF8" size={24} />
                                </TouchableOpacity>
                            </View>
                        </View>
                        
                        <View style={styles.searchBar}>
                            <Search color="#64748B" size={20} />
                            <TextInput 
                                style={styles.searchInput}
                                placeholder="Search for your favorite cafe..."
                                placeholderTextColor="#64748B"
                                value={searchText}
                                onChangeText={setSearchText}
                            />
                        </View>

                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll} contentContainerStyle={{ gap: 12 }}>
                            {categories.map((cat) => (
                                <TouchableOpacity 
                                    key={cat} 
                                    style={[styles.catChip, selectedCategory === cat && styles.catChipActive]}
                                    onPress={() => setSelectedCategory(cat)}
                                >
                                    <Text style={[styles.catText, selectedCategory === cat && styles.catTextActive]}>{cat}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>

                    {filteredCafes.length === 0 ? (
                        <View style={styles.emptyState}>
                            <Image 
                                source={{ uri: 'https://cdn-icons-png.flaticon.com/512/7486/7486744.png' }} 
                                style={styles.emptyImg} 
                            />
                            <Text style={styles.emptyTitle}>{searchText ? 'No Matches Found' : 'No Spots Found Yet'}</Text>
                            <Text style={styles.emptyText}>
                                {searchText ? `We couldn't find anything matching "${searchText}". Try a different term or clear the filters.` : "We're expanding rapidly. Check back soon for new premium spots!"}
                            </Text>
                            <TouchableOpacity style={styles.refreshBtn} onPress={() => { setSearchText(''); setSelectedCategory('All'); fetchCafes(); }}>
                                <Text style={styles.refreshBtnText}>Clear & Refresh</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <View style={styles.grid}>
                            {filteredCafes.map((cafe) => (
                                <TouchableOpacity 
                                    key={cafe.id} 
                                    style={styles.card} 
                                    activeOpacity={0.9}
                                    onPress={() => handleCafeSelect(cafe.id)}
                                >
                                    <View style={styles.imageContainer}>
                                        <Image 
                                            source={{ uri: cafe.featuredImage || 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?q=80&w=1000' }} 
                                            style={styles.cardBg} 
                                            resizeMode="cover"
                                        />
                                        <View style={styles.overlay} />
                                        <View style={styles.cardTopActions}>
                                            <TouchableOpacity style={styles.favBtn}>
                                                <Star color="#FACC15" size={16} fill="#FACC15" />
                                            </TouchableOpacity>
                                            <AvailabilityPill available={cafe.hasAvailableTables} />
                                        </View>
                                        
                                        <View style={styles.logoBadge}>
                                            {cafe.logoUrl ? (
                                                <Image source={{ uri: cafe.logoUrl }} style={styles.logo} />
                                            ) : (
                                                <Text style={styles.logoPlaceholder}>{cafe.name.charAt(0)}</Text>
                                            )}
                                        </View>
                                    </View>

                                    <View style={styles.cardInfo}>
                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <Text style={styles.cafeName}>{cafe.name}</Text>
                                            <Text style={styles.priceLevel}>{cafe.priceLevel}</Text>
                                        </View>

                                        <View style={styles.metaRow}>
                                            <MapPin color="#94A3B8" size={14} />
                                            <Text style={styles.addressText} numberOfLines={1}>
                                                {cafe.address || 'Local Eatery'}
                                            </Text>
                                        </View>

                                        <View style={styles.tagsContainer}>
                                            {cafe.categories?.slice(0, 3).map((tag: string, i: number) => (
                                                <View key={i} style={styles.tag}>
                                                    <Text style={styles.tagText}>{tag}</Text>
                                                </View>
                                            ))}
                                            {cafe.dietaryTags?.slice(0, 2).map((tag: string, i: number) => (
                                                <View key={i} style={[styles.tag, { backgroundColor: 'rgba(34, 197, 94, 0.1)' }]}>
                                                    <Text style={[styles.tagText, { color: '#22C55E' }]}>{tag}</Text>
                                                </View>
                                            ))}
                                            {cafe.settings.avgPrepTimeMinutes && (
                                                <View style={[styles.tag, { backgroundColor: 'rgba(56, 189, 248, 0.1)' }]}>
                                                    <Clock color="#38BDF8" size={12} style={{ marginRight: 4 }} />
                                                    <Text style={[styles.tagText, { color: '#38BDF8' }]}>{cafe.settings.avgPrepTimeMinutes}m</Text>
                                                </View>
                                            )}
                                        </View>

                                        <View style={styles.capacityInfo}>
                                            <Text style={styles.capacityText}>
                                                {cafe.availableTables} of {cafe.totalTables} tables available
                                            </Text>
                                            <Text style={styles.priceText}>
                                                {cafe.priceLevel} • {cafe.settings.currencySymbol}{cafe.settings.platformFeeAmount} platform fee
                                            </Text>
                                        </View>

                                        <View style={styles.actionButtons}>
                                            {cafe.hasAvailableTables && (
                                                <TouchableOpacity 
                                                    style={[styles.actionBtn, styles.dineInBtn]} 
                                                    onPress={() => handleCafeSelect(cafe.id)}
                                                >
                                                    <Text style={styles.actionBtnText}>Dine In</Text>
                                                </TouchableOpacity>
                                            )}
                                            {cafe.supportsTakeaway && (
                                                <TouchableOpacity 
                                                    style={[styles.actionBtn, styles.takeawayBtn]} 
                                                    onPress={() => handleTakeawayOrder(cafe.id)}
                                                >
                                                    <Text style={styles.actionBtnText}>Takeaway</Text>
                                                </TouchableOpacity>
                                            )}
                                            {cafe.supportsPreOrder && (
                                                <TouchableOpacity 
                                                    style={[styles.actionBtn, styles.preOrderBtn]} 
                                                    onPress={() => handlePreOrder(cafe.id)}
                                                >
                                                    <Text style={styles.actionBtnText}>Pre-Order</Text>
                                                </TouchableOpacity>
                                            )}
                                        </View>
                                    </View>
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}
                </ResponsiveContainer>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0F172A' },
    centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0F172A' },
    loadingText: { marginTop: 20, fontSize: 16, color: '#94A3B8', fontWeight: '600', letterSpacing: 0.5 },
    scrollContent: { paddingBottom: 40 },
    header: { padding: 24, paddingTop: 60, marginBottom: 10 },
    greeting: { fontSize: 18, color: '#38BDF8', fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 },
    title: { fontSize: 36, fontWeight: '900', color: '#FFFFFF', letterSpacing: -1 },
    homeBtn: { width: 48, height: 48, borderRadius: 16, backgroundColor: 'rgba(30, 41, 59, 0.7)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' },
    searchBar: { 
        flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(30, 41, 59, 0.7)', 
        borderRadius: 20, padding: 16, marginTop: 25, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' 
    },
    searchInput: { flex: 1, color: '#FFFFFF', marginLeft: 12, fontSize: 15, fontWeight: '500', padding: 0 },
    categoryScroll: { marginTop: 20, marginHorizontal: -24, paddingHorizontal: 24, marginBottom: 5 },
    catChip: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 14, backgroundColor: 'rgba(30, 41, 59, 0.5)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
    catChipActive: { backgroundColor: '#38BDF8', borderColor: '#38BDF8' },
    catText: { color: '#94A3B8', fontSize: 14, fontWeight: '700' },
    catTextActive: { color: '#0F172A' },
    
    grid: { paddingHorizontal: 24, gap: 24 },
    card: { 
        backgroundColor: '#1E293B', borderRadius: 28, overflow: 'hidden', 
        shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 20, elevation: 8,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)'
    },
    imageContainer: { height: 200, position: 'relative' },
    cardBg: { width: '100%', height: '100%' },
    overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.2)' },
    cardTopActions: { 
        position: 'absolute', top: 16, left: 16, right: 16, 
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' 
    },
    favBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
    
    pillContainer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
    pulseDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
    pillText: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },

    logoBadge: { 
        position: 'absolute', bottom: -20, left: 24, width: 64, height: 64, 
        borderRadius: 20, backgroundColor: '#1E293B', padding: 4,
        shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 5
    },
    logo: { width: '100%', height: '100%', borderRadius: 16 },
    logoPlaceholder: { color: '#38BDF8', fontSize: 32, fontWeight: '900', textAlign: 'center', lineHeight: 56 },

    cardInfo: { padding: 24, paddingTop: 35 },
    cafeName: { fontSize: 22, fontWeight: '800', color: '#FFFFFF', marginBottom: 4 },
    priceLevel: { fontSize: 16, fontWeight: '600', color: '#10B981' },
    metaRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
    addressText: { color: '#94A3B8', fontSize: 14, marginLeft: 6, fontWeight: '500' },
    
    tagsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
    tag: { backgroundColor: 'rgba(148, 163, 184, 0.1)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, flexDirection: 'row', alignItems: 'center' },
    tagText: { color: '#94A3B8', fontSize: 12, fontWeight: '700' },

    cardFooter: { 
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', 
        paddingTop: 15, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' 
    },
    bookText: { color: '#38BDF8', fontSize: 15, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },

    capacityInfo: { marginBottom: 20 },
    capacityText: { color: '#94A3B8', fontSize: 13, fontWeight: '500', marginBottom: 4 },
    priceText: { color: '#10B981', fontSize: 13, fontWeight: '600' },

    actionButtons: { flexDirection: 'row', gap: 8 },
    actionBtn: { 
        flex: 1, 
        paddingVertical: 12, 
        borderRadius: 12, 
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)'
    },
    dineInBtn: { backgroundColor: '#38BDF8' },
    takeawayBtn: { backgroundColor: '#10B981' },
    preOrderBtn: { backgroundColor: '#F59E0B' },
    actionBtnText: { color: '#0F172A', fontSize: 14, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },

    emptyState: { alignItems: 'center', marginTop: 80, paddingHorizontal: 40 },
    emptyImg: { width: 120, height: 120, opacity: 0.5, marginBottom: 20 },
    emptyTitle: { fontSize: 22, fontWeight: '800', color: '#FFFFFF', marginBottom: 10 },
    emptyText: { textAlign: 'center', color: '#64748B', fontSize: 15, lineHeight: 22, marginBottom: 30 },
    refreshBtn: { backgroundColor: '#38BDF8', paddingHorizontal: 30, paddingVertical: 14, borderRadius: 16 },
    refreshBtnText: { color: '#0F172A', fontWeight: '800', fontSize: 15 }
});
