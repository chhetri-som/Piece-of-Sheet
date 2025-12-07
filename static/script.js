// ==========================================
// 1. DOM ELEMENTS & SETUP
// ==========================================
const fileInput = document.getElementById("audio-file-input");
const uploadButton = document.getElementById("upload-button");
const loadingText = document.getElementById("loading");
const container = document.getElementById("alphaTab-container");
const playAudioButton = document.getElementById("play-audio-button");
const placeholder = document.getElementById('alpha-placeholder');

// Visualization elements
const waveformContainer = document.getElementById("waveform-container");
const waveformHeading = document.getElementById("waveform-heading");
const pianoRollImage = document.getElementById("piano-roll-img");
const pianoRollHeading = document.getElementById("piano-roll-heading");

// Transpose elements
const transposeContainer = document.getElementById('transpose-container');
const btnTransDown = document.getElementById('trans-down');
const btnTransUp = document.getElementById('trans-up');
const transDisplay = document.getElementById('trans-display');

let transpositionValue = 0;
let api;
let isApiReady = false;
let wavesurfer;
let midiPlayerButton = null;

// ==========================================
// 2. INITIALIZATION
// ==========================================

// Initialize AlphaTab
try {
    const settings = {
        core: {
            fontDirectory: "https://cdn.jsdelivr.net/npm/@coderline/alphatab@latest/dist/font/"
        },
        display: {
            scale: 1 // Default scale
        }
    };
    api = new alphaTab.AlphaTabApi(container, settings);
    isApiReady = true;
    console.log("AlphaTab API initialized.");
} catch (e) {
    console.error("Failed to initialize AlphaTab.", e);
}

// Initialize Wavesurfer
try {
    wavesurfer = WaveSurfer.create({
        container: waveformContainer,
        waveColor: 'rgb(101, 163, 240)',
        progressColor: 'rgb(56, 100, 171)',
        responsive: true,
        height: 128
    });
    console.log("Wavesurfer initialized.");
} catch (e) {
    console.error("Failed to initialize Wavesurfer.", e);
}

// ==========================================
// 3. HELPER FUNCTIONS
// ==========================================

function showCustomMessage(message) {
    console.error("APP_MESSAGE:", message);
    alert(message);
}

// Shared function to reset UI (Removes Redundancy)
function resetUI() {
    // Reset Transpose
    transpositionValue = 0;
    transDisplay.innerText = "0";

    if (midiPlayerButton) {
        midiPlayerButton.remove();
        midiPlayerButton = null;
    }

    if (isApiReady && api) {
        try { 
            api.load(null); 
        } catch (e) { 
            console.warn("AlphaTab clear warning:", e); 
        }
    }
    
    // Show placeholder again until new sheet loads
    if(placeholder) placeholder.style.display = 'flex';
}

// ==========================================
// 4. EVENT LISTENERS
// ==========================================

// --- Transposition ---
function updateTransposition() {
    transDisplay.innerText = transpositionValue > 0 ? `+${transpositionValue}` : transpositionValue;
    if (isApiReady && api) {
        api.settings.notation.transpositionPitches = [transpositionValue];
        api.updateSettings();
        api.render();
    }
}

btnTransDown.addEventListener('click', () => { transpositionValue--; updateTransposition(); });
btnTransUp.addEventListener('click', () => { transpositionValue++; updateTransposition(); });

// --- File Selection ---
fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    
    // Reset UI immediately when new file is picked
    resetUI(); 

    if (file && wavesurfer) {
        const fileUrl = URL.createObjectURL(file);
        wavesurfer.load(fileUrl);

        playAudioButton.disabled = false;
        playAudioButton.onclick = () => {
            wavesurfer.isPlaying() ? wavesurfer.pause() : wavesurfer.play();
            playAudioButton.innerText = wavesurfer.isPlaying() ? "⏸ Pause Audio" : "▶ Play Audio";
        };
        // Update button text on finish
        wavesurfer.on('finish', () => { playAudioButton.innerText = "↺ Replay Audio"; });

        waveformHeading.style.display = 'block';
        uploadButton.disabled = false;
        transposeContainer.style.display = 'block';

        // if (fileNameDisplay) fileNameDisplay.innerText = file.name;
    } else {
        uploadButton.disabled = true;
    }
});

