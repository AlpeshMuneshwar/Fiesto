import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Modal, SafeAreaView, Platform, Share, TextInput } from 'react-native';
import client from '../api/client';
import { StatusBar } from 'expo-status-bar';
import QRCode from 'react-native-qrcode-svg';
import ResponsiveContainer from '../components/ResponsiveContainer';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function AdminTableManagementScreen({ navigation }: any) {
    const [tables, setTables] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [qrModalVisible, setQrModalVisible] = useState(false);
    const [selectedTable, setSelectedTable] = useState<any>(null);
    const [newTableNumber, setNewTableNumber] = useState('');
    const [showAddInput, setShowAddInput] = useState(false);
    const qrRef = useRef<any>(null);

    useEffect(() => {
        fetchTables();
    }, []);

    const fetchTables = async () => {
        try {
            const res = await client.get('/session/tables');
            setTables(res.data);
        } catch (e: any) {
            Alert.alert("Error", "Failed to fetch tables");
        } finally {
            setLoading(false);
        }
    };

    const addTable = async () => {
        const num = parseInt(newTableNumber);
        if (!newTableNumber || isNaN(num)) {
            Alert.alert("Error", "Please enter a valid table number");
            return;
        }
        try {
            const res = await client.post('/session/tables', { number: num });
            setTables(prev => [...prev, res.data]);
            setNewTableNumber('');
            setShowAddInput(false);
            Alert.alert("Success", `Table ${num} has been added successfully.`);
        } catch (e: any) {
            const errorDetail = e.response?.data?.details?.[0]?.message || e.response?.data?.error || "Failed to add table";
            Alert.alert("Insertion Failed", errorDetail);
        }
    };

    const deleteTable = (id: string) => {
        Alert.alert("Delete Table", "Are you sure? This will deactivate any active session.", [
            { text: "Cancel", style: "cancel" },
            {
                text: "Delete",
                style: "destructive",
                onPress: async () => {
                    try {
                        await client.delete(`/session/tables/${id}`);
                        setTables(prev => prev.filter(t => t.id !== id));
                    } catch (e: any) {
                        Alert.alert("Error", "Failed to delete table");
                    }
                }
            }
        ]);
    };

    const showQr = (table: any) => {
        setSelectedTable(table);
        setQrModalVisible(true);
    };

    const handleDownloadQR = () => {
        if (Platform.OS === 'web') {
            // Web: open the QR as a printable/downloadable page
            const qrUrl = selectedTable?.qrCodeUrl || '';
            const printWindow = window.open('', '_blank');
            if (printWindow) {
                printWindow.document.write(`
                    <html><head><title>QR Code - Table ${selectedTable?.number}</title>
                    <style>body{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:sans-serif;margin:0;}
                    h1{font-size:28px;margin-bottom:10px;}p{color:#666;margin-bottom:30px;font-size:16px;}</style></head>
                    <body>
                    <h1>Table ${selectedTable?.number}</h1>
                    <p>Scan to order</p>
                    <div id="qr"></div>
                    <script src="https://cdn.jsdelivr.net/npm/qrcode/build/qrcode.min.js"></script>
                    <script>
                    QRCode.toCanvas(document.createElement('canvas'),
                      '${qrUrl}', {width:300,margin:2}, function(err,canvas){
                        if(!err) document.getElementById('qr').appendChild(canvas);
                        setTimeout(function(){window.print();},500);
                    });
                    </script>
                    </body></html>
                `);
                printWindow.document.close();
            }
        } else {
            // Native: use the QRCode ref to get a data URL
            if (qrRef.current) {
                qrRef.current.toDataURL((dataURL: string) => {
                    Share.share({
                        title: `QR Code - Table ${selectedTable?.number}`,
                        message: `QR Code for Table ${selectedTable?.number}`,
                        url: `data:image/png;base64,${dataURL}`,
                    }).catch(() => {});
                });
            }
        }
    };

    if (loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color="#38BDF8" />
            </View>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar style="light" />
            <ScrollView contentContainerStyle={{ padding: 20 }}>
                <ResponsiveContainer maxWidth={800}>
                    <View style={styles.headerRow}>
                        <Text style={styles.title}>Tables</Text>
                        <TouchableOpacity style={styles.addBtn} onPress={() => setShowAddInput(true)}>
                            <Text style={styles.addBtnText}>+ Add Table</Text>
                        </TouchableOpacity>
                    </View>

                    {showAddInput && (
                        <View style={styles.addInputRow}>
                            <View style={styles.addInputField}>
                                <Text style={{ color: '#94A3B8', marginBottom: 5 }}>Table Number</Text>
                                <View style={{ flexDirection: 'row', gap: 10 }}>
                                    <TextInput
                                        style={{ flex: 1, backgroundColor: '#1E293B', borderRadius: 10, paddingHorizontal: 15, color: 'white', fontSize: 16, height: 45 }}
                                        placeholder="e.g. 5"
                                        placeholderTextColor="#64748B"
                                        keyboardType="numeric"
                                        value={newTableNumber}
                                        onChangeText={setNewTableNumber}
                                        autoFocus
                                    />
                                    <TouchableOpacity style={[styles.addBtn, { paddingVertical: 12 }]} onPress={addTable}>
                                        <Text style={styles.addBtnText}>Create</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={{ justifyContent: 'center', paddingHorizontal: 10 }} onPress={() => setShowAddInput(false)}>
                                        <Text style={{ color: '#94A3B8' }}>Cancel</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </View>
                    )}

                    <View style={styles.grid}>
                        {tables.map(table => (
                            <View key={table.id} style={styles.tableCard}>
                                <Text style={styles.tableNumber}>Table {table.number}</Text>
                                <View style={styles.cardActions}>
                                    <TouchableOpacity style={styles.actionBtn} onPress={() => showQr(table)}>
                                        <Text style={styles.actionBtnText}>QR</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={[styles.actionBtn, { borderColor: '#F87171' }]} onPress={() => deleteTable(table.id)}>
                                        <Text style={[styles.actionBtnText, { color: '#F87171' }]}>Del</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        ))}
                    </View>
                </ResponsiveContainer>
            </ScrollView>

            <Modal visible={qrModalVisible} transparent animationType="fade">
                <View style={styles.modalBg}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Table {selectedTable?.number}</Text>
                        <View style={styles.qrWrapper}>
                            <QRCode
                                value={selectedTable?.qrCodeUrl || 'N/A'}
                                size={200}
                                getRef={(ref: any) => (qrRef.current = ref)}
                            />
                        </View>
                        <Text style={styles.qrHint}>Scan this to join Table {selectedTable?.number}</Text>
                        <Text style={styles.qrUrl}>{selectedTable?.qrCodeUrl}</Text>
                        
                        <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
                            <TouchableOpacity style={[styles.downloadBtn]} onPress={handleDownloadQR}>
                                <Text style={styles.downloadBtnText}>📥 {Platform.OS === 'web' ? 'Print QR' : 'Share QR'}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.closeBtn} onPress={() => setQrModalVisible(false)}>
                                <Text style={styles.closeBtnText}>Close</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0F172A' },
    center: { flex: 1, backgroundColor: '#0F172A', justifyContent: 'center', alignItems: 'center' },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 25 },
    title: { color: 'white', fontSize: 28, fontWeight: '800' },
    addBtn: { backgroundColor: '#38BDF8', paddingHorizontal: 15, paddingVertical: 10, borderRadius: 12 },
    addBtnText: { color: '#0F172A', fontWeight: '800' },
    addInputRow: { marginBottom: 20 },
    addInputField: { backgroundColor: '#0F172A', borderWidth: 1, borderColor: '#334155', borderRadius: 16, padding: 15 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
    tableCard: { backgroundColor: '#1E293B', width: '48%', padding: 20, borderRadius: 20, marginBottom: 15, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
    tableNumber: { color: 'white', fontSize: 18, fontWeight: '700', textAlign: 'center', marginBottom: 15 },
    cardActions: { flexDirection: 'row', justifyContent: 'space-between' },
    actionBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#38BDF8', alignItems: 'center', marginHorizontal: 2 },
    actionBtnText: { color: '#38BDF8', fontWeight: '700', fontSize: 12 },
    modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center' },
    modalContent: { backgroundColor: '#0F172A', padding: 30, borderRadius: 32, width: '85%', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
    modalTitle: { color: 'white', fontSize: 24, fontWeight: '800', marginBottom: 20 },
    qrWrapper: { padding: 15, backgroundColor: 'white', borderRadius: 20, marginBottom: 20 },
    qrHint: { color: '#94A3B8', fontSize: 14, textAlign: 'center', marginBottom: 8 },
    qrUrl: { color: '#64748B', fontSize: 11, textAlign: 'center', marginBottom: 25, fontFamily: Platform.OS === 'web' ? 'monospace' : undefined },
    downloadBtn: { flex: 1, backgroundColor: '#38BDF8', paddingVertical: 15, borderRadius: 15, alignItems: 'center' },
    downloadBtnText: { color: '#0F172A', fontWeight: '800' },
    closeBtn: { flex: 1, backgroundColor: '#1E293B', paddingVertical: 15, borderRadius: 15, alignItems: 'center' },
    closeBtnText: { color: 'white', fontWeight: '700' }
});

