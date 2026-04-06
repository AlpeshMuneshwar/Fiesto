import { useCallback, useEffect, useState } from 'react';

export default function useCooldownTimer(initialSeconds = 0) {
    const [secondsLeft, setSecondsLeft] = useState(Math.max(0, Math.ceil(initialSeconds)));

    useEffect(() => {
        if (secondsLeft <= 0) {
            return;
        }

        const timer = setInterval(() => {
            setSecondsLeft((current) => (current <= 1 ? 0 : current - 1));
        }, 1000);

        return () => clearInterval(timer);
    }, [secondsLeft]);

    const startCooldown = useCallback((seconds = 60) => {
        setSecondsLeft(Math.max(0, Math.ceil(seconds)));
    }, []);

    return {
        secondsLeft,
        isCoolingDown: secondsLeft > 0,
        startCooldown,
    };
}
