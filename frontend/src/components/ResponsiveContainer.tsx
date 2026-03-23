import React from 'react';
import { View, StyleSheet, useWindowDimensions, ViewStyle } from 'react-native';

interface ResponsiveContainerProps {
    children: React.ReactNode;
    maxWidth?: number;
    style?: ViewStyle;
}

export default function ResponsiveContainer({ children, maxWidth = 1200, style }: ResponsiveContainerProps) {
    const { width } = useWindowDimensions();

    // Calculate horizontal padding to center the content on wide screens
    const horizontalPadding = width > maxWidth ? (width - maxWidth) / 2 : 0;

    return (
        <View style={[
            styles.container,
            { paddingHorizontal: horizontalPadding },
            style
        ]}>
            {children}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        width: '100%',
    },
});
