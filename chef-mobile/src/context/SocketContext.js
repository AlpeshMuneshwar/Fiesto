import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import io from 'socket.io-client';
import { SOCKET_URL } from '../api/client';
import { useAuth } from './AuthContext';
import * as Haptics from 'expo-haptics';

const SocketContext = createContext();

export const SocketProvider = ({ children }) => {
    const { user } = useAuth();
    const [socket, setSocket] = useState(null);

    useEffect(() => {
        const initSocket = async () => {
            if (user && user.cafeId) {
                const token = await AsyncStorage.getItem('userToken');
                const newSocket = io(SOCKET_URL, {
                    auth: { role: user.role, token }
                });
                newSocket.emit('join_room', { room: `CHEF_${user.cafeId}`, role: 'CHEF' });
                
                setSocket(newSocket);
                return () => newSocket.disconnect();
            }
        };
        initSocket();
    }, [user]);

    const callWaiterForPickup = useCallback((tableInfo) => {
        if (socket && user) {
            socket.emit('chef_call_waiter', {
                cafeId: user.cafeId,
                tableId: tableInfo.tableId,
                sessionId: tableInfo.sessionId,
                tableNumber: tableInfo.tableNumber
            });
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }
    }, [socket, user]);

    return (
        <SocketContext.Provider value={{ socket, callWaiterForPickup }}>
            {children}
        </SocketContext.Provider>
    );
};

export const useSocket = () => useContext(SocketContext);
