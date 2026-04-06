import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import io from 'socket.io-client';
import { SOCKET_URL } from '../api/client';
import { useAuth } from './AuthContext';
import { playSharpSound } from '../services/SoundService';
import * as Haptics from 'expo-haptics';
import client from '../api/client';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SocketContext = createContext();

export const SocketProvider = ({ children }) => {
    const { user } = useAuth();
    const [socket, setSocket] = useState(null);
    const [calls, setCalls] = useState([]);
    const [pendingOrders, setPendingOrders] = useState([]);
    const [historyLogs, setHistoryLogs] = useState([]);
    const [isConnected, setIsConnected] = useState(false);
    const socketRef = useRef(null);

    // --- Data Fetchers ---
    const fetchActiveCalls = useCallback(async () => {
        try {
            const res = await client.get('/staff-call/active');
            setCalls(res.data);
        } catch (e) {
            console.error('Failed to fetch active calls', e);
        }
    }, []);

    const fetchPendingOrders = useCallback(async () => {
        try {
            const res = await client.get('/order/pending-approval');
            setPendingOrders(res.data);
        } catch (e) {
            console.error('Failed to fetch pending orders', e);
        }
    }, []);

    const fetchHistory = useCallback(async () => {
        try {
            const res = await client.get('/staff-call/history');
            setHistoryLogs(res.data);
        } catch (e) {
            console.error('Failed to fetch history', e);
        }
    }, []);

    // --- Initial data load ---
    useEffect(() => {
        if (user) {
            fetchActiveCalls();
            fetchPendingOrders();
            fetchHistory();
        }
    }, [user, fetchActiveCalls, fetchPendingOrders, fetchHistory]);

    // --- Socket Setup with Auto-Reconnect ---
    useEffect(() => {
        const initSocket = async () => {
            if (user && user.cafeId) {
                const token = await AsyncStorage.getItem('userToken');
                const newSocket = io(SOCKET_URL, {
                    auth: { role: user.role, token },
                    reconnection: true,
                    reconnectionAttempts: Infinity,
                    reconnectionDelay: 1000,
                    reconnectionDelayMax: 10000,
                    timeout: 20000,
                });

                newSocket.on('connect', () => {
                    setIsConnected(true);
                    newSocket.emit('join_room', { room: `WAITER_${user.cafeId}`, role: 'WAITER' });
                    // Re-sync data after reconnect to catch anything missed
                    fetchActiveCalls();
                    fetchPendingOrders();
                    fetchHistory();
                });

                newSocket.on('disconnect', () => {
                    setIsConnected(false);
                });

                newSocket.on('connect_error', () => {
                    setIsConnected(false);
                });

                // --- Call Waiter Events ---
                newSocket.on('call_waiter', (data) => {
                    setCalls((prev) => {
                        if (prev.find(c => c.callId === data.callId)) return prev;
                        return [...prev, { ...data, status: 'PENDING' }];
                    });
                    playSharpSound();
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                });

                newSocket.on('call_status_update', (data) => {
                    setCalls((prev) => prev.filter(c => c.callId !== data.callId));
                });

                // --- Order Approval Events ---
                newSocket.on('new_order', (order) => {
                    if (order.status === 'PENDING_APPROVAL') {
                        setPendingOrders((prev) => {
                            if (prev.find(o => o.id === order.id)) return prev;
                            return [...prev, order];
                        });
                        playSharpSound();
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                    }
                });

                newSocket.on('order_status_update', (data) => {
                    // If approved or rejected, remove from pending list
                    if (data.status !== 'PENDING_APPROVAL') {
                        setPendingOrders((prev) => prev.filter(o => o.id !== data.orderId));
                    }
                });

                socketRef.current = newSocket;
                setSocket(newSocket);

                return () => {
                    newSocket.disconnect();
                    socketRef.current = null;
                };
            }
        };

        const cleanup = initSocket();
        return () => {
            if (cleanup && typeof cleanup.then === 'function') {
                cleanup.then(fn => fn && fn());
            }
        };
    }, [user]);

    // --- Actions ---
    const acknowledgeCall = useCallback((callId) => {
        if (socketRef.current && user) {
            socketRef.current.emit('waiter_acknowledged', {
                callId,
                waiterId: user.id,
                waiterName: user.name
            });
            setCalls((prev) => prev.filter(c => c.callId !== callId));
            // Let the backend process, then fetch history
            setTimeout(fetchHistory, 500); 
        }
    }, [user, fetchHistory]);

    const approveOrder = useCallback(async (orderId) => {
        try {
            await client.post(`/order/${orderId}/approve`, { approve: true });
            setPendingOrders((prev) => prev.filter(o => o.id !== orderId));
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            fetchHistory();
        } catch (e) {
            console.error('Failed to approve order', e);
            throw e;
        }
    }, [fetchHistory]);

    const rejectOrder = useCallback(async (orderId) => {
        try {
            await client.post(`/order/${orderId}/approve`, { approve: false });
            setPendingOrders((prev) => prev.filter(o => o.id !== orderId));
            fetchHistory();
        } catch (e) {
            console.error('Failed to reject order', e);
            throw e;
        }
    }, [fetchHistory]);

    const manualReconnect = useCallback(() => {
        if (socketRef.current) {
            socketRef.current.disconnect();
            socketRef.current.connect();
        }
    }, []);

    const refreshAll = useCallback(() => {
        fetchActiveCalls();
        fetchPendingOrders();
    }, [fetchActiveCalls, fetchPendingOrders]);

    return (
        <SocketContext.Provider value={{
            calls,
            pendingOrders,
            socket,
            isConnected,
            historyLogs,
            fetchHistory,
            acknowledgeCall,
            approveOrder,
            rejectOrder,
            manualReconnect,
            reFetch: () => {
                fetchActiveCalls();
                fetchPendingOrders();
                fetchHistory();
            }
        }}>
            {children}
        </SocketContext.Provider>
    );
};

export const useSocket = () => useContext(SocketContext);
