import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Button, TextInput, Alert, TouchableOpacity } from 'react-native';
import { Camera, CameraView } from 'expo-camera';
import client from '../api/client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';

export default function ScanTableScreen({ navigation }: any) {
    const [hasPermission, setHasPermission] = useState<boolean | null>(null);
    const [scanned, setScanned] = useState(false);
    const [tableNumber, setTableNumber] = useState('');

    useEffect(() => {
        const checkExistingSession = async () => {
            try {
                // 1. Try local storage first (fastest)
                const existingSessionId = await AsyncStorage.getItem('active_session_id');

                // 2. Try backend if token exists (reliable)
                const token = await AsyncStorage.getItem('userToken');
                if (token) {
                    try {
                        const res = await client.get('/session/active-customer');
                        if (res.data && res.data.isActive) {
                            navigation.replace('CustomerMenu', {
                                sessionId: res.data.id,
                                cafeId: res.data.cafeId,
                                tableNumber: res.data.table.number,
                                isLocationVerified: true // assume verified if it's a resume
                            });
                            return;
                        }
                    } catch (e) {
                        console.log("Backend session check failed", e);
                    }
                }

                if (existingSessionId) {
                    navigation.replace('CustomerMenu', {
                        sessionId: existingSessionId,
                        isLocationVerified: true
                    });
                }
            } catch (e) {
                console.log("No existing session found");
            }
        };

        const getPermissions = async () => {
            const { status } = await Camera.requestCameraPermissionsAsync();
            setHasPermission(status === 'granted');
        };

        checkExistingSession();
        getPermissions();
    }, []);

    const navigateToMenu = async (cafeId: string, tableNum: string, qrToken?: string) => {
        let isLocVerified = false;
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status === 'granted') {
                await Location.getCurrentPositionAsync({});
                isLocVerified = true;
            }
        } catch (e) {
            console.log("Location verification failed", e);
        }
        await AsyncStorage.setItem('isLocationVerified', JSON.stringify(isLocVerified));
        navigation.replace('CustomerMenu', { 
            cafeId, 
            tableNumber: tableNum, 
            qrToken, 
            isLocationVerified: isLocVerified 
        });
    };

    const handleBarCodeScanned = ({ data }: { data: string }) => {
        setScanned(true);

        try {
            // Use modern URL parsing for industry-level robustness
            const url = new URL(data);
            const pathParts = url.pathname.split('/');
            
            const cafeIdx = pathParts.indexOf('cafe');
            const tableIdx = pathParts.indexOf('table');

            // Strictly validate path structure: /cafe/[slug]/table/[number]
            if (cafeIdx !== -1 && tableIdx !== -1 && pathParts.length > tableIdx + 1) {
                const cafeSlug = pathParts[cafeIdx + 1];
                const tableNum = pathParts[tableIdx + 1];
                const qrToken = url.searchParams.get('token');

                if (!qrToken) {
                    Alert.alert(
                        "Insecure QR Code", 
                        "This table QR code is outdated and lacks the required security token. Please ask the cafe staff for a new QR code."
                    );
                    setScanned(false);
                    return;
                }

                navigateToMenu(cafeSlug, tableNum, qrToken);
            } else {
                Alert.alert("Invalid QR", "This QR code doesn't belong to a recognized table.");
                setScanned(false);
            }
        } catch (e: any) {
            Alert.alert("Invalid QR Format", "Please scan a valid Cafe QR code.");
            setScanned(false);
        }
    };

    if (hasPermission === null) return <Text style={{ padding: 20 }}>Requesting camera permission...</Text>;
    if (hasPermission === false) return <Text style={{ padding: 20 }}>No access to camera</Text>;

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Scan Table QR Code</Text>
            <Text style={styles.subtitle}>Secure table access requires scanning.</Text>

            <View style={styles.cameraContainer}>
                <CameraView
                    onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
                    style={StyleSheet.absoluteFillObject}
                />
            </View>

            {scanned && <Button title="Tap to Scan Again" onPress={() => setScanned(false)} />}

            <TouchableOpacity onPress={() => navigation.navigate('Login')} style={{ marginTop: 40, padding: 10 }}>
                <Text style={{ color: '#007AFF', fontSize: 16, fontWeight: '600' }}>Staff Login</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FAFAFA' },
    title: { fontSize: 22, fontWeight: '800', marginBottom: 5, color: '#2C3E50' },
    subtitle: { fontSize: 14, color: '#7F8C8D', marginBottom: 25 },
    cameraContainer: { width: 300, height: 300, overflow: 'hidden', borderRadius: 20, marginBottom: 20, borderWidth: 4, borderColor: '#fff', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, elevation: 5 }
});
