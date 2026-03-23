import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import io from 'socket.io-client';
import { SOCKET_URL } from '../api/client';
import { useAuth } from './AuthContext';
import { playSharpSound } from '../services/SoundService';
import * as Haptics from 'expo-haptics';
import client from '../api/client';

const SocketContext = createContext();

export const SocketProvider = ({ children }) => {
    const { user } = useAuth();
    const [socket, setSocket] = useState(null);
    const [calls, setCalls] = useState([]); // List of pending calls [{id, tableNumber, timestamp, status, ...}]

    const fetchActiveCalls = useCallback(async () => {
        try {
            const res = await client.get('/staff-call/active');
            setCalls(res.data);
        } catch (e) {
            console.error('Failed to fetch active calls', e);
        }
    }, []);

    useEffect(() => {
        if (user) {
            fetchActiveCalls();
        }
    }, [user, fetchActiveCalls]);

    useEffect(() => {
        const initSocket = async () => {
            if (user && user.cafeId) {
                const token = await AsyncStorage.getItem('userToken');
                const newSocket = io(SOCKET_URL, {
                    auth: { role: user.role, token }
                });

                newSocket.emit('join_room', { room: `WAITER_${user.cafeId}`, role: 'WAITER' });

            newSocket.on('call_waiter', (data) => {
                // data: { callId, tableNumber, message, type, timestamp }
                setCalls((prev) => {
                    // Avoid duplicates
                    if (prev.find(c => c.callId === data.callId)) return prev;
                    return [...prev, { ...data, status: 'PENDING' }];
                });
                playSharpSound();
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            });

            newSocket.on('call_status_update', (data) => {
                // data: { callId, status, waiterName }
                setCalls((prev) => prev.filter(c => c.callId !== data.callId));
            });

                setSocket(newSocket);
                return () => newSocket.disconnect();
            }
        };
        initSocket();
    }, [user]);

    const acknowledgeCall = useCallback((callId) => {
        if (socket && user) {
            socket.emit('waiter_acknowledged', {
                callId,
                waiterId: user.id,
                waiterName: user.name
            });
            // Optimistic update
            setCalls((prev) => prev.filter(c => c.callId !== callId));
        }
    }, [socket, user]);

    return (
        <SocketContext.Provider value={{ socket, calls, acknowledgeCall }}>
            {children}
        </SocketContext.Provider>
    );
};

export const useSocket = () => useContext(SocketContext);
