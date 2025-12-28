/**
 * shared-audio.js
 * Common audio and settings logic used by index.html and settings.html
 */

const BASE64_CHIME = 'data:audio/midi;base64,TVRoZAAAAAYAAAABAeBNVHJrAAAA5wD/WAQEAhgIAP9RAwehIADAAADAAGWQXH8AwABlgFx/AMAAZZBZfwDAAGWAWX8AwABlkFZ/AMAAZYBWfwDAAGWQQ38AkEF/AJBCfwCQQH8AkD9/AMlPAJlPfwDAAACQU38AwABlgEN/AMAAZYBCfwDAAGWAP38AwABlgFN/AMAAZZBDfwDJTwCZT38AwAAAkFB/AMAAZYBBfwDAAGWJT38AwABliQB/AMAAZcAAZYBAfwDAAGWAUH8AwABlkE1/AMAAZYBDfwDAAGXAAGWATX8AwABlwABlwABlwABlwABlkDh/AP8vAA==';

let sharedAudioCtx = null;
let sharedMidiStopTimer = null;

/**
 * Get current alarm settings from localStorage with defaults
 */
function getAlarmSettings() {
    return {
        path: localStorage.getItem('alarmExample_path') || 'midi/aka09.mid',
        mode: localStorage.getItem('alarmExample_mode') || 'time',
        seconds: parseInt(localStorage.getItem('alarmExample_seconds') || '10', 10),
        volume: parseInt(localStorage.getItem('alarmExample_volume') || '50', 10)
    };
}

/**
 * Stop any ongoing MIDI or Audio playback
 */
function stopMidiOrAudio() {
    if (sharedMidiStopTimer) {
        clearTimeout(sharedMidiStopTimer);
        sharedMidiStopTimer = null;
    }
    try {
        if (typeof MIDIjs !== 'undefined') {
            MIDIjs.stop();
        }
    } catch (e) {
        console.warn('MIDIjs.stop failed', e);
    }
    if (sharedAudioCtx) {
        if (sharedAudioCtx._beepInterval) {
            clearInterval(sharedAudioCtx._beepInterval);
        }
        try {
            sharedAudioCtx.close();
        } catch (e) { }
        sharedAudioCtx = null;
    }
}

/**
 * Play a simple electronic beep sound using Web Audio API
 * @param {number} volume0to1 Volume from 0 to 1
 */
function playElectronicSound(volume0to1) {
    stopMidiOrAudio();
    sharedAudioCtx = new (window.AudioContext || window.webkitAudioContext)();

    // Scale baseline gain (0.2) by the user volume
    const gainValue = 0.2 * volume0to1;

    const machineGunBeep = (time) => {
        if (!sharedAudioCtx) return;
        const osc = sharedAudioCtx.createOscillator();
        const gain = sharedAudioCtx.createGain();
        osc.connect(gain);
        gain.connect(sharedAudioCtx.destination);

        osc.type = 'square';
        osc.frequency.setValueAtTime(880, time);

        gain.gain.setValueAtTime(gainValue, time);
        gain.gain.exponentialRampToValueAtTime(0.00001, time + 0.1);

        osc.start(time);
        osc.stop(time + 0.1);
    };

    const beep = () => {
        if (!sharedAudioCtx) return;
        const now = sharedAudioCtx.currentTime;
        machineGunBeep(now);
        machineGunBeep(now + 0.2);
        machineGunBeep(now + 0.4);
    };

    beep();
    // Repeat every 2 seconds until stopped
    sharedAudioCtx._beepInterval = setInterval(beep, 2000);
}

/**
 * Unified dispatcher to play alarm sound based on type
 * @param {Object} settings Result from getAlarmSettings()
 */
function playAlarmSound(settings) {
    stopMidiOrAudio();

    if (typeof MIDIjs !== 'undefined') {
        try {
            MIDIjs.set_volume(settings.volume);
        } catch (e) {
            console.warn('MIDIjs.set_volume failed', e);
        }
    }

    if (settings.path === 'oscillator') {
        playElectronicSound(settings.volume / 100);
    } else {
        const src = (settings.path === 'base64_chime') ? BASE64_CHIME : settings.path;
        if (typeof MIDIjs !== 'undefined') {
            MIDIjs.play(src);
        } else {
            console.error('MIDIjs is not loaded');
        }
    }
}
