import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import io from 'socket.io-client';
import { SOCKET_URL } from '../api/client';
import { useAuth } from './AuthContext';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SocketContext = createContext();

export const SocketProvider = ({ children }) => {
    const { user } = useAuth();
    const [socket, setSocket] = useState(null);
    const [isConnected, setIsConnected] = useState(false);
    const socketRef = useRef(null);

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
                    newSocket.emit('join_room', { room: `CHEF_${user.cafeId}`, role: 'CHEF' });
                });

                newSocket.on('disconnect', () => {
                    setIsConnected(false);
                });

                newSocket.on('connect_error', () => {
                    setIsConnected(false);
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

    const callWaiterForPickup = useCallback((tableInfo) => {
        if (socketRef.current && user) {
            socketRef.current.emit('chef_call_waiter', {
                cafeId: user.cafeId,
                tableId: tableInfo.tableId,
                sessionId: tableInfo.sessionId,
                tableNumber: tableInfo.tableNumber
            });
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }
    }, [user]);

    // New function to call waiter via API (for marking order as AWAITING_PICKUP)
    const callWaiterViaAPI = useCallback(async (orderId) => {
        try {
            const token = await AsyncStorage.getItem('userToken');
            const response = await fetch(`${SOCKET_URL}/order/${orderId}/call-waiter`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error('Failed to call waiter');
            }
            
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Success);
            return await response.json();
        } catch (error) {
            console.error('Error calling waiter:', error);
            throw error;
        }
    }, []);

    const manualReconnect = useCallback(() => {
        if (socketRef.current) {
            socketRef.current.disconnect();
            socketRef.current.connect();
        }
    }, []);

    return (
        <SocketContext.Provider value={{ socket, isConnected, callWaiterForPickup, callWaiterViaAPI, manualReconnect }}>
            {children}
        </SocketContext.Provider>
    );
};

export const useSocket = () => useContext(SocketContext);
