import { useState, useCallback, useRef } from 'react';
import { AxiosResponse } from 'axios';

interface UseApiOptions<T> {
    onSuccess?: (data: T) => void;
    onError?: (error: any) => void;
}

interface UseApiResult<T> {
    loading: boolean;
    error: any;
    data: T | null;
    execute: (...args: any[]) => Promise<T | null>;
    reset: () => void;
}

/**
 * Universal API Wrapper Hook
 * 
 * Standardizes API calls with automatic loading, error, and toast handling.
 * 
 * @param apiFunc A function that returns an Axios promise (e.g. (id) => client.get(`/item/${id}`))
 * @param options Success/Error callbacks
 */
export function useApi<T>(
    apiFunc: (...args: any[]) => Promise<AxiosResponse<T>>,
    options: UseApiOptions<T> = {}
): UseApiResult<T> {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<any>(null);
    const [data, setData] = useState<T | null>(null);
    
    // Use refs to avoid unnecessary re-creations of 'execute'
    const optionsRef = useRef(options);
    optionsRef.current = options;
    const apiFuncRef = useRef(apiFunc);
    apiFuncRef.current = apiFunc;

    const reset = useCallback(() => {
        setLoading(false);
        setError(null);
        setData(null);
    }, []);

    const execute = useCallback(async (...args: any[]): Promise<T | null> => {
        setLoading(true);
        setError(null);

        try {
            const response = await apiFuncRef.current(...args);
            
            setData(response.data);
            if (optionsRef.current.onSuccess) {
                optionsRef.current.onSuccess(response.data);
            }
            return response.data;
        } catch (err: any) {
            setError(err);
            if (optionsRef.current.onError) {
                optionsRef.current.onError(err);
            }
            return null;
        } finally {
            setLoading(false);
        }
    }, []); // Empty dependency array because we use refs

    return { loading, error, data, execute, reset };
}

export default useApi;
