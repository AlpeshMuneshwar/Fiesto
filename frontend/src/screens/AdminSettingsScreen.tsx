import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, TextInput, Alert, ActivityIndicator, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import client from '../api/client';
import ResponsiveContainer from '../components/ResponsiveContainer';

export default function AdminSettingsScreen() {
    const [settings, setSettings] = useState<any>(null);
    const [discoveryProfile, setDiscoveryProfile] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        try {
            const [settingsRes, profileRes] = await Promise.all([
                client.get('/settings'),
                client.get('/admin/discovery-profile').catch(() => ({ data: null })),
            ]);
            setSettings(settingsRes.data);
            setDiscoveryProfile(profileRes.data);
        } catch (error: any) {
            Alert.alert("Error", error.response?.data?.error || "Failed to load settings");
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const toNullableNumber = (value: any) => {
                if (value === null || value === undefined || value === '') return null;
                const parsed = parseFloat(value.toString());
                return Number.isFinite(parsed) ? parsed : null;
            };
            // Need to ensure numerics are parsed
            const payload = {
                ...settings,
                taxRate: parseFloat(settings.taxRate?.toString() || '0'),
                serviceChargeRate: parseFloat(settings.serviceChargeRate?.toString() || '0'),
                avgPrepTimeMinutes: parseInt(settings.avgPrepTimeMinutes?.toString() || '15', 10),
                platformFeeAmount: parseFloat(settings.platformFeeAmount?.toString() || '0'),
                preOrderAdvanceRate: parseFloat(settings.preOrderAdvanceRate?.toString() || '0'),
            };
            delete payload.id;
            delete payload.cafeId;

            const res = await client.put('/settings', payload);
            setSettings(res.data.settings);
            if (discoveryProfile) {
                await client.put('/admin/discovery-profile', {
                    city: discoveryProfile.city,
                    latitude: toNullableNumber(discoveryProfile.latitude),
                    longitude: toNullableNumber(discoveryProfile.longitude),
                    isFeatured: Boolean(discoveryProfile.isFeatured),
                    featuredPriority: parseInt(discoveryProfile.featuredPriority?.toString() || '0', 10),
                    coverImage: discoveryProfile.coverImage || null,
                    galleryImages: discoveryProfile.galleryImages || null,
                });
            }
            Alert.alert("Success", "Settings updated successfully");
        } catch (error: any) {
            Alert.alert("Error", error.response?.data?.error || "Failed to save settings");
            console.log(error.response?.data)
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#38BDF8" />
                <Text style={styles.loadingText}>Loading Settings...</Text>
            </View>
        );
    }

    if (!settings) {
        return (
            <View style={styles.loadingContainer}>
                <Text style={styles.loadingText}>Failed to load settings</Text>
            </View>
        );
    }

    const ToggleRow = ({ label, value, onChange }: { label: string, value: boolean, onChange: (v: boolean) => void }) => (
        <View style={styles.row}>
            <Text style={styles.rowLabel}>{label}</Text>
            <Switch
                value={value}
                onValueChange={onChange}
                trackColor={{ false: '#334155', true: '#0EA5E9' }}
                thumbColor={value ? '#ffffff' : '#94A3B8'}
            />
        </View>
    );

    const PaymentModeSelector = () => (
        <View style={styles.segmentedControl}>
            {['WAITER_AT_TABLE', 'PAY_AT_COUNTER', 'BOTH'].map((mode) => (
                <TouchableOpacity
                    key={mode}
                    style={[styles.segmentBtn, settings.paymentMode === mode && styles.segmentBtnActive]}
                    onPress={() => setSettings({ ...settings, paymentMode: mode })}
                >
                    <Text style={[styles.segmentText, settings.paymentMode === mode && styles.segmentTextActive]}>
                        {mode.replace(/_/g, ' ')}
                    </Text>
                </TouchableOpacity>
            ))}
        </View>
    );

    return (
        <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 60 }}>
            <StatusBar style="light" />
            <ResponsiveContainer maxWidth={800}>
                <View style={styles.header}>
                    <Text style={styles.title}>Cafe Settings</Text>
                    <Text style={styles.subtitle}>Configure workflows, taxes, and features</Text>
                </View>

                {/* Payment Workflow */}
                <View style={[styles.card, styles.glassCard]}>
                    <Text style={styles.sectionTitle}>Payment Workflow</Text>
                    <Text style={styles.helpText}>Determine how customers pay their bills.</Text>
                    <PaymentModeSelector />
                </View>

                {/* Tax & Charges */}
                <View style={[styles.card, styles.glassCard]}>
                    <Text style={styles.sectionTitle}>Taxes & Charges</Text>
                    
                    <ToggleRow 
                        label="Enable Tax (e.g. GST)" 
                        value={settings.taxEnabled} 
                        onChange={(v) => setSettings({ ...settings, taxEnabled: v })} 
                    />
                    
                    {settings.taxEnabled && (
                        <View style={styles.subFields}>
                            <View style={styles.inputRow}>
                                <Text style={styles.inputLabel}>Tax Label (e.g. GST)</Text>
                                <TextInput 
                                    style={styles.input} 
                                    value={settings.taxLabel} 
                                    onChangeText={(v) => setSettings({ ...settings, taxLabel: v })} 
                                />
                            </View>
                            <View style={styles.inputRow}>
                                <Text style={styles.inputLabel}>GST Number (Optional)</Text>
                                <TextInput 
                                    style={styles.input} 
                                    value={settings.gstNumber} 
                                    placeholder="e.g. 27AAAAA0000A1Z5"
                                    placeholderTextColor="#64748B"
                                    onChangeText={(v) => setSettings({ ...settings, gstNumber: v })} 
                                />
                            </View>
                            <View style={styles.inputRow}>
                                <Text style={styles.inputLabel}>Tax Rate (%)</Text>
                                <TextInput 
                                    style={styles.input} 
                                    value={settings.taxRate?.toString()} 
                                    keyboardType="decimal-pad"
                                    onChangeText={(v) => setSettings({ ...settings, taxRate: v })} 
                                />
                            </View>
                            <ToggleRow 
                                label="Prices are Tax Inclusive" 
                                value={settings.taxInclusive} 
                                onChange={(v) => setSettings({ ...settings, taxInclusive: v })} 
                            />
                        </View>
                    )}

                    <View style={styles.divider} />

                    <ToggleRow 
                        label="Enable Service Charge" 
                        value={settings.serviceChargeEnabled} 
                        onChange={(v) => setSettings({ ...settings, serviceChargeEnabled: v })} 
                    />
                    
                    {settings.serviceChargeEnabled && (
                        <View style={styles.subFields}>
                            <View style={styles.inputRow}>
                                <Text style={styles.inputLabel}>Service Charge Rate (%)</Text>
                                <TextInput 
                                    style={styles.input} 
                                    value={settings.serviceChargeRate?.toString()} 
                                    keyboardType="decimal-pad"
                                    onChangeText={(v) => setSettings({ ...settings, serviceChargeRate: v })} 
                                />
                            </View>
                        </View>
                    )}
                </View>

                {/* Feature Toggles */}
                <View style={[styles.card, styles.glassCard]}>
                    <Text style={styles.sectionTitle}>Feature Toggles</Text>
                    
                    <ToggleRow 
                        label="Customer Can Call Waiter" 
                        value={settings.customerCanCallWaiter} 
                        onChange={(v) => setSettings({ ...settings, customerCanCallWaiter: v })} 
                    />
                    <ToggleRow 
                        label="Enable Customer Special Instructions" 
                        value={settings.specialInstructions} 
                        onChange={(v) => setSettings({ ...settings, specialInstructions: v })} 
                    />
                    <ToggleRow 
                        label="Enforce QR Location Verification" 
                        value={settings.locationVerification} 
                        onChange={(v) => setSettings({ ...settings, locationVerification: v })} 
                    />
                    <ToggleRow 
                        label="Auto-Accept Orders (Skip Approval)" 
                        value={settings.autoAcceptOrders} 
                        onChange={(v) => setSettings({ ...settings, autoAcceptOrders: v })} 
                    />
                    
                    <View style={styles.divider} />
                    
                    <ToggleRow 
                        label="Show Estimated Prep Time" 
                        value={settings.showPrepTime} 
                        onChange={(v) => setSettings({ ...settings, showPrepTime: v })} 
                    />
                    {settings.showPrepTime && (
                        <View style={styles.subFields}>
                            <View style={styles.inputRow}>
                                <Text style={styles.inputLabel}>Avg. Prep Time (Mins)</Text>
                                <TextInput 
                                    style={styles.input} 
                                    value={settings.avgPrepTimeMinutes?.toString()} 
                                    keyboardType="number-pad"
                                    onChangeText={(v) => setSettings({ ...settings, avgPrepTimeMinutes: v })} 
                                />
                            </View>
                        </View>
                    )}

                    <View style={styles.divider} />

                    <ToggleRow 
                        label="Enable Dietary Tags (Veg/Non-Veg)" 
                        value={settings.dietaryTagsEnabled} 
                        onChange={(v) => setSettings({ ...settings, dietaryTagsEnabled: v })} 
                    />
                    <ToggleRow 
                        label="Display Menu Images" 
                        value={settings.menuImagesEnabled} 
                        onChange={(v) => setSettings({ ...settings, menuImagesEnabled: v })} 
                    />
                </View>

                <View style={[styles.card, styles.glassCard]}>
                    <Text style={styles.sectionTitle}>Reservations & Preorders</Text>
                    <Text style={styles.helpText}>Control whether discovery users can reserve, queue, and pay deposits.</Text>

                    <ToggleRow
                        label="Enable Reservations and Discovery Booking"
                        value={settings.reservationsEnabled}
                        onChange={(v) => setSettings({ ...settings, reservationsEnabled: v })}
                    />

                    {settings.reservationsEnabled && (
                        <View style={styles.subFields}>
                            <View style={styles.inputRow}>
                                <Text style={styles.inputLabel}>Platform Fee Amount</Text>
                                <TextInput
                                    style={styles.input}
                                    value={settings.platformFeeAmount?.toString()}
                                    keyboardType="decimal-pad"
                                    onChangeText={(v) => setSettings({ ...settings, platformFeeAmount: v })}
                                />
                            </View>
                            <View style={styles.inputRow}>
                                <Text style={styles.inputLabel}>Advance Deposit Rate (%)</Text>
                                <TextInput
                                    style={styles.input}
                                    value={settings.preOrderAdvanceRate?.toString()}
                                    keyboardType="decimal-pad"
                                    onChangeText={(v) => setSettings({ ...settings, preOrderAdvanceRate: v })}
                                />
                            </View>
                        </View>
                    )}
                </View>

                {/* Currency */}
                <View style={[styles.card, styles.glassCard]}>
                    <Text style={styles.sectionTitle}>Currency Settings</Text>
                    <View style={styles.inputRow}>
                        <Text style={styles.inputLabel}>Currency Code (e.g. INR)</Text>
                        <TextInput 
                            style={styles.input} 
                            value={settings.currency} 
                            onChangeText={(v) => setSettings({ ...settings, currency: v })} 
                        />
                    </View>
                    <View style={styles.inputRow}>
                        <Text style={styles.inputLabel}>Currency Symbol (e.g. ₹)</Text>
                        <TextInput 
                            style={styles.input} 
                            value={settings.currencySymbol} 
                            onChangeText={(v) => setSettings({ ...settings, currencySymbol: v })} 
                        />
                    </View>
                </View>

                {/* Save Button */}
                <View style={[styles.card, styles.glassCard]}>
                    <Text style={styles.sectionTitle}>Discovery Profile</Text>
                    <Text style={styles.helpText}>Set city and geolocation for distance sort. Mark as featured for your city.</Text>
                    <View style={styles.inputRow}>
                        <Text style={styles.inputLabel}>City</Text>
                        <TextInput
                            style={styles.input}
                            value={discoveryProfile?.city || ''}
                            onChangeText={(v) => setDiscoveryProfile({ ...(discoveryProfile || {}), city: v })}
                        />
                    </View>
                    <View style={styles.inputRow}>
                        <Text style={styles.inputLabel}>Latitude</Text>
                        <TextInput
                            style={styles.input}
                            keyboardType="decimal-pad"
                            value={discoveryProfile?.latitude?.toString?.() || ''}
                            onChangeText={(v) => setDiscoveryProfile({ ...(discoveryProfile || {}), latitude: v })}
                        />
                    </View>
                    <View style={styles.inputRow}>
                        <Text style={styles.inputLabel}>Longitude</Text>
                        <TextInput
                            style={styles.input}
                            keyboardType="decimal-pad"
                            value={discoveryProfile?.longitude?.toString?.() || ''}
                            onChangeText={(v) => setDiscoveryProfile({ ...(discoveryProfile || {}), longitude: v })}
                        />
                    </View>
                    <ToggleRow
                        label="Feature this cafe in city feed"
                        value={Boolean(discoveryProfile?.isFeatured)}
                        onChange={(v) => setDiscoveryProfile({ ...(discoveryProfile || {}), isFeatured: v })}
                    />
                    <View style={styles.inputRow}>
                        <Text style={styles.inputLabel}>Featured Priority (lower first)</Text>
                        <TextInput
                            style={styles.input}
                            keyboardType="number-pad"
                            value={discoveryProfile?.featuredPriority?.toString?.() || '0'}
                            onChangeText={(v) => setDiscoveryProfile({ ...(discoveryProfile || {}), featuredPriority: v })}
                        />
                    </View>
                    <View style={styles.divider} />
                    <Text style={styles.helpText}>Provide valid Image URLs for your Discovery Page.</Text>
                    <View style={styles.inputRow}>
                        <Text style={styles.inputLabel}>Cover Image URL</Text>
                        <TextInput
                            style={styles.input}
                            value={discoveryProfile?.coverImage || ''}
                            onChangeText={(v) => setDiscoveryProfile({ ...(discoveryProfile || {}), coverImage: v })}
                            placeholder="https://..."
                            placeholderTextColor="#64748B"
                        />
                    </View>
                    <View style={styles.inputRow}>
                        <Text style={styles.inputLabel}>Gallery Images (comma separated URLs)</Text>
                        <TextInput
                            style={[styles.input, { height: 80 }]}
                            multiline
                            value={discoveryProfile?.galleryImages || ''}
                            onChangeText={(v) => setDiscoveryProfile({ ...(discoveryProfile || {}), galleryImages: v })}
                            placeholder="https://img1.jpg, https://img2.jpg"
                            placeholderTextColor="#64748B"
                        />
                    </View>
                </View>

                <TouchableOpacity 
                    style={styles.saveBtn} 
                    onPress={handleSave} 
                    disabled={saving}
                >
                    {saving ? (
                        <ActivityIndicator color="#0F172A" />
                    ) : (
                        <Text style={styles.saveBtnText}>Save All Settings</Text>
                    )}
                </TouchableOpacity>

            </ResponsiveContainer>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0F172A' },
    loadingContainer: { flex: 1, backgroundColor: '#0F172A', justifyContent: 'center', alignItems: 'center' },
    loadingText: { color: '#94A3B8', marginTop: 10, fontSize: 16 },
    header: { padding: 30, paddingTop: 60 },
    title: { color: 'white', fontSize: 32, fontWeight: '800' },
    subtitle: { color: '#94A3B8', fontSize: 16, marginTop: 4 },
    card: { marginHorizontal: 20, marginBottom: 20, padding: 25, borderRadius: 24 },
    glassCard: {
        backgroundColor: 'rgba(30, 41, 59, 0.7)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.1)',
        ...Platform.select({ web: { boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }, default: {} })
    },
    sectionTitle: { color: 'white', fontSize: 18, fontWeight: '700', marginBottom: 5 },
    helpText: { color: '#64748B', fontSize: 13, marginBottom: 20 },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 },
    rowLabel: { color: '#E2E8F0', fontSize: 15, fontWeight: '500', flex: 1 },
    divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.05)', marginVertical: 10 },
    subFields: { backgroundColor: 'rgba(15, 23, 42, 0.3)', padding: 15, borderRadius: 12, marginTop: 5 },
    inputRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    inputLabel: { color: '#94A3B8', fontSize: 14, flex: 1 },
    input: { backgroundColor: 'rgba(30, 41, 59, 0.8)', color: 'white', paddingHorizontal: 15, paddingVertical: 10, borderRadius: 10, flex: 1, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
    segmentedControl: { flexDirection: 'row', backgroundColor: 'rgba(15, 23, 42, 0.5)', borderRadius: 12, padding: 4, marginTop: 10 },
    segmentBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 10 },
    segmentBtnActive: { backgroundColor: '#38BDF8' },
    segmentText: { color: '#94A3B8', fontSize: 11, fontWeight: '700' },
    segmentTextActive: { color: '#0F172A' },
    saveBtn: { backgroundColor: '#38BDF8', marginHorizontal: 20, paddingVertical: 18, borderRadius: 16, alignItems: 'center', marginTop: 10 },
    saveBtnText: { color: '#0F172A', fontSize: 16, fontWeight: '800' }
});
