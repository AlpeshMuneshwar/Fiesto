import { Audio } from 'expo-audio';

// Sharp sound URL - ideally a local asset, but using a placeholder for now
const SHARP_SOUND_URI = 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3';

let sound = null;

export const playSharpSound = async () => {
    try {
        if (sound) {
            await sound.stopAsync();
            await sound.unloadAsync();
        }
        const { sound: newSound } = await Audio.Sound.createAsync(
            { uri: SHARP_SOUND_URI },
            { shouldPlay: true, isLooping: false, volume: 1.0 }
        );
        sound = newSound;
    } catch (error) {
        console.error('Error playing sound:', error);
    }
};
