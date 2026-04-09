import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, useWindowDimensions, Dimensions, Animated, Linking, Platform } from 'react-native';
import ResponsiveContainer from '../components/ResponsiveContainer';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const productBenefitsData = [
    {
        icon: 'qrcode-scan',
        title: 'QR Code Ordering',
        desc: 'Customers scan a table QR code and browse your digital menu instantly — no app download needed.',
        color: '#FF6B35',
        gradient: ['#FF6B35', '#FF8F5E'] as const,
    },
    {
        icon: 'clipboard-text-outline',
        title: 'Easy Menu Management',
        desc: 'Add, edit, or remove menu items in seconds. Update prices, descriptions, and photos on the fly.',
        color: '#8B5CF6',
        gradient: ['#8B5CF6', '#A78BFA'] as const,
    },
    {
        icon: 'package-variant-closed',
        title: 'Out of Stock Alerts',
        desc: 'Mark items as out of stock instantly. Customers never order something unavailable.',
        color: '#06B6D4',
        gradient: ['#06B6D4', '#22D3EE'] as const,
    },
    {
        icon: 'bell-outline',
        title: 'Waiter Call System',
        desc: 'Customers can call a waiter from their phone with one tap — perfect during rush hours.',
        color: '#EC4899',
        gradient: ['#EC4899', '#F472B6'] as const,
    },
    {
        icon: 'chart-line',
        title: 'Real-Time Analytics',
        desc: 'Track orders, revenue, popular items, peak hours, and customer trends in a live dashboard.',
        color: '#10B981',
        gradient: ['#10B981', '#34D399'] as const,
    },
    {
        icon: 'timer-sand',
        title: 'Faster Table Turnover',
        desc: 'Reduce wait times by 60%. Orders go directly to the kitchen — no middleman delays.',
        color: '#F59E0B',
        gradient: ['#F59E0B', '#FBBF24'] as const,
    },
];

const featureData = [
    {
        title: 'Scan & Order Instantly',
        desc: 'No waiting for menus or servers. Your customers scan, choose, and pay right from their table.',
        icon: 'qrcode-scan',
        color: '#FF6B35',
    },
    {
        title: 'Pre-Order Magic',
        desc: 'Let customers reserve their favorite dishes ahead. Perfect for busy lunch rushes. — Coming soon',
        icon: 'calendar-star',
        color: '#8B5CF6',
    },
    {
        title: 'Takeaway Made Easy',
        desc: 'Pickup orders with smart notifications. No more forgotten orders or long waits. — Coming soon',
        icon: 'shopping-outline',
        color: '#06B6D4',
    },
    {
        title: 'Kitchen Command Center',
        desc: 'Real-time order tracking, priority alerts, and seamless coordination.',
        icon: 'chef-hat',
        color: '#EC4899',
    },
];

const howItWorksData = [
    {
        number: '1',
        icon: 'qrcode-scan',
        title: 'Scan QR Code',
        desc: 'Customer scans the QR code placed on their table using any smartphone camera.',
    },
    {
        number: '2',
        icon: 'cart-outline',
        title: 'Browse & Order',
        desc: 'They explore your beautiful digital menu, customize items, and place their order.',
    },
    {
        number: '3',
        icon: 'chef-hat',
        title: 'Kitchen Receives Order',
        desc: 'The chef dashboard instantly displays the new order with all details and special requests.',
    },
    {
        number: '4',
        icon: 'check-circle-outline',
        title: 'Serve & Enjoy',
        desc: 'Waiter gets notified when food is ready. Customer enjoys — no waiting, no confusion.',
    },
];

const testimonialData = [
    {
        quote: "Our table turns increased by 35% in the first month. Customers love the speed!",
        author: "Maria Rodriguez",
        role: "Owner, Bella Vista Cafe",
        avatar: "https://images.unsplash.com/photo-1494790108755-2616b612b786?auto=format&fit=crop&w=100&q=80",
    },
    {
        quote: "Finally, a system that understands how cafes actually work. Game changer!",
        author: "James Chen",
        role: "Manager, Urban Grind",
        avatar: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=100&q=80",
    },
];

const pricingHighlights = [
    {
        icon: 'calendar-check-outline',
        title: '1-month free trial',
        desc: 'Every new cafe gets full access free for the first month.',
    },
    {
        icon: 'email-fast-outline',
        title: 'Reminder before your trial ends',
        desc: 'We email or call you 5 days before the free month ends to ask if you want to continue.',
    },
    {
        icon: 'ticket-confirmation-outline',
        title: 'Simple base pricing',
        desc: 'After the trial, the plan is Rs. 159 per month and includes 100 order sessions.',
    },
    {
        icon: 'cash-plus',
        title: 'Transparent extra usage',
        desc: 'Above 100 order sessions, each extra order session is charged at Rs. 1.',
    },
    {
        icon: 'headset',
        title: 'Daytime support included',
        desc: 'You get working-hours support for day-to-day operational help.',
    },
];

const fiestoAndroidApps = [
    {
        icon: 'chef-hat',
        name: 'Fiesto Chef',
        badge: 'Android kitchen app',
        summary: 'Built for chefs to receive incoming orders, update prep status, and call the floor team the moment dishes are ready.',
        gradient: ['#FF6B35', '#FF8F5E'] as const,
        featureList: [
            'Live kitchen order queue',
            'Ready-for-pickup updates',
            'Priority-based prep flow',
        ],
        highlight: 'Recommended APK',
        detail: 'Smaller ARM64 build for most modern Android phones.',
        primaryLabel: 'Download ARM64 APK',
        primaryPath: '/downloads/fiesto-chef-android.apk',
        secondaryLabel: 'Download universal APK',
        secondaryPath: '/downloads/fiesto-chef-universal.apk',
    },
    {
        icon: 'silverware-fork-knife',
        name: 'Fiesto Waiter',
        badge: 'Android floor app',
        summary: 'Made for your service team to catch customer calls, track delivery updates, and manage table-side service in real time.',
        gradient: ['#06B6D4', '#22D3EE'] as const,
        featureList: [
            'Instant customer call alerts',
            'Order-ready notifications',
            'Fast table delivery workflow',
        ],
        highlight: 'Recommended APK',
        detail: 'Smaller ARM64 build for most modern Android phones.',
        primaryLabel: 'Download ARM64 APK',
        primaryPath: '/downloads/fiesto-waiter-android.apk',
        secondaryLabel: 'Download universal APK',
        secondaryPath: '/downloads/fiesto-waiter-universal.apk',
    },
];

const buildPublicUrl = (path: string) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
        return new URL(path, window.location.origin).toString();
    }

    return `https://www.vantacult.com${path}`;
};

const openPublicUrl = async (path: string) => {
    const targetUrl = buildPublicUrl(path);

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.location.href = targetUrl;
        return;
    }

    await Linking.openURL(targetUrl);
};

