import * as React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator, { linking } from './src/navigation/AppNavigator';
import { StatusBar } from 'expo-status-bar';
import { ToastProvider } from './src/components/ToastProvider';

export default function App() {
  return (
    <SafeAreaProvider>
      <ToastProvider>
        <NavigationContainer linking={linking}>
          <AppNavigator />
        </NavigationContainer>
        <StatusBar style="auto" />
      </ToastProvider>
    </SafeAreaProvider>
  );
}
