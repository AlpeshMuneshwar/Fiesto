import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { NormalizedApiError } from '../utils/api-error';

export default function ApiErrorBanner({ error }: { error?: NormalizedApiError | null }) {
    if (!error) return null;

    return (
        <View style={styles.container}>
            <Text style={styles.title}>{error.title}</Text>
            <Text style={styles.message}>{error.message}</Text>
            {error.requestId ? <Text style={styles.meta}>Request ID: {error.requestId}</Text> : null}
            {error.details?.map((detail, index) => (
                <Text key={`${detail}-${index}`} style={styles.detail}>- {detail}</Text>
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        backgroundColor: '#FFF1F2',
        borderWidth: 1,
        borderColor: '#FECACA',
        padding: 14,
        borderRadius: 12,
        marginBottom: 12,
    },
    title: {
        color: '#B91C1C',
        fontSize: 14,
        fontWeight: '800',
        marginBottom: 4,
    },
    message: {
        color: '#7F1D1D',
        fontSize: 13,
        lineHeight: 19,
        fontWeight: '600',
    },
    meta: {
        color: '#991B1B',
        fontSize: 12,
        marginTop: 8,
        fontWeight: '700',
    },
    detail: {
        color: '#7F1D1D',
        fontSize: 12,
        marginTop: 6,
        lineHeight: 18,
    },
});
