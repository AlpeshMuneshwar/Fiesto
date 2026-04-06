import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { SocketProvider } from './src/context/SocketContext';
import { ToastProvider } from './src/components/ToastProvider';
import LoginScreen from './src/screens/LoginScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import TableManagementScreen from './src/screens/TableManagementScreen';
import OrderAuditScreen from './src/screens/OrderAuditScreen';

const Stack = createNativeStackNavigator();

const Navigation = () => {
    const { user, loading } = useAuth();

    if (loading) return null; // Or a splash screen

    return (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
            {!user ? (
                <Stack.Screen name="Login" component={LoginScreen} />
            ) : (
                <Stack.Group>
                    <Stack.Screen name="Dashboard">
                        {props => (
                            <SocketProvider>
                                <DashboardScreen {...props} />
                            </SocketProvider>
                        )}
                    </Stack.Screen>
                    <Stack.Screen name="TableManagement" component={TableManagementScreen} />
                    <Stack.Screen name="OrderAudit" component={OrderAuditScreen} />
                </Stack.Group>
            )}
        </Stack.Navigator>
    );
};

export default function App() {
    return (
        <NavigationContainer>
            <ToastProvider>
                <AuthProvider>
                    <Navigation />
                </AuthProvider>
            </ToastProvider>
        </NavigationContainer>
    );
}
