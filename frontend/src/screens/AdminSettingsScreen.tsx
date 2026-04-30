import React, { useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Switch,
    TextInput,
    Alert,
    ActivityIndicator,
    Platform,
    Image,
    Linking,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import client from '../api/client';
import ResponsiveContainer from '../components/ResponsiveContainer';

type UploadAsset = {
    uri: string;
    name: string;
    mimeType: string;
    file?: File | null;
};

type GalleryPreview = {
    key: string;
    id: string | null;
    url: string;
    source: 'DATABASE' | 'LEGACY' | 'LOCAL';
    localIndex?: number;
};

const toNullableNumber = (value: any) => {
    if (value === null || value === undefined || value === '') return null;
    const parsed = parseFloat(value.toString());
    return Number.isFinite(parsed) ? parsed : null;
};

const extractCoordsFromMapsLink = (value: string) => {
    let input = (value || '').trim();
    try {
        input = decodeURIComponent(input);
    } catch {
        // Keep the raw link if decoding fails.
    }
    if (!input) return null;

    const patterns = [
        /@([+-]?\d{1,2}(?:\.\d+)?),([+-]?\d{1,3}(?:\.\d+)?)/,
        /[?&](?:q|query|ll|destination)=([+-]?\d{1,2}(?:\.\d+)?),\s*([+-]?\d{1,3}(?:\.\d+)?)/,
        /!3d([+-]?\d{1,2}(?:\.\d+)?)!4d([+-]?\d{1,3}(?:\.\d+)?)/,
        /([+-]?\d{1,2}(?:\.\d+)?),\s*([+-]?\d{1,3}(?:\.\d+)?)/,
    ];

    for (const pattern of patterns) {
        const match = input.match(pattern);
        if (!match) continue;

        const latitude = Number(match[1]);
        const longitude = Number(match[2]);
        if (
            Number.isFinite(latitude) &&
            Number.isFinite(longitude) &&
            latitude >= -90 &&
            latitude <= 90 &&
            longitude >= -180 &&
            longitude <= 180
        ) {
            return { latitude, longitude };
        }
    }

    return null;
};

const toUploadAsset = (asset: any, prefix: string, index = 0): UploadAsset => {
    const timestamp = Date.now();
    const fileName =
        asset?.fileName ||
        asset?.file?.name ||
        `${prefix}-${timestamp}-${index}.${asset?.mimeType?.includes('png') ? 'png' : 'jpg'}`;

    return {
        uri: asset.uri,
        name: fileName,
        mimeType: asset?.mimeType || asset?.file?.type || 'image/jpeg',
        file: asset?.file || null,
    };
};

const normalizeDiscoveryProfile = (data: any) => ({
    city: data?.city || '',
    contactPhone: data?.contactPhone || '',
    googleMapsUrl: data?.googleMapsUrl || '',
    latitude: data?.latitude ?? null,
    longitude: data?.longitude ?? null,
    isFeatured: Boolean(data?.isFeatured),
    featuredPriority: data?.featuredPriority?.toString?.() || '0',
    coverImage: data?.coverImage || '',
    coverImageAssetId: data?.coverImageAssetId || null,
    galleryImageAssets: Array.isArray(data?.galleryImageAssets) ? data.galleryImageAssets : [],
    legacyGalleryImages: Array.isArray(data?.legacyGalleryImages) ? data.legacyGalleryImages : [],
    pendingCoverImage: null as UploadAsset | null,
    pendingGalleryImages: [] as UploadAsset[],
    removeGalleryAssetIds: [] as string[],
    clearCoverImage: false,
    clearCoordinates: false,
});

const appendFormDataImage = (formData: FormData, fieldName: string, asset: UploadAsset) => {
    if (Platform.OS === 'web' && asset.file) {
        formData.append(fieldName, asset.file, asset.name);
        return;
    }

    formData.append(fieldName, {
        uri: asset.uri,
        name: asset.name,
        type: asset.mimeType,
    } as any);
};

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

            setSettings({
                orderRoutingMode: 'STANDARD',
                directAdminChefAppEnabled: false,
                ...settingsRes.data,
            });
            setDiscoveryProfile(normalizeDiscoveryProfile(profileRes.data || {}));
        } catch (error: any) {
            Alert.alert('Error', error.response?.data?.error || 'Failed to load settings');
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);

        try {
            const settingsPayload = {
                ...settings,
                taxRate: parseFloat(settings.taxRate?.toString() || '0'),
                serviceChargeRate: parseFloat(settings.serviceChargeRate?.toString() || '0'),
                avgPrepTimeMinutes: parseInt(settings.avgPrepTimeMinutes?.toString() || '15', 10),
            };

            delete settingsPayload.id;
            delete settingsPayload.cafeId;

            const settingsRes = await client.put('/settings', settingsPayload);
            setSettings(settingsRes.data.settings);

            if (discoveryProfile) {
                const formData = new FormData();
                const discoveryPayload = {
                    city: String(discoveryProfile.city || '').trim(),
                    contactPhone: String(discoveryProfile.contactPhone || '').trim() || null,
                    googleMapsUrl: String(discoveryProfile.googleMapsUrl || '').trim() || null,
                    latitude: toNullableNumber(discoveryProfile.latitude),
                    longitude: toNullableNumber(discoveryProfile.longitude),
                    isFeatured: Boolean(discoveryProfile.isFeatured),
                    featuredPriority: parseInt(discoveryProfile.featuredPriority?.toString() || '0', 10),
                    clearCoordinates: Boolean(discoveryProfile.clearCoordinates),
                    clearCoverImage: Boolean(discoveryProfile.clearCoverImage),
                    legacyGalleryImages: discoveryProfile.legacyGalleryImages || [],
                    removeGalleryAssetIds: discoveryProfile.removeGalleryAssetIds || [],
                };

                formData.append('data', JSON.stringify(discoveryPayload));

                if (discoveryProfile.pendingCoverImage) {
                    appendFormDataImage(formData, 'coverImage', discoveryProfile.pendingCoverImage);
                }

                for (const asset of discoveryProfile.pendingGalleryImages || []) {
                    appendFormDataImage(formData, 'galleryImages', asset);
                }

                const discoveryRes = await client.put('/admin/discovery-profile', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                });

                setDiscoveryProfile(normalizeDiscoveryProfile(discoveryRes.data?.cafe || {}));
            }

            Alert.alert('Success', 'Settings updated successfully');
        } catch (error: any) {
            Alert.alert('Error', error.response?.data?.error || 'Failed to save settings');
            console.log(error.response?.data);
        } finally {
            setSaving(false);
        }
    };

    const pickCoverImage = async () => {
        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsEditing: true,
                quality: 0.9,
            });

            if (result.canceled || !result.assets?.length) return;

            setDiscoveryProfile((prev: any) => ({
                ...prev,
                pendingCoverImage: toUploadAsset(result.assets[0], 'discovery-cover'),
                clearCoverImage: false,
            }));
        } catch {
            Alert.alert('Upload Error', 'Could not select the cover image.');
        }
    };

    const pickGalleryImages = async () => {
        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsMultipleSelection: true,
                selectionLimit: 6,
                quality: 0.9,
            });

            if (result.canceled || !result.assets?.length) return;

            const nextAssets = result.assets.map((asset: any, index: number) =>
                toUploadAsset(asset, 'discovery-gallery', index)
            );

            setDiscoveryProfile((prev: any) => ({
                ...prev,
                pendingGalleryImages: [...(prev.pendingGalleryImages || []), ...nextAssets],
            }));
        } catch {
            Alert.alert('Upload Error', 'Could not select gallery images.');
        }
    };

    const clearSavedLocation = () => {
        setDiscoveryProfile((prev: any) => ({
            ...prev,
            googleMapsUrl: '',
            latitude: null,
            longitude: null,
            clearCoordinates: true,
        }));
    };

    const removeCoverImage = () => {
        setDiscoveryProfile((prev: any) => {
            if (prev.pendingCoverImage) {
                return {
                    ...prev,
                    pendingCoverImage: null,
                };
            }

            return {
                ...prev,
                coverImage: '',
                coverImageAssetId: null,
                clearCoverImage: true,
            };
        });
    };

    const removeGalleryPreview = (item: GalleryPreview) => {
        setDiscoveryProfile((prev: any) => {
            if (item.source === 'LOCAL') {
                return {
                    ...prev,
                    pendingGalleryImages: (prev.pendingGalleryImages || []).filter((_: any, index: number) => index !== item.localIndex),
                };
            }

            if (item.source === 'DATABASE') {
                return {
                    ...prev,
                    galleryImageAssets: (prev.galleryImageAssets || []).filter((asset: any) => asset.id !== item.id),
                    removeGalleryAssetIds: item.id
                        ? [...new Set([...(prev.removeGalleryAssetIds || []), item.id])]
                        : prev.removeGalleryAssetIds || [],
                };
            }

            return {
                ...prev,
                galleryImageAssets: (prev.galleryImageAssets || []).filter((asset: any) => asset.url !== item.url),
                legacyGalleryImages: (prev.legacyGalleryImages || []).filter((url: string) => url !== item.url),
            };
        });
    };

    const coverPreviewUri = discoveryProfile?.pendingCoverImage?.uri || discoveryProfile?.coverImage || '';
    const mapLinkPreview = useMemo(
        () => extractCoordsFromMapsLink(discoveryProfile?.googleMapsUrl || ''),
        [discoveryProfile?.googleMapsUrl]
    );

    const galleryPreviews = useMemo<GalleryPreview[]>(() => {
        if (!discoveryProfile) return [];

        const existing = (discoveryProfile.galleryImageAssets || []).map((asset: any, index: number) => ({
            key: `${asset.source || 'asset'}-${asset.id || index}-${asset.url}`,
            id: asset.id || null,
            url: asset.url,
            source: asset.source || 'LEGACY',
        }));

        const pending = (discoveryProfile.pendingGalleryImages || []).map((asset: UploadAsset, index: number) => ({
            key: `local-${index}-${asset.uri}`,
            id: null,
            url: asset.uri,
            source: 'LOCAL' as const,
            localIndex: index,
        }));

        return [...existing, ...pending];
    }, [discoveryProfile]);

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

    const ToggleRow = ({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) => (
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

    const OrderRoutingSelector = () => (
        <View style={styles.segmentedControl}>
            {['STANDARD', 'DIRECT_ADMIN_MANAGEMENT'].map((mode) => (
                <TouchableOpacity
                    key={mode}
                    style={[styles.segmentBtn, settings.orderRoutingMode === mode && styles.segmentBtnActive]}
                    onPress={() => setSettings({ ...settings, orderRoutingMode: mode })}
                >
                    <Text style={[styles.segmentText, settings.orderRoutingMode === mode && styles.segmentTextActive]}>
                        {mode === 'STANDARD' ? 'Standard Flow' : 'Direct Admin Mode'}
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

                <View style={[styles.card, styles.glassCard]}>
                    <Text style={styles.sectionTitle}>Payment Workflow</Text>
                    <Text style={styles.helpText}>Determine how customers pay their bills.</Text>
                    <PaymentModeSelector />
                </View>

                <View style={[styles.card, styles.glassCard]}>
                    <Text style={styles.sectionTitle}>Order Control Mode</Text>
                    <Text style={styles.helpText}>Standard keeps waiter approvals. Direct Admin mode disables waiter app and routes all approvals to owner/manager.</Text>
                    <OrderRoutingSelector />
                    {settings.orderRoutingMode === 'DIRECT_ADMIN_MANAGEMENT' && (
                        <View style={{ marginTop: 12 }}>
                            <ToggleRow
                                label="Enable Chef App After Admin Approval"
                                value={Boolean(settings.directAdminChefAppEnabled)}
                                onChange={(v) => setSettings({ ...settings, directAdminChefAppEnabled: v })}
                            />
                        </View>
                    )}
                </View>

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
                                    value={settings.gstNumber || ''}
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
                    <Text style={styles.helpText}>Managed by platform `.env` (owner edits are disabled).</Text>
                    <View style={styles.subFields}>
                        <View style={styles.inputRow}>
                            <Text style={styles.inputLabel}>Enable Reservations and Discovery Booking</Text>
                            <Text style={styles.readOnlyValue}>{settings.reservationsEnabled ? 'Enabled' : 'Disabled'}</Text>
                        </View>
                        <View style={styles.inputRow}>
                            <Text style={styles.inputLabel}>Platform Fee Amount</Text>
                            <Text style={styles.readOnlyValue}>{settings.currencySymbol || 'Rs.'}{Number(settings.platformFeeAmount || 0).toFixed(2)}</Text>
                        </View>
                        <View style={styles.inputRow}>
                            <Text style={styles.inputLabel}>Advance Deposit Rate (%)</Text>
                            <Text style={styles.readOnlyValue}>{Number(settings.preOrderAdvanceRate || 0)}%</Text>
                        </View>
                        <View style={styles.inputRow}>
                            <Text style={styles.inputLabel}>Approval-to-Payment Window (minutes)</Text>
                            <Text style={styles.readOnlyValue}>{Number(settings.preorderPaymentWindowMinutes || 0)} mins</Text>
                        </View>
                    </View>
                </View>

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
                        <Text style={styles.inputLabel}>Currency Symbol (e.g. Rs.)</Text>
                        <TextInput
                            style={styles.input}
                            value={settings.currencySymbol}
                            onChangeText={(v) => setSettings({ ...settings, currencySymbol: v })}
                        />
                    </View>
                </View>

                <View style={[styles.card, styles.glassCard]}>
                    <Text style={styles.sectionTitle}>Discovery Profile</Text>
                    <Text style={styles.helpText}>
                        Paste your Google Maps share link and upload photos here. We extract coordinates automatically, compress every image, and store them in your database.
                    </Text>

                    <View style={styles.discoveryBlock}>
                        <Text style={styles.discoveryLabel}>City</Text>
                        <TextInput
                            style={styles.discoveryInput}
                            value={discoveryProfile?.city || ''}
                            placeholder="e.g. Nagpur"
                            placeholderTextColor="#64748B"
                            onChangeText={(v) => setDiscoveryProfile({ ...discoveryProfile, city: v })}
                        />
                    </View>

                    <View style={styles.discoveryBlock}>
                        <Text style={styles.discoveryLabel}>Cafe Contact Phone</Text>
                        <TextInput
                            style={styles.discoveryInput}
                            value={discoveryProfile?.contactPhone || ''}
                            placeholder="e.g. +91 9876543210"
                            placeholderTextColor="#64748B"
                            keyboardType="phone-pad"
                            onChangeText={(v) => setDiscoveryProfile({ ...discoveryProfile, contactPhone: v })}
                        />
                    </View>

                    <View style={styles.discoveryBlock}>
                        <Text style={styles.discoveryLabel}>Google Maps Link</Text>
                        <TextInput
                            style={[styles.discoveryInput, styles.discoveryTextarea]}
                            multiline
                            value={discoveryProfile?.googleMapsUrl || ''}
                            placeholder="Paste the Google Maps share link"
                            placeholderTextColor="#64748B"
                            onChangeText={(v) => setDiscoveryProfile({ ...discoveryProfile, googleMapsUrl: v, clearCoordinates: false })}
                        />
                    </View>

                    <View style={styles.actionRowWrap}>
                        {!!discoveryProfile?.googleMapsUrl && (
                            <TouchableOpacity
                                style={styles.secondaryActionBtn}
                                onPress={() => Linking.openURL(discoveryProfile.googleMapsUrl)}
                            >
                                <Text style={styles.secondaryActionBtnText}>Open Maps Link</Text>
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity style={[styles.secondaryActionBtn, styles.dangerActionBtn]} onPress={clearSavedLocation}>
                            <Text style={[styles.secondaryActionBtnText, styles.dangerActionBtnText]}>Clear Saved Location</Text>
                        </TouchableOpacity>
                    </View>

                    <View style={styles.locationCard}>
                        <Text style={styles.locationTitle}>Location Preview</Text>
                        {mapLinkPreview ? (
                            <Text style={styles.locationText}>
                                Detected from link: {mapLinkPreview.latitude.toFixed(6)}, {mapLinkPreview.longitude.toFixed(6)}
                            </Text>
                        ) : discoveryProfile?.latitude !== null && discoveryProfile?.longitude !== null && !discoveryProfile?.clearCoordinates ? (
                            <Text style={styles.locationText}>
                                Saved coordinates: {Number(discoveryProfile.latitude).toFixed(6)}, {Number(discoveryProfile.longitude).toFixed(6)}
                            </Text>
                        ) : discoveryProfile?.googleMapsUrl ? (
                            <Text style={styles.locationMuted}>Short Google Maps links are resolved on save.</Text>
                        ) : (
                            <Text style={styles.locationMuted}>No location saved yet.</Text>
                        )}
                    </View>

                    <ToggleRow
                        label="Feature this cafe in city feed"
                        value={Boolean(discoveryProfile?.isFeatured)}
                        onChange={(v) => setDiscoveryProfile({ ...discoveryProfile, isFeatured: v })}
                    />

                    <View style={styles.inputRow}>
                        <Text style={styles.inputLabel}>Featured Priority (lower first)</Text>
                        <TextInput
                            style={styles.input}
                            keyboardType="number-pad"
                            value={discoveryProfile?.featuredPriority?.toString?.() || '0'}
                            onChangeText={(v) => setDiscoveryProfile({ ...discoveryProfile, featuredPriority: v })}
                        />
                    </View>

                    <View style={styles.divider} />

                    <Text style={styles.sectionSubTitle}>Cover Image</Text>
                    <View style={styles.coverPreviewBox}>
                        {coverPreviewUri ? (
                            <Image source={{ uri: coverPreviewUri }} style={styles.coverPreviewImage} resizeMode="cover" />
                        ) : (
                            <Text style={styles.previewEmptyText}>No cover image uploaded yet.</Text>
                        )}
                    </View>

                    <View style={styles.actionRowWrap}>
                        <TouchableOpacity style={styles.secondaryActionBtn} onPress={pickCoverImage}>
                            <Text style={styles.secondaryActionBtnText}>{coverPreviewUri ? 'Replace Cover' : 'Upload Cover'}</Text>
                        </TouchableOpacity>
                        {!!coverPreviewUri && (
                            <TouchableOpacity style={[styles.secondaryActionBtn, styles.dangerActionBtn]} onPress={removeCoverImage}>
                                <Text style={[styles.secondaryActionBtnText, styles.dangerActionBtnText]}>Remove Cover</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                    <Text style={styles.inlineHelpText}>The cover image is compressed to WebP before saving.</Text>

                    <View style={styles.divider} />

                    <Text style={styles.sectionSubTitle}>Gallery Photos</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.galleryRow}>
                        {galleryPreviews.length === 0 ? (
                            <View style={styles.galleryEmptyCard}>
                                <Text style={styles.previewEmptyText}>No gallery photos uploaded yet.</Text>
                            </View>
                        ) : (
                            galleryPreviews.map((item) => (
                                <View key={item.key} style={styles.galleryThumbWrap}>
                                    <Image source={{ uri: item.url }} style={styles.galleryThumb} resizeMode="cover" />
                                    <TouchableOpacity style={styles.galleryRemoveBtn} onPress={() => removeGalleryPreview(item)}>
                                        <Text style={styles.galleryRemoveBtnText}>x</Text>
                                    </TouchableOpacity>
                                </View>
                            ))
                        )}
                    </ScrollView>

                    <View style={styles.actionRowWrap}>
                        <TouchableOpacity style={styles.secondaryActionBtn} onPress={pickGalleryImages}>
                            <Text style={styles.secondaryActionBtnText}>Add Gallery Photos</Text>
                        </TouchableOpacity>
                    </View>
                    <Text style={styles.inlineHelpText}>Upload multiple photos. Each image is compressed and stored in your database.</Text>
                </View>

                <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
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
        backgroundColor: 'rgba(30, 41, 59, 0.7)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        ...Platform.select({ web: { boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }, default: {} }),
    },
    sectionTitle: { color: 'white', fontSize: 18, fontWeight: '700', marginBottom: 5 },
    sectionSubTitle: { color: '#E2E8F0', fontSize: 16, fontWeight: '700', marginBottom: 12 },
    helpText: { color: '#64748B', fontSize: 13, marginBottom: 20 },
    inlineHelpText: { color: '#64748B', fontSize: 12, marginTop: 10 },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 },
    rowLabel: { color: '#E2E8F0', fontSize: 15, fontWeight: '500', flex: 1, marginRight: 12 },
    divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.05)', marginVertical: 14 },
    subFields: { backgroundColor: 'rgba(15, 23, 42, 0.3)', padding: 15, borderRadius: 12, marginTop: 5 },
    inputRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    inputLabel: { color: '#94A3B8', fontSize: 14, flex: 1, marginRight: 12 },
    input: {
        backgroundColor: 'rgba(30, 41, 59, 0.8)',
        color: 'white',
        paddingHorizontal: 15,
        paddingVertical: 10,
        borderRadius: 10,
        flex: 1,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    readOnlyValue: { color: '#E2E8F0', fontSize: 14, fontWeight: '700', marginLeft: 12 },
    segmentedControl: { flexDirection: 'row', backgroundColor: 'rgba(15, 23, 42, 0.5)', borderRadius: 12, padding: 4, marginTop: 10 },
    segmentBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 10 },
    segmentBtnActive: { backgroundColor: '#38BDF8' },
    segmentText: { color: '#94A3B8', fontSize: 11, fontWeight: '700' },
    segmentTextActive: { color: '#0F172A' },
    discoveryBlock: { marginBottom: 14 },
    discoveryLabel: { color: '#E2E8F0', fontSize: 14, fontWeight: '600', marginBottom: 8 },
    discoveryInput: {
        backgroundColor: 'rgba(15, 23, 42, 0.72)',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: 'rgba(148, 163, 184, 0.18)',
        color: 'white',
        paddingHorizontal: 15,
        paddingVertical: 12,
    },
    discoveryTextarea: {
        minHeight: 86,
        textAlignVertical: 'top',
    },
    actionRowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
    secondaryActionBtn: {
        paddingHorizontal: 14,
        paddingVertical: 11,
        borderRadius: 12,
        backgroundColor: 'rgba(56, 189, 248, 0.14)',
        borderWidth: 1,
        borderColor: 'rgba(56, 189, 248, 0.32)',
    },
    secondaryActionBtnText: { color: '#BAE6FD', fontSize: 13, fontWeight: '700' },
    dangerActionBtn: {
        backgroundColor: 'rgba(239, 68, 68, 0.14)',
        borderColor: 'rgba(239, 68, 68, 0.32)',
    },
    dangerActionBtnText: { color: '#FCA5A5' },
    locationCard: {
        backgroundColor: 'rgba(15, 23, 42, 0.55)',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: 'rgba(148, 163, 184, 0.12)',
        padding: 14,
        marginTop: 14,
        marginBottom: 8,
    },
    locationTitle: { color: '#F8FAFC', fontSize: 13, fontWeight: '700', marginBottom: 6 },
    locationText: { color: '#E2E8F0', fontSize: 13, lineHeight: 20 },
    locationMuted: { color: '#94A3B8', fontSize: 13, lineHeight: 20 },
    coverPreviewBox: {
        backgroundColor: 'rgba(15, 23, 42, 0.72)',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(148, 163, 184, 0.18)',
        minHeight: 180,
        overflow: 'hidden',
        justifyContent: 'center',
        alignItems: 'center',
    },
    coverPreviewImage: {
        width: '100%',
        height: 220,
        backgroundColor: '#1E293B',
    },
    previewEmptyText: { color: '#94A3B8', fontSize: 13, textAlign: 'center', paddingHorizontal: 20 },
    galleryRow: { paddingVertical: 4, gap: 12 },
    galleryEmptyCard: {
        width: 180,
        height: 124,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: 'rgba(148, 163, 184, 0.18)',
        backgroundColor: 'rgba(15, 23, 42, 0.72)',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 14,
    },
    galleryThumbWrap: {
        width: 132,
        height: 124,
        borderRadius: 14,
        overflow: 'hidden',
        backgroundColor: '#1E293B',
        position: 'relative',
    },
    galleryThumb: {
        width: '100%',
        height: '100%',
    },
    galleryRemoveBtn: {
        position: 'absolute',
        top: 8,
        right: 8,
        width: 24,
        height: 24,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(15, 23, 42, 0.85)',
    },
    galleryRemoveBtnText: { color: 'white', fontSize: 13, fontWeight: '800' },
    saveBtn: {
        backgroundColor: '#38BDF8',
        marginHorizontal: 20,
        paddingVertical: 18,
        borderRadius: 16,
        alignItems: 'center',
        marginTop: 10,
    },
    saveBtnText: { color: '#0F172A', fontSize: 16, fontWeight: '800' },
});