export default function LandingScreen({ navigation }: any) {
    const { width: windowWidth } = useWindowDimensions();
    const isWide = windowWidth > 900;
    const [menuOpen, setMenuOpen] = useState(false);

    // Animation values for floating shapes
    const float1 = useRef(new Animated.Value(0)).current;
    const float2 = useRef(new Animated.Value(0)).current;
    const float3 = useRef(new Animated.Value(0)).current;
    const pulse1 = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(float1, { toValue: 20, duration: 3000, useNativeDriver: true }),
                Animated.timing(float1, { toValue: 0, duration: 3000, useNativeDriver: true }),
            ])
        ).start();

        Animated.loop(
            Animated.sequence([
                Animated.timing(float2, { toValue: -25, duration: 4000, useNativeDriver: true }),
                Animated.timing(float2, { toValue: 0, duration: 4000, useNativeDriver: true }),
            ])
        ).start();

        Animated.loop(
            Animated.sequence([
                Animated.timing(float3, { toValue: 15, duration: 3500, useNativeDriver: true }),
                Animated.timing(float3, { toValue: 0, duration: 3500, useNativeDriver: true }),
            ])
        ).start();

        Animated.loop(
            Animated.sequence([
                Animated.timing(pulse1, { toValue: 1.05, duration: 2000, useNativeDriver: true }),
                Animated.timing(pulse1, { toValue: 1, duration: 2000, useNativeDriver: true }),
            ])
        ).start();
    }, []);

    const navigateToCafeRegistration = () => {
        setMenuOpen(false);
        navigation.navigate('CafeRegistration');
    };

    const navigateToClientLogin = () => {
        setMenuOpen(false);
        navigation.navigate('Login', { loginMode: 'customer' });
    };

    return (
        <ScrollView style={styles.container} showsVerticalScrollIndicator={false} scrollEventThrottle={16}>
            <StatusBar style="dark" />

            {/* ===================== NAVBAR ===================== */}
            <View style={[styles.navbarOuter, !isWide && styles.navbarOuterMobile]}>
                <ResponsiveContainer maxWidth={1400} style={styles.navbarContainer}>
                    <View style={[styles.navbarInner, isWide ? styles.navbarInnerWide : styles.navbarInnerMobile]}>
                        <View style={[styles.navBrand, !isWide && styles.navBrandMobile]}>
                            <View style={styles.navLogoContainer}>
                                <LinearGradient
                                    colors={['#FF6B35', '#FF8F5E']}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 1 }}
                                    style={styles.navLogoBadge}
                                >
                                    <Text style={styles.navLogoBadgeText}>F</Text>
                                </LinearGradient>
                                <View>
                                    <Text style={styles.navLogo}>Fiesto</Text>
                                    <Text style={styles.navLogoCaption}>Cafe ordering suite</Text>
                                </View>
                            </View>
                        </View>

                        {isWide ? (
                            <View style={styles.navLinks}>
                                <TouchableOpacity style={styles.navLink}>
                                    <Text style={styles.navLinkText}>About</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.navLink}>
                                    <Text style={styles.navLinkText}>Products</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.navLink}>
                                    <Text style={styles.navLinkText}>Blog</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.navLink}>
                                    <Text style={styles.navLinkText}>Contact</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.navLoginBtn} onPress={navigateToClientLogin}>
                                    <Text style={styles.navLoginBtnText}>Client Login</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.navCtaBtn} onPress={navigateToCafeRegistration}>
                                    <Text style={styles.navCtaBtnText}>Start Free Trial</Text>
                                </TouchableOpacity>
                            </View>
                        ) : (
                            <View style={styles.navMobileButtonWrapper}>
                                <TouchableOpacity style={styles.navMenuButton} onPress={() => setMenuOpen(prev => !prev)}>
                                    <MaterialCommunityIcons name={menuOpen ? 'close' : 'menu'} size={26} color="#0F172A" />
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>
                </ResponsiveContainer>
            </View>

            {!isWide && menuOpen && (
                <View style={styles.mobileMenuOverlay}>
                    <TouchableOpacity style={styles.mobileNavItem}>
                        <Text style={styles.mobileNavText}>About</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.mobileNavItem}>
                        <Text style={styles.mobileNavText}>Products</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.mobileNavItem}>
                        <Text style={styles.mobileNavText}>Blog</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.mobileNavItem}>
                        <Text style={styles.mobileNavText}>Contact</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.mobileNavSecondary} onPress={navigateToClientLogin}>
                        <Text style={styles.mobileNavSecondaryText}>Client Login</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.mobileNavCta} onPress={navigateToCafeRegistration}>
                        <Text style={styles.mobileNavCtaText}>Start Free Trial</Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* ===================== HERO SECTION ===================== */}
            <View style={[styles.heroSection, isWide && styles.heroSectionWide]}>
                <LinearGradient
                    colors={['#F8FAFC', '#F8FAFC']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.heroGradient}
                />


                {/* Glowing orbs background */}
                <Animated.View
                    style={[
                        styles.glowOrb,
                        styles.glowOrb1,
                        { transform: [{ translateY: float1 }] }
                    ]}
                />
                <Animated.View
                    style={[
                        styles.glowOrb,
                        styles.glowOrb2,
                        { transform: [{ translateY: float2 }] }
                    ]}
                />
                <Animated.View
                    style={[
                        styles.glowOrb,
                        styles.glowOrb3,
                        { transform: [{ translateY: float3 }] }
                    ]}
                />

                {/* Hero Content */}
                <ResponsiveContainer maxWidth={1400}>
                    <View style={[styles.heroContent, isWide ? styles.heroContentWide : styles.heroContentMobile]}>
                        {/* Left Content */}
                        <View style={[styles.heroTextSection, isWide && styles.heroTextSectionWide]}>
                            <View style={styles.taglineBox}>
                                <View style={styles.taglinePill}>
                                    <Text style={styles.tagline}>✨ Smart QR Ordering for Modern Cafes</Text>
                                </View>
                            </View>

                            <View style={styles.heroBadgeRow}>
                                <View style={styles.heroBadge}>
                                    <Text style={styles.heroBadgeText}>Contactless QR ordering</Text>
                                </View>
                                <View style={styles.heroBadge}>
                                    <Text style={styles.heroBadgeText}>Scan, order, pay</Text>
                                </View>
                                <View style={styles.heroBadge}>
                                    <Text style={styles.heroBadgeText}>No app downloads</Text>
                                </View>
                            </View>

                            <Text style={[styles.mainHeading, !isWide && styles.mainHeadingMobile]}>
                                Contactless{'\n'}
                                <Text style={styles.headingHighlight}>QR Code Ordering</Text>
                            </Text>

                            <Text style={styles.subheading}>
                                Launch QR ordering, kitchen flow, and live cafe operations with a 1-month free trial built for growing cafes.
                            </Text>

                            <View style={styles.ctaRow}>
                                <TouchableOpacity
                                    style={styles.ctaButtonPrimary}
                                    onPress={navigateToCafeRegistration}
                                >
                                    <LinearGradient
                                        colors={['#FF6B35', '#FF8F5E']}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 1, y: 0 }}
                                        style={styles.ctaGradient}
                                    >
                                        <Text style={styles.ctaButtonText}>Start 1-Month Free Trial →</Text>
                                    </LinearGradient>
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* Right Visual - Phone Mockup */}
                        {isWide && (
                            <View style={styles.heroVisualSection}>
                                <Animated.View style={[styles.phoneWrapper, { transform: [{ scale: pulse1 }] }]}>
                                    <View style={styles.phoneFrame}>
                                        <View style={styles.phoneNotch} />
                                        <View style={styles.phoneScreen}>
                                            <View style={styles.phoneStatusBar}>
                                                <Text style={styles.phoneStatusTime}>9:41</Text>
                                            </View>
                                            <View style={styles.phoneAppHeader}>
                                                <View style={styles.phoneAppHeaderInner}>
                                                    <MaterialCommunityIcons name="food" size={14} color="#0F172A" style={styles.phoneHeaderIcon} />
                                                    <Text style={styles.phoneAppName}>Fiesto</Text>
                                                </View>
                                            </View>
                                            <Text style={styles.qrTitle}>SCAN TO ORDER</Text>
                                            <View style={styles.qrCodeBox}>
                                                <View style={styles.qrGrid}>
                                                    {[...Array(7)].map((_, row) => (
                                                        <View key={row} style={styles.qrRow}>
                                                            {[...Array(7)].map((_, col) => (
                                                                <View
                                                                    key={`${row}-${col}`}
                                                                    style={[
                                                                        styles.qrDot,
                                                                        (row + col) % 2 === 0 && styles.qrDotFilled,
                                                                        (row < 2 && col < 2) && styles.qrDotCorner,
                                                                        (row < 2 && col > 4) && styles.qrDotCorner,
                                                                        (row > 4 && col < 2) && styles.qrDotCorner,
                                                                    ]}
                                                                />
                                                            ))}
                                                        </View>
                                                    ))}
                                                </View>
                                            </View>
                                            <TouchableOpacity style={styles.phoneOrderBtn}>
                                                <Text style={styles.phoneOrderBtnText}>Order Now</Text>
                                            </TouchableOpacity>
                                            <View style={styles.phoneBottomBar}>
                                                <MaterialCommunityIcons name="home-outline" size={18} color="#64748B" style={styles.phoneBottomIcon} />
                                                <MaterialCommunityIcons name="clipboard-text-outline" size={18} color="#64748B" style={styles.phoneBottomIcon} />
                                                <MaterialCommunityIcons name="bell-outline" size={18} color="#64748B" style={styles.phoneBottomIcon} />
                                                <MaterialCommunityIcons name="account-outline" size={18} color="#64748B" style={styles.phoneBottomIcon} />
                                            </View>
                                        </View>
                                    </View>
                                </Animated.View>

                                {/* Decorative floating cards */}
                                <Animated.View style={[styles.floatingCard, styles.floatingCard1, { transform: [{ translateY: float2 }] }]}>
                                    <MaterialCommunityIcons name="food-variant" size={20} color="#FF6B35" style={styles.floatingCardIcon} />
                                    <Text style={styles.floatingCardText}>Order #42</Text>
                                    <Text style={styles.floatingCardStatus}>Ready!</Text>
                                </Animated.View>
                                <Animated.View style={[styles.floatingCard, styles.floatingCard2, { transform: [{ translateY: float3 }] }]}>
                                    <MaterialCommunityIcons name="chart-line" size={20} color="#0F172A" style={styles.floatingCardIcon} />
                                    <Text style={styles.floatingCardText}>+35%</Text>
                                    <Text style={styles.floatingCardStatus}>Revenue</Text>
                                </Animated.View>
                            </View>
                        )}
                    </View>
                </ResponsiveContainer>
            </View>

            {/* ===================== HOW IT WORKS ===================== */}
            <View style={styles.howItWorksSection}>
                <ResponsiveContainer maxWidth={1200}>
                    <View style={styles.howItWorksHeader}>
                        <View style={styles.sectionLabelPill}>
                            <Text style={styles.howItWorksLabel}>HOW IT WORKS</Text>
                        </View>
                        <Text style={styles.howItWorksTitle}>Simple as 1-2-3-4</Text>
                        <Text style={styles.howItWorksSubtitle}>
                            Get your café running on Fiesto in minutes. Here's the customer journey.
                        </Text>
                    </View>

                    <View style={[styles.howItWorksGrid, isWide && styles.howItWorksGridWide]}>
                        {howItWorksData.map((step, index) => (
                            <View key={step.number} style={styles.howItWorksCard}>
                                <LinearGradient
                                    colors={['#FF6B35', '#FF8F5E']}
                                    style={styles.stepNumberCircle}
                                >
                                    <Text style={styles.stepNumber}>{step.number}</Text>
                                </LinearGradient>
                                <MaterialCommunityIcons name={step.icon} size={34} color="#0F172A" style={styles.stepIcon} />
                                <Text style={styles.stepTitle}>{step.title}</Text>
                                <Text style={styles.stepDesc}>{step.desc}</Text>

                                {/* Connector arrow for desktop */}
                                {isWide && index < 3 && (
                                    <View style={styles.connectorArrow}>
                                        <Text style={styles.connectorArrowText}>→</Text>
                                    </View>
                                )}
                            </View>
                        ))}
                    </View>
                </ResponsiveContainer>
            </View>

            {/* ===================== BENEFITS SECTION ===================== */}
            <View style={styles.benefitsSection}>
                <ResponsiveContainer maxWidth={1200}>
                    <View style={styles.benefitsHeader}>
                        <View style={styles.sectionLabelPill}>
                            <Text style={styles.sectionLabelText}>FEATURES</Text>
                        </View>
                        <Text style={styles.benefitsTitle}>Complete Cafe Management System</Text>
                        <Text style={styles.benefitsSubtitle}>
                            Everything your cafe needs to operate smoothly, serve faster, and earn more. From QR ordering to real-time analytics.
                        </Text>
                    </View>

                    <View style={[styles.benefitsGrid, isWide && styles.benefitsGridWide]}>
                        {productBenefitsData.map((benefit) => (
                            <View key={benefit.title} style={styles.benefitCard}>
                                <LinearGradient
                                    colors={benefit.gradient}
                                    style={styles.benefitIconBox}
                                >
                                    <MaterialCommunityIcons name={benefit.icon} size={24} color="#FFFFFF" />
                                </LinearGradient>
                                <Text style={styles.benefitTitle}>{benefit.title}</Text>
                                <Text style={styles.benefitDesc}>{benefit.desc}</Text>
                                {/* Decorative corner */}
                                <View style={[styles.benefitCorner, { backgroundColor: benefit.color + '08' }]} />
                            </View>
                        ))}
                    </View>
                </ResponsiveContainer>
            </View>

            {/* ===================== APPLICATIONS SECTION ===================== */}
            <View style={styles.applicationsSection}>
                <ResponsiveContainer maxWidth={1200}>
                    <View style={styles.appsHeader}>
                        <View style={styles.sectionLabelPill}>
                            <Text style={styles.sectionLabelText}>ANDROID DOWNLOADS</Text>
                        </View>
                        <Text style={styles.appsTitle}>Install the Fiesto team apps</Text>
                        <Text style={styles.appsSubtitle}>
                            The owner dashboard stays on the web. Your chef and waiter teams can download dedicated Android APKs directly from this landing page.
                        </Text>
                    </View>

                    <View style={styles.appsOverviewCard}>
                        <View style={styles.appsOverviewRow}>
                            <View style={styles.appsOverviewPill}>
                                <Text style={styles.appsOverviewPillText}>Owner dashboard on web</Text>
                            </View>
                            <View style={styles.appsOverviewPill}>
                                <Text style={styles.appsOverviewPillText}>Android APKs ready</Text>
                            </View>
                        </View>
                        <Text style={styles.appsOverviewTitle}>One Fiesto system, role-based Android downloads.</Text>
                        <Text style={styles.appsOverviewText}>
                            Fiesto Chef runs the kitchen flow, Fiesto Waiter keeps floor service fast, and both connect directly to your live VPS deployment.
                        </Text>
                    </View>

                    <View style={[styles.appsDownloadGrid, isWide && styles.appsDownloadGridWide]}>
                        {fiestoAndroidApps.map((app) => (
                            <View key={app.name} style={styles.appCard}>
                                <View style={styles.appCardTopRow}>
                                    <LinearGradient colors={app.gradient} style={styles.appIconContainer}>
                                        <MaterialCommunityIcons name={app.icon} size={30} color="#FFFFFF" />
                                    </LinearGradient>
                                    <View style={styles.appBadge}>
                                        <Text style={styles.appBadgeText}>{app.badge}</Text>
                                    </View>
                                </View>
                                <Text style={styles.appName}>{app.name}</Text>
                                <Text style={styles.appSummary}>{app.summary}</Text>

                                <View style={styles.appHighlightCard}>
                                    <Text style={styles.appHighlightLabel}>{app.highlight}</Text>
                                    <Text style={styles.appHighlightText}>{app.detail}</Text>
                                </View>

                                <View style={styles.appFeatureList}>
                                    {app.featureList.map((feature) => (
                                        <View key={feature} style={styles.appFeatureRow}>
                                            <View style={styles.appFeatureDot} />
                                            <Text style={styles.appFeatureText}>{feature}</Text>
                                        </View>
                                    ))}
                                </View>

                                <TouchableOpacity style={styles.downloadPrimaryButton} onPress={() => openPublicUrl(app.primaryPath)}>
                                    <LinearGradient colors={app.gradient} style={styles.downloadPrimaryGradient}>
                                        <Text style={styles.downloadPrimaryText}>{app.primaryLabel}</Text>
                                    </LinearGradient>
                                </TouchableOpacity>

                                <TouchableOpacity style={styles.downloadSecondaryButton} onPress={() => openPublicUrl(app.secondaryPath)}>
                                    <Text style={styles.downloadSecondaryText}>{app.secondaryLabel}</Text>
                                </TouchableOpacity>

                                <Text style={styles.downloadSupportText}>
                                    Use the universal APK only if the recommended ARM64 build does not install on the device.
                                </Text>
                            </View>
                        ))}
                    </View>

                    <View style={styles.legacyAppsGrid}>
                        {[
                            { icon: 'finance', name: 'Owner Dashboard', gradient: ['#FF6B35', '#FF8F5E'] as const, features: '• Real-time sales tracking\n• Revenue & analytics\n• Staff management\n• Inventory control' },
                            { icon: 'chef-hat', name: 'Chef Mobile App', gradient: ['#8B5CF6', '#A78BFA'] as const, features: '• Live order queue\n• Priority notifications\n• Order timing\n• Quality control' },
                            { icon: 'silverware-fork-knife', name: 'Waiter Mobile App', gradient: ['#06B6D4', '#22D3EE'] as const, features: '• Incoming customer calls\n• Order status alerts\n• Bill management\n• Customer requests' },
                        ].map((app) => (
                            <View key={app.name} style={styles.appCard}>
                                <LinearGradient colors={app.gradient} style={styles.appIconContainer}>
                                    <MaterialCommunityIcons name={app.icon} size={30} color="#FFFFFF" />
                                </LinearGradient>
                                <Text style={styles.appName}>{app.name}</Text>
                                <Text style={styles.appFeatures}>{app.features}</Text>
                            </View>
                        ))}
                    </View>
                </ResponsiveContainer>
            </View>

            {/* ===================== FEATURES SHOWCASE ===================== */}
            <View style={styles.featuresSection}>
                <ResponsiveContainer maxWidth={1200}>
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Everything Your Cafe Needs to Thrive</Text>
                        <Text style={styles.sectionSubtitle}>
                            Built by for cafe owners, No more generic restaurant software.
                        </Text>
                    </View>

                    <View style={[styles.featuresGrid, isWide && styles.featuresGridWide]}>
                        {featureData.map((item) => (
                            <View key={item.title} style={[styles.featureCard, { borderLeftColor: item.color }]}>
                                <View style={[styles.featureIcon, { backgroundColor: item.color + '15' }]}>
                                    <MaterialCommunityIcons name={item.icon} size={24} color={item.color} />
                                </View>
                                <Text style={styles.featureTitle}>{item.title}</Text>
                                <Text style={styles.featureDesc}>{item.desc}</Text>
                                <View style={[styles.featureGlow, { backgroundColor: item.color + '06' }]} />
                            </View>
                        ))}
                    </View>
                </ResponsiveContainer>
            </View>

            {/* ===================== PRICING SECTION ===================== */}
            <View style={styles.pricingSection}>
                <ResponsiveContainer maxWidth={1200}>
                    <View style={styles.pricingHeader}>
                        <View style={styles.sectionLabelPill}>
                            <Text style={styles.sectionLabelText}>PRICING</Text>
                        </View>
                        <Text style={styles.pricingTitle}>Simple pricing with a real free trial</Text>
                        <Text style={styles.pricingSubtitle}>
                            Start with 1 month free. Five days before the trial ends, we send an email or make a call to confirm whether you want to continue.
                        </Text>
                    </View>

                    <View style={[styles.pricingLayout, isWide && styles.pricingLayoutWide]}>
                        <LinearGradient
                            colors={['#0F172A', '#1E293B']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.pricingCard}
                        >
                            <Text style={styles.pricingTrialBadge}>1 month free</Text>
                            <Text style={styles.pricingCardLabel}>Continue after trial</Text>
                            <Text style={styles.pricingCardPrice}>Rs. 159</Text>
                            <Text style={styles.pricingCardPeriod}>per month</Text>
                            <Text style={styles.pricingCardDescription}>
                                Includes the first 100 order sessions every month.
                            </Text>

                            <View style={styles.pricingCardDivider} />

                            <Text style={styles.pricingCardSupport}>Extra order sessions above 100: Rs. 1 each</Text>
                            <Text style={styles.pricingCardSupport}>Daytime support during working hours included</Text>
                        </LinearGradient>

                        <View style={[styles.pricingDetailsColumn, isWide && styles.pricingDetailsColumnWide]}>
                            {pricingHighlights.map((item) => (
                                <View key={item.title} style={styles.pricingDetailCard}>
                                    <View style={styles.pricingDetailIcon}>
                                        <MaterialCommunityIcons name={item.icon} size={22} color="#FF6B35" />
                                    </View>
                                    <View style={styles.pricingDetailContent}>
                                        <Text style={styles.pricingDetailTitle}>{item.title}</Text>
                                        <Text style={styles.pricingDetailDesc}>{item.desc}</Text>
                                    </View>
                                </View>
                            ))}
                        </View>
                    </View>
                </ResponsiveContainer>
            </View>

            {/* ===================== TESTIMONIALS ===================== */}
            <View style={[styles.testimonialsSection, { display: 'none' }]}>
                <ResponsiveContainer maxWidth={1000}>
                    <View style={styles.sectionLabelPill}>
                        <Text style={styles.sectionLabelText}>TESTIMONIALS</Text>
                    </View>
                    <Text style={styles.testimonialsTitle}>Real Cafe Owners, Real Results</Text>

                    <View style={[styles.testimonialsGrid, isWide && styles.testimonialsGridWide]}>
                        {testimonialData.map((testimonial, index) => (
                            <View key={index} style={styles.testimonialCard}>
                                <View style={styles.quoteIconBox}>
                                    <Text style={styles.quoteIcon}>"</Text>
                                </View>
                                <Text style={styles.testimonialQuote}>{testimonial.quote}</Text>
                                <View style={styles.testimonialDivider} />
                                <View style={styles.testimonialAuthor}>
                                    <Image source={{ uri: testimonial.avatar }} style={styles.authorAvatar as any} />
                                    <View>
                                        <Text style={styles.authorName}>{testimonial.author}</Text>
                                        <Text style={styles.authorRole}>{testimonial.role}</Text>
                                    </View>
                                </View>
                            </View>
                        ))}
                    </View>
                </ResponsiveContainer>
            </View>

            {/* ===================== CTA SECTION ===================== */}
            <View style={styles.ctaSection}>
                <View
                    style={{ backgroundColor: '#FFFFFF', ...StyleSheet.absoluteFillObject }}
                />
                <Animated.View style={[styles.ctaGlowOrb, { transform: [{ translateY: float1 }] }]} />
                <ResponsiveContainer maxWidth={800}>
                    <View style={styles.ctaContent}>
                        <Text style={styles.ctaTitle}>Ready to Start{'\n'}Your Free Month?</Text>
                        <Text style={styles.ctaSubtitle}>
                            Go live with Fiesto for 1 month free. We will remind you 5 days before the trial ends, and you can continue on a simple monthly plan if it is the right fit.
                        </Text>

                        <TouchableOpacity
                            style={styles.finalCTA}
                            onPress={navigateToCafeRegistration}
                        >
                            <LinearGradient
                                colors={['#FF6B35', '#FF8F5E']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={styles.finalCTAGradient}
                            >
                                <Text style={styles.finalCTAText}>Start My 1-Month Free Trial</Text>
                            </LinearGradient>
                        </TouchableOpacity>

                        <Text style={styles.ctaFinePrint}>
                            Rs. 159/month after trial, including 100 order sessions. Extra sessions are Rs. 1 each. Daytime support included.
                        </Text>
                    </View>
                </ResponsiveContainer>
            </View>

            {/* ===================== FOOTER ===================== */}
            <View style={styles.footer}>
                <ResponsiveContainer maxWidth={1200}>
                    <View style={styles.footerContent}>
                        <View style={styles.footerBrand}>
                            <View style={styles.footerLogoContainer}>
                                <LinearGradient
                                    colors={['#FF6B35', '#FF8F5E']}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 1 }}
                                    style={styles.footerLogoBadge}
                                >
                                    <Text style={styles.footerLogoBadgeText}>F</Text>
                                </LinearGradient>
                                <View>
                                    <Text style={styles.footerLogo}>Fiesto</Text>
                                    <Text style={styles.footerLogoCaption}>Built for cafes that move fast.</Text>
                                </View>
                            </View>
                            <Text style={styles.footerTagline}>Making cafes more profitable, one order at a time.</Text>
                        </View>

                        <View style={styles.footerLinks}>
                            <View style={styles.footerColumn}>
                                <Text style={styles.footerHeading}>Product</Text>
                                <Text style={styles.footerLink}>Features</Text>
                                <Text style={styles.footerLink}>Pricing</Text>
                                <Text style={styles.footerLink}>Demo</Text>
                            </View>
                            <View style={styles.footerColumn}>
                                <Text style={styles.footerHeading}>Support</Text>
                                <Text style={styles.footerLink}>Help Center</Text>
                                <Text style={styles.footerLink}>Contact</Text>
                                <Text style={styles.footerLink}>Status</Text>
                            </View>
                        </View>
                    </View>

                    <View style={styles.footerDivider} />

                    <View style={styles.footerBottom}>
                        <Text style={styles.footerCopyright}>© 2026 Fiesto. All rights reserved.</Text>
                        <View style={styles.footerSocial}>
                            <Text style={styles.socialIcon}>f</Text>
                            <Text style={styles.socialIcon}>𝕏</Text>
                            <Text style={styles.socialIcon}>in</Text>
                        </View>
                    </View>
                </ResponsiveContainer>
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#FAFBFF' },

    // ===========================
    // HERO SECTION
    // ===========================
    heroSection: {
        position: 'relative',
        overflow: 'hidden',
        height: screenHeight,
        paddingTop: 90,
        paddingBottom: 40,
        justifyContent: 'center',
        backgroundColor: '#F8FAFC',
    },
    heroSectionWide: {
        paddingTop: 160,
    },
    heroGradient: {
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
    },

    // Subtle background orbs
    glowOrb: { position: 'absolute', borderRadius: 999 },
    glowOrb1: {
        width: 140, height: 140,
        backgroundColor: 'rgba(15, 23, 42, 0.06)',
        top: '15%', left: '2%',
    },
    glowOrb2: {
        width: 100, height: 100,
        backgroundColor: 'rgba(71, 85, 105, 0.05)',
        top: '50%', right: '15%',
    },
    glowOrb3: {
        width: 80, height: 80,
        backgroundColor: 'rgba(148, 163, 184, 0.04)',
        bottom: '10%', left: '40%',
    },

    // Navbar
    navbarOuter: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        minHeight: 68,
        paddingVertical: 10,
        justifyContent: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(229, 231, 235, 0.5)',
        shadowColor: '#000',
        shadowOpacity: 0.08,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 2 },
    },
    navbarInner: {
        width: '100%',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 32,
        flexWrap: 'wrap',
    },
    navbarInnerWide: {
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    navbarInnerMobile: {
        width: '100%',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
    },
    navBrand: {},
    navBrandMobile: {
        width: 'auto',
        alignItems: 'flex-start',
        justifyContent: 'center',
        marginBottom: 0,
    },
    navLogoContainer: { flexDirection: 'row', alignItems: 'center', marginRight: 8 },
    navLogoBadge: {
        width: 44,
        height: 44,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
        shadowColor: '#FF6B35',
        shadowOpacity: 0.18,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
    },
    navLogoBadgeText: { color: '#FFFFFF', fontSize: 22, fontWeight: '900', letterSpacing: -0.7 },
    navLogo: { fontSize: 24, fontWeight: '800', color: '#0F172A', letterSpacing: -0.5 },
    navLogoCaption: { color: '#64748B', fontSize: 11, fontWeight: '600', marginTop: 2, letterSpacing: 0.2 },
    navLinks: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' },
    navLink: { marginRight: 20, marginBottom: 8 },
    navLinkText: { color: '#64748B', fontSize: 14, fontWeight: '500', letterSpacing: 0.2 },
    navMenuButton: {
        width: 52,
        height: 52,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 8,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.96)',
        shadowColor: '#000',
        shadowOpacity: 0.08,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 2 },
    },
    navMobileButtonWrapper: {
        justifyContent: 'center',
        height: '100%',
    },
    navbarOuterMobile: {
        minHeight: 60,
        paddingVertical: 8,
        justifyContent: 'center',
    },
    navbarContainer: {
        height: '100%',
        position: 'relative',
    },
    navCtaBtn: {
        backgroundColor: '#FF6B35',

        paddingHorizontal: 24,
        paddingVertical: 10,
        borderRadius: 8,
        shadowColor: '#FF6B35',
        shadowOpacity: 0.25,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
    },
    navCtaBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600', letterSpacing: 0.3 },
    navLoginBtn: {
        paddingHorizontal: 18,
        paddingVertical: 10,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#CBD5E1',
        backgroundColor: '#FFFFFF',
        marginRight: 12,
    },
    navLoginBtnText: { color: '#0F172A', fontSize: 14, fontWeight: '700', letterSpacing: 0.2 },
    mobileMenuOverlay: {
        position: 'absolute',
        top: 68,
        left: 0,
        right: 0,
        backgroundColor: 'rgba(255,255,255,0.96)',
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(229,231,235,0.8)',
        paddingVertical: 16,
        paddingHorizontal: 20,
        zIndex: 90,
    },
    mobileNavItem: {
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(229,231,235,0.6)',
    },
    mobileNavText: {
        color: '#0F172A',
        fontSize: 16,
        fontWeight: '600',
    },
    mobileNavCta: {
        marginTop: 12,
        backgroundColor: '#FF6B35',
        borderRadius: 10,
        paddingVertical: 12,
        alignItems: 'center',
    },
    mobileNavCtaText: {
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '700',
    },
    mobileNavSecondary: {
        marginTop: 12,
        borderRadius: 10,
        paddingVertical: 12,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#CBD5E1',
        backgroundColor: '#FFFFFF',
    },
    mobileNavSecondaryText: {
        color: '#0F172A',
        fontSize: 15,
        fontWeight: '700',
    },

    // Hero Content
    heroContent: { flexDirection: 'column', paddingHorizontal: 20, paddingVertical: 20 },
    heroContentMobile: { flexDirection: 'column', paddingHorizontal: 20, paddingVertical: 20 },
    heroContentWide: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 32 },

    heroTextSection: { flex: 1, paddingBottom: 8, maxWidth: 600 },
    heroTextSectionWide: { paddingBottom: 0, marginRight: 32 },

    taglineBox: { marginBottom: 6 },
    taglinePill: {
        alignSelf: 'flex-start',
        backgroundColor: 'rgba(255, 107, 53, 0.15)',
        borderRadius: 22,
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderWidth: 1,
        borderColor: 'rgba(255, 107, 53, 0.25)',
    },
    tagline: { color: '#FF8F5E', fontSize: 12, fontWeight: '700', letterSpacing: 1 },

    heroBadgeRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 16 },
    heroBadge: {
        backgroundColor: 'rgba(255,255,255,0.92)',
        borderRadius: 12,
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderWidth: 1,
        borderColor: 'rgba(241,245,249,0.9)',
        marginRight: 12,
        marginBottom: 12,
    },
    heroBadgeText: { color: '#0F172A', fontSize: 13, fontWeight: '600', letterSpacing: 0.3 },

    mainHeading: {
        fontSize: 52,
        fontWeight: '900',
        color: '#0F172A',
        lineHeight: 62,
        marginBottom: 12,
        letterSpacing: -1,
    },
    mainHeadingMobile: {
        fontSize: 44,
        lineHeight: 52,
    },
    headingHighlight: { color: '#FF8F5E' },

    subheading: {
        fontSize: 16,
        color: '#475569',
        lineHeight: 26,
        marginBottom: 18,
        maxWidth: 520,
        fontWeight: '500',
        letterSpacing: 0.2,
    },
    heroOfferCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 14,
        padding: 16,
        marginBottom: 24,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        maxWidth: 520,
    },
    heroOfferTitle: {
        color: '#0F172A',
        fontSize: 14,
        fontWeight: '800',
        marginBottom: 6,
    },
    heroOfferText: {
        color: '#64748B',
        fontSize: 13,
        lineHeight: 21,
        fontWeight: '500',
    },

    ctaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 },
    ctaButtonPrimary: {
        borderRadius: 12,
        overflow: 'hidden',
        shadowColor: '#FF6B35',
        shadowOpacity: 0.24,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 6 },
        elevation: 6,
    },
    ctaGradient: {
        paddingHorizontal: 28,
        paddingVertical: 14,
        borderRadius: 12,
        backgroundColor: '#FF6B35',
    },
    ctaButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', letterSpacing: 0.3 },
    ctaButtonSecondary: {
        marginLeft: 12,
        marginTop: 12,
        paddingHorizontal: 26,
        paddingVertical: 14,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#CBD5E1',
        backgroundColor: '#FFFFFF',
    },
    ctaButtonSecondaryText: { color: '#0F172A', fontSize: 15, fontWeight: '700', letterSpacing: 0.2 },

    trustRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
    trustIcon: { marginRight: 6 },
    trustText: { color: 'rgba(255,255,255,0.45)', fontSize: 12, fontWeight: '600', marginRight: 14, marginBottom: 6 },

    // Phone Mockup
    heroVisualSection: { flex: 1, alignItems: 'center', justifyContent: 'center', position: 'relative' },
    phoneWrapper: {},
    phoneFrame: {
        width: 230,
        height: 430,
        backgroundColor: '#F8FAFC',
        borderRadius: 18,
        padding: 8,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        shadowColor: '#0F172A',
        shadowOpacity: 0.08,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 10 },
        elevation: 8,
    },
    phoneNotch: {
        position: 'absolute',
        top: 12,
        alignSelf: 'center',
        left: '50%',
        marginLeft: -32,
        width: 64,
        height: 6,
        borderRadius: 3,
        backgroundColor: 'rgba(15, 23, 42, 0.08)',
        zIndex: 10,
    },
    phoneScreen: {
        flex: 1,
        backgroundColor: '#FFFFFF',
        borderRadius: 14,
        overflow: 'hidden',
        alignItems: 'center',
    },
    phoneStatusBar: {
        width: '100%',
        paddingVertical: 8,
        paddingHorizontal: 18,
        backgroundColor: '#FAFBFF',
    },
    phoneStatusTime: { fontSize: 11, fontWeight: '700', color: '#0F172A' },
    phoneAppHeader: {
        width: '100%',
        paddingVertical: 10,
        paddingHorizontal: 14,
        backgroundColor: '#FAFBFF',
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9',
    },
    phoneAppHeaderInner: { flexDirection: 'row', alignItems: 'center' },
    phoneHeaderIcon: { marginRight: 8 },
    phoneAppName: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
    qrTitle: {
        fontSize: 12,
        fontWeight: '800',
        color: '#FF6B35',
        marginTop: 18,
        marginBottom: 14,
        letterSpacing: 1.5,
    },
    qrCodeBox: {
        backgroundColor: '#F8FAFC',
        padding: 14,
        borderRadius: 10,
        marginBottom: 14,
    },
    qrGrid: { alignItems: 'center', justifyContent: 'center' },
    qrRow: { flexDirection: 'row' },
    qrDot: {
        width: 11,
        height: 11,
        margin: 1.5,
        backgroundColor: '#E2E8F0',
        borderRadius: 2,
    },
    qrDotFilled: { backgroundColor: '#302B63' },
    qrDotCorner: { backgroundColor: '#FF6B35' },
    phoneOrderBtn: {
        backgroundColor: '#FF6B35',
        paddingHorizontal: 26,
        paddingVertical: 10,
        borderRadius: 10,
        marginBottom: 10,
    },
    phoneOrderBtnText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
    phoneBottomBar: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        flexDirection: 'row',
        justifyContent: 'space-around',
        paddingVertical: 10,
        backgroundColor: '#FAFBFF',
        borderTopWidth: 1,
        borderTopColor: '#F1F5F9',
    },
    phoneBottomIcon: { fontSize: 16 },

    // Floating Cards
    floatingCard: {
        position: 'absolute',
        backgroundColor: 'rgba(255,255,255,0.95)',
        borderRadius: 10,
        padding: 12,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOpacity: 0.12,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 8 },
        elevation: 8,
    },
    floatingCard1: { top: 60, right: -20 },
    floatingCard2: { bottom: 80, left: -10 },
    floatingCardIcon: { fontSize: 20, marginBottom: 4 },
    floatingCardText: { fontSize: 12, fontWeight: '800', color: '#0F172A' },
    floatingCardStatus: { fontSize: 10, fontWeight: '600', color: '#10B981' },

    // ===========================
    // HOW IT WORKS
    // ===========================
    howItWorksSection: { backgroundColor: '#FAFBFF', paddingVertical: 64 },
    howItWorksHeader: { alignItems: 'center', marginBottom: 48 },
    sectionLabelPill: {
        alignSelf: 'center',
        backgroundColor: '#FF6B3510',
        borderRadius: 20,
        paddingVertical: 6,
        paddingHorizontal: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#FF6B3520',
    },
    howItWorksLabel: { color: '#FF6B35', fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.5 },
    sectionLabelText: { color: '#FF6B35', fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.5 },
    howItWorksTitle: {
        fontSize: 38,
        color: '#0F172A',
        fontWeight: '900',
        textAlign: 'center',
        marginBottom: 12,
        letterSpacing: -0.5,
    },
    howItWorksSubtitle: {
        fontSize: 15,
        color: '#64748B',
        textAlign: 'center',
        maxWidth: 600,
        fontWeight: '500',
        lineHeight: 24,
    },
    howItWorksGrid: { flexDirection: 'column' },
    howItWorksGridWide: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    howItWorksCard: {
        flex: 1,
        alignItems: 'center',
        position: 'relative',
        paddingVertical: 16,
        paddingHorizontal: 12,
        minWidth: 240,
        marginBottom: 24,
    },
    stepNumberCircle: {
        width: 48,
        height: 48,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 14,
        shadowColor: '#FF6B35',
        shadowOpacity: 0.22,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
        elevation: 4,
    },
    stepNumber: { color: '#FFFFFF', fontSize: 20, fontWeight: '900' },
    stepIcon: { fontSize: 38, marginBottom: 10 },
    stepTitle: { fontSize: 17, color: '#0F172A', fontWeight: '800', textAlign: 'center', marginBottom: 8, letterSpacing: -0.3 },
    stepDesc: { fontSize: 13, color: '#64748B', textAlign: 'center', maxWidth: 200, lineHeight: 20, fontWeight: '500' },
    connectorArrow: {
        position: 'absolute',
        top: 38,
        right: -16,
        zIndex: 5,
    },
    connectorArrowText: { fontSize: 24, color: '#FF6B3540' },

    // ===========================
    // BENEFITS SECTION
    // ===========================
    benefitsSection: { backgroundColor: '#FFFFFF', paddingVertical: 64 },
    benefitsHeader: { alignItems: 'center', marginBottom: 48 },
    benefitsTitle: {
        fontSize: 38,
        color: '#0F172A',
        fontWeight: '900',
        textAlign: 'center',
        marginBottom: 12,
        letterSpacing: -0.5,
    },
    benefitsSubtitle: {
        fontSize: 15,
        color: '#64748B',
        textAlign: 'center',
        maxWidth: 700,
        fontWeight: '500',
        lineHeight: 24,
    },
    benefitsGrid: { flexDirection: 'column' },
    benefitsGridWide: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
    benefitCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        padding: 28,
        marginBottom: 20,
        flex: 1,
        minWidth: 320,
        alignItems: 'flex-start',
        borderWidth: 1,
        borderColor: '#E5E7EB',
        overflow: 'hidden',
        position: 'relative',
    },
    benefitIconBox: {
        width: 52,
        height: 52,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    benefitIcon: { fontSize: 24, color: '#FFFFFF' },
    benefitTitle: { fontSize: 17, color: '#0F172A', fontWeight: '800', marginBottom: 8, letterSpacing: -0.3 },
    benefitDesc: { fontSize: 13, color: '#64748B', lineHeight: 21, fontWeight: '500' },
    benefitCorner: {
        position: 'absolute',
        top: -30,
        right: -30,
        width: 100,
        height: 100,
        borderRadius: 50,
    },

    // ===========================
    // APPLICATIONS SECTION
    // ===========================
    applicationsSection: { backgroundColor: '#F8FAFC', paddingVertical: 64 },
    appsHeader: { alignItems: 'center', marginBottom: 48 },
    appsTitle: {
        fontSize: 38,
        color: '#0F172A',
        fontWeight: '900',
        textAlign: 'center',
        marginBottom: 12,
        letterSpacing: -0.5,
    },
    appsSubtitle: {
        fontSize: 15,
        color: '#64748B',
        textAlign: 'center',
        maxWidth: 650,
        fontWeight: '500',
        lineHeight: 24,
    },
    appsOverviewCard: {
        backgroundColor: '#0F172A',
        borderRadius: 28,
        padding: 28,
        marginBottom: 28,
        overflow: 'hidden',
    },
    appsOverviewRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 16 },
    appsOverviewPill: {
        backgroundColor: 'rgba(255,255,255,0.12)',
        borderRadius: 999,
        paddingHorizontal: 14,
        paddingVertical: 8,
        marginRight: 10,
        marginBottom: 10,
    },
    appsOverviewPillText: {
        color: '#F8FAFC',
        fontSize: 12,
        fontWeight: '700',
        letterSpacing: 0.3,
    },
    appsOverviewTitle: {
        color: '#FFFFFF',
        fontSize: 28,
        fontWeight: '900',
        marginBottom: 10,
        letterSpacing: -0.6,
    },
    appsOverviewText: {
        color: '#CBD5E1',
        fontSize: 15,
        lineHeight: 24,
        fontWeight: '500',
        maxWidth: 760,
    },
    appsGrid: { flexDirection: 'column' },
    appsGridWide: { flexDirection: 'row', justifyContent: 'space-between' },
    appsDownloadGrid: { flexDirection: 'column' },
    appsDownloadGridWide: { flexDirection: 'row', justifyContent: 'space-between' },
    legacyAppsGrid: { display: 'none' },
    appCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 24,
        padding: 28,
        marginBottom: 20,
        flex: 1,
        minWidth: 280,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        shadowColor: '#0F172A',
        shadowOpacity: 0.08,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 10 },
        elevation: 5,
    },
    appCardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
    appIconContainer: {
        width: 64,
        height: 64,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    appIcon: { fontSize: 30 },
    appBadge: {
        backgroundColor: '#F8FAFC',
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    appBadgeText: { color: '#0F172A', fontSize: 12, fontWeight: '700', letterSpacing: 0.2 },
    appName: { fontSize: 24, color: '#0F172A', fontWeight: '800', marginBottom: 12, letterSpacing: -0.5 },
    appSummary: { fontSize: 14, color: '#475569', lineHeight: 23, fontWeight: '500', marginBottom: 16 },
    appHighlightCard: {
        backgroundColor: '#FFF7ED',
        borderRadius: 18,
        padding: 16,
        borderWidth: 1,
        borderColor: '#FED7AA',
        marginBottom: 18,
    },
    appHighlightLabel: { color: '#C2410C', fontSize: 12, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 4 },
    appHighlightText: { color: '#7C2D12', fontSize: 13, fontWeight: '600', lineHeight: 20 },
    appFeatureList: { marginBottom: 20 },
    appFeatureRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
    appFeatureDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#FF8F5E',
        marginRight: 10,
    },
    appFeatureText: { flex: 1, color: '#334155', fontSize: 14, fontWeight: '600', lineHeight: 20 },
    downloadPrimaryButton: {
        borderRadius: 16,
        overflow: 'hidden',
        marginBottom: 12,
    },
    downloadPrimaryGradient: {
        paddingVertical: 16,
        paddingHorizontal: 20,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 16,
    },
    downloadPrimaryText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800', letterSpacing: 0.2 },
    downloadSecondaryButton: {
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#CBD5E1',
        backgroundColor: '#F8FAFC',
        paddingVertical: 14,
        paddingHorizontal: 16,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 12,
    },
    downloadSecondaryText: { color: '#0F172A', fontSize: 14, fontWeight: '700', letterSpacing: 0.2 },
    downloadSupportText: { color: '#64748B', fontSize: 12, lineHeight: 18, fontWeight: '500' },
    appFeatures: { fontSize: 13, color: '#64748B', lineHeight: 22, textAlign: 'center', fontWeight: '500' },

    // ===========================
    // FEATURES SECTION
    // ===========================
    featuresSection: { backgroundColor: '#FFFFFF', paddingVertical: 64 },
    sectionHeader: { alignItems: 'center', marginBottom: 48 },
    sectionTitle: { fontSize: 32, color: '#0F172A', fontWeight: '900', textAlign: 'center', marginBottom: 12 },
    sectionSubtitle: { fontSize: 15, color: '#64748B', textAlign: 'center', maxWidth: 600, lineHeight: 24 },

    featuresGrid: { flexDirection: 'column' },
    featuresGridWide: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
    featureCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        padding: 26,
        marginBottom: 20,
        flex: 1,
        minWidth: 280,
        borderLeftWidth: 4,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        position: 'relative',
        overflow: 'hidden',
    },
    featureIcon: { width: 48, height: 48, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
    featureEmoji: { fontSize: 22 },
    featureTitle: { color: '#0F172A', fontSize: 18, fontWeight: '800', marginBottom: 8 },
    featureDesc: { color: '#64748B', fontSize: 14, lineHeight: 22, fontWeight: '500' },
    featureGlow: {
        position: 'absolute',
        bottom: -40,
        right: -40,
        width: 120,
        height: 120,
        borderRadius: 60,
    },

    // ===========================
    // PRICING
    // ===========================
    pricingSection: { backgroundColor: '#FAFBFF', paddingVertical: 64 },
    pricingHeader: { alignItems: 'center', marginBottom: 40 },
    pricingTitle: {
        fontSize: 38,
        color: '#0F172A',
        fontWeight: '900',
        textAlign: 'center',
        marginBottom: 12,
        letterSpacing: -0.5,
    },
    pricingSubtitle: {
        fontSize: 15,
        color: '#64748B',
        textAlign: 'center',
        maxWidth: 760,
        fontWeight: '500',
        lineHeight: 24,
    },
    pricingLayout: { flexDirection: 'column' },
    pricingLayoutWide: { flexDirection: 'row', alignItems: 'stretch' },
    pricingCard: {
        flex: 1,
        borderRadius: 24,
        padding: 32,
        marginBottom: 20,
        minWidth: 300,
    },
    pricingTrialBadge: {
        alignSelf: 'flex-start',
        backgroundColor: 'rgba(255,255,255,0.14)',
        color: '#FFFFFF',
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 999,
        fontSize: 12,
        fontWeight: '800',
        letterSpacing: 0.8,
        textTransform: 'uppercase',
        marginBottom: 20,
    },
    pricingCardLabel: {
        color: '#CBD5E1',
        fontSize: 14,
        fontWeight: '700',
        marginBottom: 10,
    },
    pricingCardPrice: {
        color: '#FFFFFF',
        fontSize: 52,
        fontWeight: '900',
        letterSpacing: -1,
        marginBottom: 4,
    },
    pricingCardPeriod: {
        color: '#E2E8F0',
        fontSize: 16,
        fontWeight: '700',
        marginBottom: 18,
    },
    pricingCardDescription: {
        color: '#CBD5E1',
        fontSize: 15,
        lineHeight: 24,
        fontWeight: '500',
    },
    pricingCardDivider: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.12)',
        marginVertical: 20,
    },
    pricingCardSupport: {
        color: '#FFFFFF',
        fontSize: 14,
        lineHeight: 22,
        fontWeight: '600',
        marginBottom: 8,
    },
    pricingDetailsColumn: {
        flex: 1.15,
        marginLeft: 0,
    },
    pricingDetailsColumnWide: {
        marginLeft: 24,
    },
    pricingDetailCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 18,
        padding: 20,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 16,
    },
    pricingDetailIcon: {
        width: 44,
        height: 44,
        borderRadius: 12,
        backgroundColor: '#FFF1EB',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 14,
    },
    pricingDetailContent: { flex: 1 },
    pricingDetailTitle: {
        color: '#0F172A',
        fontSize: 16,
        fontWeight: '800',
        marginBottom: 6,
    },
    pricingDetailDesc: {
        color: '#64748B',
        fontSize: 14,
        lineHeight: 22,
        fontWeight: '500',
    },

    // ===========================
    // TESTIMONIALS
    // ===========================
    testimonialsSection: { paddingVertical: 64, backgroundColor: '#F8FAFC' },
    testimonialsTitle: {
        fontSize: 38,
        color: '#0F172A',
        fontWeight: '900',
        textAlign: 'center',
        marginBottom: 40,
        letterSpacing: -0.5,
    },
    testimonialsGrid: { flexDirection: 'column' },
    testimonialsGridWide: { flexDirection: 'row', justifyContent: 'space-between' },
    testimonialCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        padding: 28,
        flex: 1,
        minWidth: 300,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    quoteIconBox: { marginBottom: 8 },
    quoteIcon: { fontSize: 36, color: '#FF6B35', fontWeight: '900' },
    testimonialQuote: {
        color: '#334155',
        fontSize: 15,
        lineHeight: 26,
        fontStyle: 'italic',
        marginBottom: 16,
        fontWeight: '400',
    },
    testimonialDivider: {
        height: 1,
        backgroundColor: '#F1F5F9',
        marginBottom: 16,
    },
    testimonialAuthor: { flexDirection: 'row', alignItems: 'center' },
    authorAvatar: { width: 44, height: 44, borderRadius: 8, marginRight: 12, borderWidth: 1, borderColor: '#E5E7EB' },
    authorName: { color: '#0F172A', fontSize: 14, fontWeight: '700', letterSpacing: -0.2 },
    authorRole: { color: '#64748B', fontSize: 12, fontWeight: '400', marginTop: 2 },

    // ===========================
    // CTA SECTION
    // ===========================
    ctaSection: {
        paddingVertical: 72,
        position: 'relative',
        overflow: 'hidden',
    },
    ctaGlowOrb: {
        position: 'absolute',
        width: 300,
        height: 300,
        borderRadius: 150,
        backgroundColor: 'rgba(255, 107, 53, 0.1)',
        top: -50,
        right: -50,
    },
    ctaContent: { alignItems: 'center', zIndex: 2 },
    ctaTitle: {
        color: '#0F172A',
        fontSize: 40,
        fontWeight: '900',
        textAlign: 'center',
        marginBottom: 14,
        letterSpacing: -0.5,
        lineHeight: 50,
    },
    ctaSubtitle: {
        color: '#64748B',
        fontSize: 16,
        textAlign: 'center',
        marginBottom: 32,
        maxWidth: 500,
        fontWeight: '500',
        lineHeight: 26,
    },
    finalCTA: {
        borderRadius: 10,
        overflow: 'hidden',
        marginBottom: 16,
        shadowColor: '#FF6B35',
        shadowOpacity: 0.32,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 8 },
        elevation: 8,
    },
    finalCTAGradient: {
        paddingHorizontal: 32,
        paddingVertical: 16,
        borderRadius: 10,
    },
    finalCTAText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', letterSpacing: 0.2 },
    ctaFinePrint: { color: '#64748B', fontSize: 12, textAlign: 'center', fontWeight: '400' },

    // ===========================
    // FOOTER
    // ===========================
    footer: { backgroundColor: '#0C0A1D', paddingVertical: 40 },
    footerContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
    footerBrand: { flex: 1 },
    footerLogoContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
    footerLogoBadge: {
        width: 40,
        height: 40,
        borderRadius: 13,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    footerLogoBadgeText: { color: '#FFFFFF', fontSize: 20, fontWeight: '900', letterSpacing: -0.6 },
    footerLogo: { color: '#FFFFFF', fontSize: 20, fontWeight: '900', letterSpacing: -0.3 },
    footerLogoCaption: { color: '#94A3B8', fontSize: 11, fontWeight: '600', marginTop: 2, letterSpacing: 0.2 },
    footerTagline: { color: '#64748B', fontSize: 13, maxWidth: 300, fontWeight: '400', lineHeight: 20 },
    footerLinks: { flexDirection: 'row' },
    footerColumn: { marginLeft: 40 },
    footerHeading: { color: '#FFFFFF', fontSize: 13, fontWeight: '700', marginBottom: 12, letterSpacing: 0.2 },
    footerLink: { color: '#64748B', fontSize: 13, marginBottom: 8, fontWeight: '400' },
    footerDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginBottom: 20 },
    footerBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    footerCopyright: { color: '#475569', fontSize: 12, fontWeight: '400' },
    footerSocial: { flexDirection: 'row' },
    socialIcon: { fontSize: 16, marginLeft: 14 },
});
