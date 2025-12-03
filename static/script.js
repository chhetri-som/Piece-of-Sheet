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

// Missing in HTML, so commented out to prevent errors:
// const fileNameDisplay = document.getElementById("file-name-display"); 
// const zoomSlider = document.getElementById("zoom-slider"); 
// const zoomDisplay = document.getElementById("zoom-display");

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
    pianoRollImage.style.display = 'none';
    pianoRollHeading.style.display = 'none';
    pianoRollImage.src = '';
    
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
        wavesurfer.on('finish', () => { playAudioButton.innerText = "▶ Play Audio"; });

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
            
            // FIX: Changed 'model_status' to 'status' to match app.py
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

            if (data.visUrl) {
                pianoRollImage.src = data.visUrl;
                pianoRollImage.style.display = 'block';
                pianoRollHeading.style.display = 'block';
            }

            // MIDI Player code block removed to prevent dead logic.

        } catch (error) {
            console.error("Upload failed:", error);
            showCustomMessage(`Error: ${error.message}`);
        } finally {
            loadingText.style.display = "none";
            uploadButton.disabled = false;
        }
    });
}

// --- Window Resize ---
window.addEventListener('resize', () => {
    if (isApiReady && api) {
        setTimeout(() => api.render(), 100);
    }
});
