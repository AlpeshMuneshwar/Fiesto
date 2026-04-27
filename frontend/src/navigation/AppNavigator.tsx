import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ScanTableScreen from '../screens/ScanTableScreen';
import LoginScreen from '../screens/LoginScreen';
import CustomerMenuScreen from '../screens/CustomerMenuScreen';
import WaiterDashboardScreen from '../screens/WaiterDashboardScreen';
import ChefDashboardScreen from '../screens/ChefDashboardScreen';
import AdminDashboardScreen from '../screens/AdminDashboardScreen';
import SuperAdminDashboardScreen from '../screens/SuperAdminDashboardScreen';
import LandingScreen from '../screens/LandingScreen';
import DiscoveryPortalWebScreen from '../screens/DiscoveryPortalWebScreen';
import TableSelectionScreen from '../screens/TableSelectionScreen';
import CafeRegistrationScreen from '../screens/CafeRegistrationScreen';
import AdminTableManagementScreen from '../screens/AdminTableManagementScreen';
import AdminMenuManagementScreen from '../screens/AdminMenuManagementScreen';
import AdminStaffManagementScreen from '../screens/AdminStaffManagementScreen';
import AdminSettingsScreen from '../screens/AdminSettingsScreen';
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen';
import ResetPasswordScreen from '../screens/ResetPasswordScreen';
import AdminReportsWebScreen from '../screens/AdminReportsWebScreen';
import ReservationSuccessScreen from '../screens/ReservationSuccessScreen';
import CustomerProfileWebScreen from '../screens/CustomerProfileWebScreen';
import RegisterScreen from '../screens/RegisterScreen';
import CafeDetailsScreen from '../screens/CafeDetailsScreen';

const Stack = createNativeStackNavigator();

export const linking = {
    prefixes: ['http://localhost:8081', 'https://cafe-qr.local'],
    config: {
        screens: {
            Landing: '',
            DiscoveryPortal: 'discover',
            TableSelection: 'discover/:cafeId',
            CafeRegistration: 'register',
            Login: 'login',
            ForgotPassword: 'forgot-password',
            ResetPassword: 'reset-password/:token',
            ScanTable: 'scan',
            CustomerMenu: 'cafe/:cafeId/table/:tableNumber',
            WaiterDashboard: 'waiter',
            ChefDashboard: 'chef',
            AdminDashboard: 'admin',
            AdminTableManagement: 'admin/tables',
            AdminMenuManagement: 'admin/menu',
            AdminStaffManagement: 'admin/staff',
            AdminSettings: 'admin/settings',
            AdminReports: 'admin/reports',
            SuperAdminDashboard: 'super-admin',
            ReservationSuccess: 'booking-success',
            CustomerProfile: 'profile',
            Register: 'register-user',
            CafeDetails: 'discover/cafe/:cafeId',
        },
    },
};

export default function AppNavigator() {
    return (
        <Stack.Navigator
            initialRouteName="ScanTable"
            screenOptions={{
                headerStyle: { backgroundColor: '#1E1E1E' },
                headerTintColor: '#fff',
                headerTitleStyle: { fontWeight: 'bold' },
                contentStyle: { backgroundColor: '#f2f2f7' }
            }}
        >
            <Stack.Screen name="Landing" component={LandingScreen} options={{ headerShown: false }} />
            <Stack.Screen name="DiscoveryPortal" component={DiscoveryPortalWebScreen as any} options={{ headerShown: false }} />
            <Stack.Screen name="TableSelection" component={TableSelectionScreen as any} options={{ title: 'Reserve a Table' }} />
            <Stack.Screen name="CafeRegistration" component={CafeRegistrationScreen} options={{ title: 'Cafe Onboarding' }} />
            <Stack.Screen name="Login" component={LoginScreen} options={{ title: 'Login' }} />
            <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} options={{ title: 'Reset Password' }} />
            <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} options={{ title: 'Set New Password' }} />
            <Stack.Screen name="ScanTable" component={ScanTableScreen} options={{ title: 'Welcome' }} />
            <Stack.Screen name="CustomerMenu" component={CustomerMenuScreen} options={{ headerShown: false }} />
            <Stack.Screen name="WaiterDashboard" component={WaiterDashboardScreen} options={{ title: 'Waiter Dashboard' }} />
            <Stack.Screen name="ChefDashboard" component={ChefDashboardScreen} options={{ title: 'Kitchen Display' }} />
            <Stack.Screen name="AdminDashboard" component={AdminDashboardScreen} options={{ title: 'Admin Hub', headerLeft: () => null }} />
            <Stack.Screen name="AdminTableManagement" component={AdminTableManagementScreen} options={{ title: 'Table Management' }} />
            <Stack.Screen name="AdminMenuManagement" component={AdminMenuManagementScreen} options={{ title: 'Menu Management' }} />
            <Stack.Screen name="AdminStaffManagement" component={AdminStaffManagementScreen} options={{ title: 'Staff Recruitment' }} />
            <Stack.Screen name="AdminSettings" component={AdminSettingsScreen} options={{ title: 'Cafe Settings' }} />
            <Stack.Screen name="AdminReports" component={AdminReportsWebScreen} options={{ headerShown: false }} />
            <Stack.Screen name="SuperAdminDashboard" component={SuperAdminDashboardScreen} options={{ title: 'Platform Control' }} />
            <Stack.Screen name="ReservationSuccess" component={ReservationSuccessScreen as any} options={{ headerShown: false }} />
            <Stack.Screen name="CustomerProfile" component={CustomerProfileWebScreen as any} options={{ headerShown: false }} />
            <Stack.Screen name="Register" component={RegisterScreen as any} options={{ headerShown: false }} />
            <Stack.Screen name="CafeDetails" component={CafeDetailsScreen as any} options={{ headerShown: false }} />
        </Stack.Navigator>
    );
}
