import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Image, TextInput, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Search, MapPin, Clock, Home, User } from 'lucide-react-native';
import client from '../api/client';
import ResponsiveContainer from '../components/ResponsiveContainer';

export default function DiscoveryPortalWebScreen({ navigation }: any) {
    const [cafes, setCafes] = useState<any[]>([]);
    const [filteredCafes, setFilteredCafes] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchText, setSearchText] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('All');
    const { width } = useWindowDimensions();
    const isWide = width >= 980;

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
            results = results.filter((c) => c.tags?.includes(selectedCategory) || c.categories?.includes(selectedCategory));
        }

        if (searchText.trim()) {
            const query = searchText.toLowerCase();
            results = results.filter((c) =>
                c.name.toLowerCase().includes(query) ||
                (c.address && c.address.toLowerCase().includes(query))
            );
        }

        setFilteredCafes(results);
    };

    const requireLogin = async (message: string, callback: () => void) => {
        const token = await AsyncStorage.getItem('userToken');
        if (!token) {
            Alert.alert(
                'Log in required',
                message,
                [
                    { text: 'Later', style: 'cancel' },
                    { text: 'Log In', onPress: () => navigation.navigate('Login', { loginMode: 'customer' }) },
                ]
            );
            return;
        }
        callback();
    };

    const handleCafeSelect = (cafeId: string) => {
        requireLogin('Log in to reserve your table and continue your dining journey.', () => {
            navigation.navigate('TableSelection', { cafeId });
        });
    };

    const handleTakeawayOrder = (cafeId: string) => {
        requireLogin('Log in to place takeaway orders.', () => {
            navigation.navigate('TakeawayOrder', { cafeId });
        });
    };

    const handlePreOrder = (cafeId: string) => {
        requireLogin('Log in to pre-order and reserve your table.', () => {
            navigation.navigate('PreOrderFlow', { cafeId });
        });
    };

    if (loading) {
        return (
            <View style={styles.loadingScreen}>
                <StatusBar style="dark" />
                <ActivityIndicator size="large" color="#0F172A" />
                <Text style={styles.loadingText}>Loading nearby cafes...</Text>
            </View>
        );
    }

    return (
        <View style={styles.screen}>
            <StatusBar style="dark" />
            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
                <ResponsiveContainer maxWidth={1180}>
                    <View style={styles.page}>
                        <View style={styles.header}>
                            <View style={styles.headerCopy}>
                                <Text style={styles.badge}>DISCOVERY</Text>
                                <Text style={styles.title}>Find cafes that match how you want to dine today</Text>
                                <Text style={styles.subtitle}>
                                    Search by area, scan categories quickly, and jump into dine-in, takeaway, or pre-order from a cleaner web experience.
                                </Text>
                            </View>

                            <View style={[styles.headerActions, isWide && styles.headerActionsWide]}>
                                <TouchableOpacity style={styles.iconButton} onPress={() => navigation.navigate('CustomerProfile')}>
                                    <User color="#0F172A" size={18} />
                                    <Text style={styles.iconButtonText}>Profile</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.iconButton} onPress={() => navigation.navigate('Landing')}>
                                    <Home color="#0F172A" size={18} />
                                    <Text style={styles.iconButtonText}>Home</Text>
                                </TouchableOpacity>
                            </View>
                        </View>

                        <View style={styles.filterPanel}>
                            <Text style={styles.panelLabel}>SEARCH AND FILTER</Text>
                            <View style={styles.searchShell}>
                                <Search color="#64748B" size={18} />
                                <TextInput
                                    style={styles.searchInput}
                                    placeholder="Search by cafe name or area"
                                    placeholderTextColor="#94A3B8"
                                    value={searchText}
                                    onChangeText={setSearchText}
                                />
                            </View>

                            <View style={styles.categoryWrap}>
                                {categories.map((category) => (
                                    <TouchableOpacity
                                        key={category}
                                        style={[styles.categoryChip, selectedCategory === category && styles.categoryChipActive]}
                                        onPress={() => setSelectedCategory(category)}
                                    >
                                        <Text style={[styles.categoryChipText, selectedCategory === category && styles.categoryChipTextActive]}>{category}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>

                        {filteredCafes.length === 0 ? (
                            <View style={styles.emptyState}>
                                <Text style={styles.emptyTitle}>{searchText ? 'No cafes matched your search' : 'No cafes available right now'}</Text>
                                <Text style={styles.emptyText}>
                                    {searchText
                                        ? `Try a different search term or clear the category filter to see more results.`
                                        : 'Check back again soon as more cafes are added to discovery.'}
                                </Text>
                                <TouchableOpacity
                                    style={styles.primaryButton}
                                    onPress={() => {
                                        setSearchText('');
                                        setSelectedCategory('All');
                                        fetchCafes();
                                    }}
                                >
                                    <Text style={styles.primaryButtonText}>Clear filters</Text>
                                </TouchableOpacity>
                            </View>
                        ) : (
                            <View style={[styles.grid, isWide && styles.gridWide]}>
                                {filteredCafes.map((cafe) => (
                                    <View key={cafe.id} style={[styles.cafeCard, isWide && styles.cafeCardWide]}>
                                        <Image
                                            source={{ uri: cafe.featuredImage || 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?q=80&w=1000' }}
                                            style={styles.cafeImage}
                                            resizeMode="cover"
                                        />

                                        <View style={styles.cafeBody}>
                                            <View style={styles.cardTop}>
                                                <View style={styles.cardTopCopy}>
                                                    <Text style={styles.cafeName}>{cafe.name}</Text>
                                                    <Text style={styles.priceLevel}>{cafe.priceLevel}</Text>
                                                </View>
                                                <View style={[styles.availabilityTag, { borderColor: cafe.hasAvailableTables ? '#BBF7D0' : '#FECACA', backgroundColor: cafe.hasAvailableTables ? '#F0FDF4' : '#FEF2F2' }]}>
                                                    <Text style={[styles.availabilityText, { color: cafe.hasAvailableTables ? '#15803D' : '#B91C1C' }]}>
                                                        {cafe.hasAvailableTables ? 'Tables available' : 'Currently full'}
                                                    </Text>
                                                </View>
                                            </View>

                                            <View style={styles.metaRow}>
                                                <MapPin color="#64748B" size={14} />
                                                <Text style={styles.metaText} numberOfLines={1}>{cafe.address || 'Local area'}</Text>
                                            </View>

                                            <View style={styles.infoStrip}>
                                                <Text style={styles.infoText}>{cafe.availableTables} of {cafe.totalTables} tables available</Text>
                                                <Text style={styles.infoText}>Platform fee: {cafe.settings.currencySymbol}{cafe.settings.platformFeeAmount}</Text>
                                            </View>

                                            <View style={styles.tagWrap}>
                                                {cafe.categories?.slice(0, 3).map((tag: string, index: number) => (
                                                    <View key={`${tag}-${index}`} style={styles.tag}>
                                                        <Text style={styles.tagText}>{tag}</Text>
                                                    </View>
                                                ))}
                                                {cafe.settings.avgPrepTimeMinutes && (
                                                    <View style={styles.tag}>
                                                        <Clock color="#0F172A" size={12} style={{ marginRight: 4 }} />
                                                        <Text style={styles.tagText}>{cafe.settings.avgPrepTimeMinutes} min</Text>
                                                    </View>
                                                )}
                                            </View>

                                            <View style={styles.actionStack}>
                                                {cafe.hasAvailableTables && (
                                                    <TouchableOpacity style={styles.primaryButton} onPress={() => handleCafeSelect(cafe.id)}>
                                                        <Text style={styles.primaryButtonText}>Reserve dine-in</Text>
                                                    </TouchableOpacity>
                                                )}
                                                {cafe.supportsTakeaway && (
                                                    <TouchableOpacity style={styles.secondaryButton} onPress={() => handleTakeawayOrder(cafe.id)}>
                                                        <Text style={styles.secondaryButtonText}>Start takeaway</Text>
                                                    </TouchableOpacity>
                                                )}
                                                {cafe.supportsPreOrder && (
                                                    <TouchableOpacity style={styles.secondaryButton} onPress={() => handlePreOrder(cafe.id)}>
                                                        <Text style={styles.secondaryButtonText}>Pre-order</Text>
                                                    </TouchableOpacity>
                                                )}
                                            </View>
                                        </View>
                                    </View>
                                ))}
                            </View>
                        )}
                    </View>
                </ResponsiveContainer>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: '#FFFFFF' },
    loadingScreen: { flex: 1, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center' },
    loadingText: { marginTop: 14, color: '#64748B', fontSize: 15, fontWeight: '600' },
    scroll: { paddingVertical: 28, backgroundColor: '#FFFFFF' },
    page: { paddingHorizontal: 20 },
    header: { paddingTop: 12, paddingBottom: 28, borderBottomWidth: 1, borderBottomColor: '#E5E7EB', marginBottom: 24 },
    headerCopy: { marginBottom: 18 },
    badge: { alignSelf: 'flex-start', backgroundColor: '#FFF1EB', borderWidth: 1, borderColor: '#FFD7C8', color: '#C2410C', fontSize: 12, fontWeight: '800', letterSpacing: 1, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 16 },
    title: { color: '#0F172A', fontSize: 40, fontWeight: '900', lineHeight: 46, marginBottom: 10, maxWidth: 840 },
    subtitle: { color: '#475569', fontSize: 16, lineHeight: 26, maxWidth: 860, fontWeight: '500' },
    headerActions: { flexDirection: 'column' },
    headerActionsWide: { flexDirection: 'row' },
    iconButton: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#CBD5E1', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#FFFFFF', marginBottom: 12, marginRight: 12 },
    iconButtonText: { color: '#0F172A', fontSize: 14, fontWeight: '700', marginLeft: 8 },
    filterPanel: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D7DEE7', borderTopWidth: 4, borderTopColor: '#0F172A', padding: 24, marginBottom: 28 },
    panelLabel: { color: '#94A3B8', fontSize: 12, fontWeight: '800', letterSpacing: 1.1, marginBottom: 12 },
    searchShell: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF', paddingHorizontal: 16, paddingVertical: 14, marginBottom: 16 },
    searchInput: { flex: 1, color: '#0F172A', fontSize: 15, fontWeight: '500', marginLeft: 10, padding: 0 },
    categoryWrap: { flexDirection: 'row', flexWrap: 'wrap' },
    categoryChip: { borderWidth: 1, borderColor: '#CBD5E1', paddingHorizontal: 14, paddingVertical: 10, marginRight: 10, marginBottom: 10, backgroundColor: '#FFFFFF' },
    categoryChipActive: { borderColor: '#0F172A', backgroundColor: '#FFF7F3' },
    categoryChipText: { color: '#475569', fontSize: 13, fontWeight: '700' },
    categoryChipTextActive: { color: '#0F172A' },
    grid: { flexDirection: 'column' },
    gridWide: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
    cafeCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D7DEE7', marginBottom: 20 },
    cafeCardWide: { width: '48.5%' },
    cafeImage: { width: '100%', height: 220, backgroundColor: '#E5E7EB' },
    cafeBody: { padding: 20 },
    cardTop: { marginBottom: 14 },
    cardTopCopy: { marginBottom: 10 },
    cafeName: { color: '#0F172A', fontSize: 24, fontWeight: '800', marginBottom: 4 },
    priceLevel: { color: '#15803D', fontSize: 14, fontWeight: '700' },
    availabilityTag: { alignSelf: 'flex-start', borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6 },
    availabilityText: { fontSize: 12, fontWeight: '800' },
    metaRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
    metaText: { color: '#64748B', fontSize: 14, marginLeft: 6, fontWeight: '500', flex: 1 },
    infoStrip: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', padding: 14, marginBottom: 14 },
    infoText: { color: '#475569', fontSize: 13, lineHeight: 20, fontWeight: '500', marginBottom: 4 },
    tagWrap: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 16 },
    tag: { borderWidth: 1, borderColor: '#CBD5E1', paddingHorizontal: 10, paddingVertical: 8, marginRight: 8, marginBottom: 8, flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF' },
    tagText: { color: '#0F172A', fontSize: 12, fontWeight: '700' },
    actionStack: {},
    primaryButton: { borderWidth: 1, borderColor: '#0F172A', backgroundColor: '#0F172A', paddingVertical: 16, alignItems: 'center', marginBottom: 10 },
    primaryButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
    secondaryButton: { borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF', paddingVertical: 16, alignItems: 'center', marginBottom: 10 },
    secondaryButtonText: { color: '#0F172A', fontSize: 14, fontWeight: '700' },
    emptyState: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D7DEE7', padding: 28, alignItems: 'center' },
    emptyTitle: { color: '#0F172A', fontSize: 22, fontWeight: '800', marginBottom: 10, textAlign: 'center' },
    emptyText: { color: '#64748B', fontSize: 14, lineHeight: 22, textAlign: 'center', marginBottom: 22, maxWidth: 480 },
});