// --- Upload & Process ---
if (isApiReady) {
    uploadButton.addEventListener("click", async () => {
        const file = fileInput.files[0];
        if (!file) return showCustomMessage("Please select an audio file.");

        loadingText.style.display = "block";
        uploadButton.disabled = true; // Prevent double clicks

        const formData = new FormData();
        formData.append("audio", file);

        try {
            // 1. Health Check
            const healthRes = await fetch("/health");
            if (!healthRes.ok) throw new Error("Health check failed");
            const healthData = await healthRes.json();
            
            if (healthData.status !== "ready") {
                throw new Error("Model is not ready.");
            }

            // 2. Process Audio
            const response = await fetch("/process-audio", { method: "POST", body: formData });
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Server Error: ${errorText}`);
            }

            const data = await response.json();

            // 3. Handle Results
            if (data.xmlUrl) {
                api.load(data.xmlUrl);
                if (placeholder) placeholder.style.display = 'none';
            } else {
                throw new Error("No XML URL returned.");
            }

            if (data.midiUrl) {
                currentMidiUrl = data.midiUrl;
                playMidiBtn.disabled = false;
                console.log("MIDI ready at:", currentMidiUrl);
            }

        } catch (error) {
            console.error("Upload failed:", error);
            showCustomMessage(`Error: ${error.message}`);
        } finally {
            loadingText.style.display = "none";
            uploadButton.disabled = false;
        }
    });
}

// ==========================================
// 5. MIDI PLAYBACK LOGIC
// ==========================================

const playMidiBtn = document.getElementById("play-midi-button");
let currentMidiUrl = null;
let audioContext = null;

// Initialize AudioContext on user interaction (browsers block auto-audio)
function initAudioContext() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
}

playMidiBtn.addEventListener("click", () => {
    if (!currentMidiUrl) return;
    
    initAudioContext();
    playMidiBtn.disabled = true;
    playMidiBtn.innerText = "⏳ Loading SoundFont...";

    // 1. Load the SoundFont Instrument (Acoustic Grand Piano)
    Soundfont.instrument(audioContext, 'acoustic_grand_piano').then(function (piano) {
        
        playMidiBtn.innerText = "⏳ Parsing MIDI...";

        // 2. Fetch the MIDI file from our Flask Server
        Midi.fromUrl(currentMidiUrl).then(midi => {
            playMidiBtn.innerText = "▶ Playing...";
            const now = audioContext.currentTime;

            // 1. Schedule Audio (The Sound)
            midi.tracks.forEach(track => {
                track.notes.forEach(note => {
                    piano.play(note.midi, now + note.time, { 
                        duration: note.duration, 
                        gain: note.velocity 
                    });
                });
            });

            // 2. Start Visuals (The Lights) <--- NEW LINE
            startVisualizer(midi, now, audioContext); 

            // Reset after song ends
            setTimeout(() => {
                playMidiBtn.innerText = "🎹 Play Generated MIDI";
                playMidiBtn.disabled = false;
                // Clear visuals
                document.querySelectorAll('.piano-key').forEach(k => k.classList.remove('active'));
            }, midi.duration * 1000);

        });
    });
});

// ==========================================
// 6. INSTRUMENT CLUSTER (PIANO VISUALIZER)
// ==========================================

const pianoContainer = document.getElementById('piano-visualizer');
const NOTE_RANGE_START = 36; // MIDI note 21 is A0 (lowest on piano)
const NOTE_RANGE_END = 84;  // MIDI note 108 is C8 (highest)

// Helper: Is this MIDI note a black key?
function isBlackKey(midiParams) {
    const n = midiParams % 12;
    return (n === 1 || n === 3 || n === 6 || n === 8 || n === 10);
}

// 1. GENERATE THE PIANO KEYS
function createPiano() {
    pianoContainer.innerHTML = ''; // Clear existing
    
    for (let i = NOTE_RANGE_START; i <= NOTE_RANGE_END; i++) {
        const key = document.createElement('div');
        key.dataset.note = i; // Store MIDI number in data attribute
        key.classList.add('piano-key');
        
        if (isBlackKey(i)) {
            key.classList.add('black');
        } else {
            key.classList.add('white');
        }
        pianoContainer.appendChild(key);
    }
}

// Call immediately to draw the piano on load
createPiano();


// 2. VISUALIZATION LOOP
let animationFrameId;

function startVisualizer(midiData, startTime, audioContext) {
    // Cancel any existing loop
    if (animationFrameId) cancelAnimationFrame(animationFrameId);

    const keys = document.querySelectorAll('.piano-key');

    function draw() {
        const currentTime = audioContext.currentTime - startTime;

        // Stop if song is over
        if (currentTime > midiData.duration) {
            keys.forEach(k => k.classList.remove('active'));
            return;
        }

        // Check every note in the MIDI data
        // (Optimization: In a huge app, you'd use a cursor index, but this is fine for short songs)
        const activeNotes = new Set();
        
        midiData.tracks.forEach(track => {
            track.notes.forEach(note => {
                // If current time is INSIDE the note's start and end window
                if (currentTime >= note.time && currentTime < (note.time + note.duration)) {
                    activeNotes.add(note.midi);
                }
            });
        });

        // Update DOM classes
        keys.forEach(key => {
            const noteNum = parseInt(key.dataset.note);
            if (activeNotes.has(noteNum)) {
                key.classList.add('active');
            } else {
                key.classList.remove('active');
            }
        });

        animationFrameId = requestAnimationFrame(draw);
    }

    draw();
}

// --- Window Resize ---
window.addEventListener('resize', () => {
    if (isApiReady && api) {
        setTimeout(() => api.render(), 100);
    }
});


