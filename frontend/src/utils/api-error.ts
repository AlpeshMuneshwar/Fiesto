export interface NormalizedApiError {
    status: number | 'NETWORK_ERROR';
    code?: string;
    title: string;
    message: string;
    details?: string[];
    requestId?: string;
}

export function normalizeApiError(error: any): NormalizedApiError {
    if (!error?.response) {
        if (error?.message?.includes('Network Error')) {
            return {
                status: 'NETWORK_ERROR',
                code: 'NETWORK_ERROR',
                title: 'Connection Failed',
                message: 'Unable to reach the server. Check your internet connection and try again.',
            };
        }

        if (error?.code === 'ECONNABORTED' || error?.message?.includes('timeout')) {
            return {
                status: 'NETWORK_ERROR',
                code: 'REQUEST_TIMEOUT',
                title: 'Request Timeout',
                message: 'The server took too long to respond. Please try again.',
            };
        }

        return {
            status: 'NETWORK_ERROR',
            code: error?.code || 'UNKNOWN_CLIENT_ERROR',
            title: 'Unexpected Error',
            message: error?.message || 'Something went wrong unexpectedly.',
        };
    }

    const status = error.response.status;
    const data = error.response.data || {};
    const requestId = data.requestId;
    const details = Array.isArray(data.details)
        ? data.details.map((detail: any) =>
            typeof detail === 'string' ? detail : `${detail.field ? `${detail.field}: ` : ''}${detail.message || detail.msg || 'Invalid value'}`
        )
        : undefined;

    const message = data.error || data.message || 'Something went wrong.';
    const code = data.code;

    if (status === 400) return { status, code, title: 'Bad Request', message, details, requestId };
    if (status === 401) return { status, code, title: 'Session Expired', message, requestId };
    if (status === 403) return { status, code, title: 'Permission Denied', message, requestId };
    if (status === 404) return { status, code, title: 'Not Found', message, requestId };
    if (status === 409) return { status, code, title: 'Conflict', message, requestId };
    if (status === 422) return { status, code, title: 'Validation Error', message, details, requestId };
    if (status === 429) return { status, code, title: 'Too Many Requests', message, requestId };
    if (status >= 500) return { status, code, title: 'Server Error', message, details, requestId };

    return { status, code, title: `Error ${status}`, message, details, requestId };
}
