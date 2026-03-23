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

    const navigateToMenu = async (cafeId: string, tableNum: string) => {
        let isLocVerified = false;
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status === 'granted') {
                // Ensure the device can actually return a GPS coordinate
                await Location.getCurrentPositionAsync({});
                isLocVerified = true;
            }
        } catch (e) {
            console.log("Location verification failed", e);
        }
        await AsyncStorage.setItem('isLocationVerified', JSON.stringify(isLocVerified));
        navigation.replace('CustomerMenu', { cafeId, tableNumber: tableNum, isLocationVerified: isLocVerified });
    };

    const handleBarCodeScanned = ({ data }: any) => {
        setScanned(true);

        const newMatch = data.match(/cafe\/([^\/]+)\/table\/(\d+)/);
        const oldMatch = data.match(/table=(\d+)/);

        if (newMatch) {
            navigateToMenu(newMatch[1], newMatch[2]);
        } else if (oldMatch) {
            navigateToMenu('main-cafe', oldMatch[1]);
        } else {
            Alert.alert("Invalid QR", "This doesn't seem to be a valid cafe QR code.");
            setScanned(false);
        }
    };

    const joinSessionManual = () => {
        if (!tableNumber) return;
        navigateToMenu('main-cafe', tableNumber);
    };

    if (hasPermission === null) return <Text style={{ padding: 20 }}>Requesting camera permission...</Text>;
    if (hasPermission === false) return <Text style={{ padding: 20 }}>No access to camera</Text>;

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Scan Table QR Code</Text>

            <View style={styles.cameraContainer}>
                <CameraView
                    onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
                    style={StyleSheet.absoluteFillObject}
                />
            </View>

            {scanned && <Button title="Tap to Scan Again" onPress={() => setScanned(false)} />}

            <Text style={{ marginTop: 20 }}>Or enter manually:</Text>
            <TextInput
                style={styles.input}
                placeholder="Table Number"
                keyboardType="number-pad"
                value={tableNumber}
                onChangeText={setTableNumber}
            />
            <TouchableOpacity
                style={styles.button}
                onPress={joinSessionManual}
            >
                <Text style={{ color: 'white', fontWeight: 'bold' }}>Join Table</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => navigation.navigate('Login')} style={{ marginTop: 40, padding: 10 }}>
                <Text style={{ color: '#007AFF', fontSize: 16, fontWeight: '600' }}>Staff Login</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FAFAFA' },
    title: { fontSize: 22, fontWeight: '800', marginBottom: 20, color: '#2C3E50' },
    cameraContainer: { width: 300, height: 300, overflow: 'hidden', borderRadius: 20, marginBottom: 20, borderWidth: 4, borderColor: '#fff', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, elevation: 5 },
    input: { borderWidth: 1, borderColor: '#ccc', padding: 12, marginTop: 10, width: '100%', borderRadius: 8, backgroundColor: 'white' },
    button: { backgroundColor: '#28A745', padding: 15, borderRadius: 8, marginTop: 15, width: '100%', alignItems: 'center' }
});
