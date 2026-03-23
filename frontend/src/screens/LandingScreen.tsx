import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Dimensions, useWindowDimensions } from 'react-native';
import ResponsiveContainer from '../components/ResponsiveContainer';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';

const { width } = Dimensions.get('window');

export default function LandingScreen({ navigation }: any) {
    const { width: windowWidth } = useWindowDimensions();
    const isWide = windowWidth > 768;
    return (
        <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
            <StatusBar style="light" />

            {/* Hero Section */}
            <LinearGradient
                colors={['#1E293B', '#0F172A']}
                style={[styles.hero, isWide && { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }]}
            >
                <ResponsiveContainer maxWidth={1100}>
                    <View style={styles.nav}>
                        <Text style={styles.logo}>CafeQR <Text style={styles.logoHighlight}>Pro</Text></Text>
                        <TouchableOpacity onPress={() => navigation.navigate('Login')}>
                            <Text style={styles.navLink}>Staff Login</Text>
                        </TouchableOpacity>
                    </View>

                    <View style={[styles.heroContent, isWide && { marginTop: 120, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
                        <View style={[isWide && { flex: 1, paddingRight: 40 }]}>
                            <Text style={[styles.heroTitle, isWide && { fontSize: 60, lineHeight: 70, textAlign: 'left' }]}>Transform Your Cafe Experience</Text>
                            <Text style={[styles.heroSubtitle, isWide && { textAlign: 'left', paddingHorizontal: 0, marginTop: 30 }]}>
                                The ultimate QR-based ordering & POS solution for modern cafes.
                                Boost efficiency by 40% and delight your customers.
                            </Text>

                            <TouchableOpacity
                                style={[styles.ctaButton, isWide && { alignSelf: 'flex-start' }]}
                                onPress={() => navigation.navigate('CafeRegistration')}
                                accessibilityRole="button"
                                accessibilityLabel="Get Started for Free"
                            >
                                <Text style={styles.ctaText}>Get Started for Free</Text>
                            </TouchableOpacity>
                        </View>
                        
                        {isWide && (
                            <View style={{ flex: 1, alignItems: 'center' }}>
                                <Image 
                                    source={{ uri: 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&q=80&w=1000' }} 
                                    style={{ width: '100%', height: 400, borderRadius: 24 }}
                                    resizeMode="cover"
                                    accessible={true}
                                    accessibilityLabel="A bustling modern cafe environment"
                                />
                            </View>
                        )}
                    </View>
                </ResponsiveContainer>
            </LinearGradient>

            {/* Mobile Hero Image (shows only on small screens below the text) */}
            {!isWide && (
                <Image 
                    source={{ uri: 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&q=80&w=800' }} 
                    style={{ width: '100%', height: 250, borderBottomLeftRadius: 40, borderBottomRightRadius: 40, marginTop: -40 }}
                    resizeMode="cover"
                    accessible={true}
                    accessibilityLabel="A bustling modern cafe environment"
                />
            )}

            <ResponsiveContainer maxWidth={1100}>
                {/* Features Section */}
                <View style={styles.section}>
                    <Text style={styles.sectionHeader}>Why Choose CafeQR?</Text>

                    <View style={styles.featureGrid}>
                        <FeatureCard
                            title="Contactless Ordering"
                            desc="Customers scan, order, and pay from their table. No apps required."
                            icon="📱"
                            isWide={isWide}
                        />
                        <FeatureCard
                            title="Live POS Dashboard"
                            desc="Real-time sales tracking, table status, and inventory management."
                            icon="📊"
                            isWide={isWide}
                        />
                        <FeatureCard
                            title="Staff Coordination"
                            desc="Direct kitchen display (KDS) and waiter notification system."
                            icon="🧑‍🍳"
                            isWide={isWide}
                        />
                        <FeatureCard
                            title="Automated Setup"
                            desc="Generate unique QR codes for every table in seconds."
                            icon="⚡"
                            isWide={isWide}
                        />
                    </View>
                </View>

                {/* Trust Section */}
                <View style={[styles.trustSection, isWide && { borderRadius: 30, marginHorizontal: 20 }]}>
                    <Text style={styles.trustText}>Trusted by 500+ premium cafes across the globe.</Text>
                </View>

                {/* Pricing Preview */}
                <View style={styles.section}>
                    <Text style={styles.sectionHeader}>Simple, Transparent Pricing</Text>
                    <View style={[styles.pricingCard, isWide && { maxWidth: 600, alignSelf: 'center' }]}>
                        <Text style={styles.pricingTitle}>Restaurant Pro</Text>
                        <Text style={styles.price}>$29<Text style={styles.pricePeriod}>/month</Text></Text>
                        <View style={styles.checkList}>
                            <Text style={styles.checkItem}>✓ Unlimited Tables</Text>
                            <Text style={styles.checkItem}>✓ Real-time Analytics</Text>
                            <Text style={styles.checkItem}>✓ Kitchen Display System</Text>
                            <Text style={styles.checkItem}>✓ 24/7 Priority Support</Text>
                        </View>
                        <TouchableOpacity
                            style={styles.pricingBtn}
                            onPress={() => navigation.navigate('CafeRegistration')}
                        >
                            <Text style={styles.pricingBtnText}>Start 14-Day Trial</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Footer */}
                <View style={styles.footer}>
                    <Text style={styles.footerText}>© 2026 CafeQR Solutions. All rights reserved.</Text>
                </View>
            </ResponsiveContainer>
        </ScrollView>
    );
}

function FeatureCard({ title, desc, icon, isWide }: any) {
    return (
        <View style={[styles.card, isWide && { width: '23%' }]}>
            <Text style={styles.cardIcon}>{icon}</Text>
            <Text style={styles.cardTitle}>{title}</Text>
            <Text style={styles.cardDesc}>{desc}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8FAFC' },
    hero: { padding: 20, paddingTop: 60, paddingBottom: 100, borderBottomLeftRadius: 40, borderBottomRightRadius: 40 },
    nav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    logo: { color: 'white', fontSize: 24, fontWeight: '800' },
    logoHighlight: { color: '#38BDF8' },
    navLink: { color: '#94A3B8', fontWeight: '600' },
    heroContent: { marginTop: 80, alignItems: 'center' },
    heroTitle: { color: 'white', fontSize: 42, fontWeight: '800', textAlign: 'center', lineHeight: 50 },
    heroSubtitle: { color: '#94A3B8', fontSize: 18, textAlign: 'center', marginTop: 20, lineHeight: 28, paddingHorizontal: 20 },
    ctaButton: { backgroundColor: '#38BDF8', paddingHorizontal: 40, paddingVertical: 18, borderRadius: 30, marginTop: 40, elevation: 10 },
    ctaText: { color: 'white', fontSize: 18, fontWeight: '700' },
    section: { padding: 30, marginTop: 40 },
    sectionHeader: { fontSize: 28, fontWeight: '800', color: '#1E293B', textAlign: 'center', marginBottom: 40 },
    featureGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
    card: { backgroundColor: 'white', width: '48%', padding: 20, borderRadius: 24, marginBottom: 20, elevation: 3 },
    cardIcon: { fontSize: 32, marginBottom: 15 },
    cardTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A', marginBottom: 10 },
    cardDesc: { fontSize: 12, color: '#64748B', lineHeight: 18 },
    trustSection: { backgroundColor: '#F1F5F9', padding: 40, alignItems: 'center' },
    trustText: { color: '#64748B', fontWeight: '600' },
    pricingCard: { backgroundColor: '#1E293B', padding: 40, borderRadius: 32, alignItems: 'center' },
    pricingTitle: { color: '#38BDF8', fontWeight: '700', fontSize: 16, textTransform: 'uppercase' },
    price: { color: 'white', fontSize: 50, fontWeight: '800', marginVertical: 20 },
    pricePeriod: { fontSize: 18, color: '#64748B' },
    checkList: { width: '100%', marginBottom: 30 },
    checkItem: { color: '#CBD5E1', marginBottom: 12, fontSize: 15 },
    pricingBtn: { backgroundColor: 'white', width: '100%', padding: 18, borderRadius: 15, alignItems: 'center' },
    pricingBtnText: { color: '#0F172A', fontWeight: '700', fontSize: 16 },
    footer: { padding: 40, alignItems: 'center', borderTopWidth: 1, borderTopColor: '#E2E8F0' },
    footerText: { color: '#94A3B8', fontSize: 12 }
});
