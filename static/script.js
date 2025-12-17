// DOM ELEMENTS & SETUP
const fileInput = document.getElementById("audio-file-input");
const uploadButton = document.getElementById("upload-button");
const loadingText = document.getElementById("loading");
const verovioContainer = document.getElementById("verovio-container"); 
const playAudioButton = document.getElementById("play-audio-button");
const placeholder = document.getElementById('alpha-placeholder');

// Visualization elements
const waveformContainer = document.getElementById("waveform-container");
const waveformHeading = document.getElementById("waveform-heading");

// Transpose elements
const transposeContainer = document.getElementById('transpose-container');
const btnTransDown = document.getElementById('trans-down');
const btnTransUp = document.getElementById('trans-up');
const transDisplay = document.getElementById('trans-display');

let transpositionValue = 0;
let wavesurfer;
let currentXmlData = null; 

// VEROVIO INITIALIZATION
let verovioToolkit = null;

document.addEventListener("DOMContentLoaded", () => {
    // Check if Verovio script loaded
    if (typeof verovio === 'undefined') {
        console.error("Verovio script not found. Make sure you added it to HTML.");
        return;
    }

    verovio.module.onRuntimeInitialized = function () {
        verovioToolkit = new verovio.toolkit();
        console.log("Verovio Toolkit Initialized");
        
        verovioToolkit.setOptions({
            // Page Layout
            pageWidth: verovioContainer.clientWidth * 2, 
            pageHeight: 2000, 
            scale: 35, 
            adjustPageHeight: true,
            ignoreLayout: 1,
            
            // VISUAL CLEANUP OPTIONS
            font: 'Bravura',
            spacingSystem: 12, 
            spacingStaff: 12, 
            
            // HIDE CLUTTER
            header: 'none', 
            footer: 'none', 
            mnumInterval: 1, 
            breaks: 'auto'
        });
    };
});

function renderWithVerovio(xmlUrl) {
    if (!verovioToolkit) {
        showCustomMessage("Visualizer is still loading, please wait...");
        return;
    }

    verovioContainer.innerHTML = "<p style='text-align:center; padding: 20px;'>Loading Sheet Music...</p>";

    fetch(xmlUrl)
        .then(response => response.text())
        .then(xmlData => {
            try {
                // Save data globally so we can transpose it later without re-fetching
                currentXmlData = xmlData; 

                verovioToolkit.loadData(currentXmlData);
                
                // Render Page 1
                const svgData = verovioToolkit.renderToSVG(1);
                verovioContainer.innerHTML = svgData;
                
                if (placeholder) placeholder.style.display = 'none';
            } catch (e) {
                console.error("Verovio Render Error:", e);
                verovioContainer.innerHTML = "<p>Error rendering score.</p>";
            }
        })
        .catch(err => {
            console.error("Fetch Error:", err);
            verovioContainer.innerHTML = "<p>Error loading XML file.</p>";
        });
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
} catch (e) {
    console.error("Failed to initialize Wavesurfer.", e);
}

function showCustomMessage(message) {
    console.error("APP_MESSAGE:", message);
    alert(message);
}

function resetUI() {
    // Reset Transpose
    transpositionValue = 0;
    transDisplay.innerText = "0";
    currentXmlData = null;

    // Clear Verovio
    if(verovioContainer) verovioContainer.innerHTML = "";
    
    // Show placeholder again
    if(placeholder) placeholder.style.display = 'flex';
}

// EVENT LISTENERS
// --- Transposition Logic ---
function updateTransposition() {
    // Update UI Text
    transDisplay.innerText = transpositionValue > 0 ? `+${transpositionValue}` : transpositionValue;

    // Update Sheet Music Visuals
    if (verovioToolkit && currentXmlData) {
        try {
            // Tell Verovio to shift the display
            verovioToolkit.setOptions({ transpose: transpositionValue });
            // Reload the SAME data to apply the new option
            verovioToolkit.loadData(currentXmlData);
            // Re-render
            verovioContainer.innerHTML = verovioToolkit.renderToSVG(1);
        } catch (e) {
            console.error("Transposition render error:", e);
        }
    }
}

btnTransDown.addEventListener('click', () => { 
    transpositionValue--; 
    updateTransposition();
});

btnTransUp.addEventListener('click', () => { 
    transpositionValue++; 
    updateTransposition();
});

// --- File Selection ---
fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    resetUI(); 

    if (file && wavesurfer) {
        const fileUrl = URL.createObjectURL(file);
        wavesurfer.load(fileUrl);

        playAudioButton.disabled = false;
        playAudioButton.onclick = () => {
            wavesurfer.isPlaying() ? wavesurfer.pause() : wavesurfer.play();
            playAudioButton.innerText = wavesurfer.isPlaying() ? "⏸ Pause Audio" : "▶ Play Audio";
        };
        wavesurfer.on('finish', () => { playAudioButton.innerText = "↺ Replay Audio"; });

        waveformHeading.style.display = 'block';
        uploadButton.disabled = false;
        transposeContainer.style.display = 'block';
    } else {
        uploadButton.disabled = true;
    }
});

// --- Upload & Process ---
uploadButton.addEventListener("click", async () => {
    const file = fileInput.files[0];
    if (!file) return showCustomMessage("Please select an audio file.");

    loadingText.style.display = "block";
    uploadButton.disabled = true;

    const formData = new FormData();
    formData.append("audio", file);

    try {
        // Health Check
        const healthRes = await fetch("/health");
        if (!healthRes.ok) throw new Error("Health check failed");
        const healthData = await healthRes.json();
        
        if (healthData.status !== "ready") throw new Error("Model is not ready.");

        // Process Audio
        const response = await fetch("/process-audio", { method: "POST", body: formData });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Server Error: ${errorText}`);
        }

        const data = await response.json();

        // Handle Results
        if (data.xmlUrl) {
            // CALL VEROVIO RENDERER HERE
            renderWithVerovio(data.xmlUrl);
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

// MIDI PLAYBACK & VISUALIZER
const playMidiBtn = document.getElementById("play-midi-button");
let currentMidiUrl = null;
let audioContext = null;

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

    Soundfont.instrument(audioContext, 'acoustic_grand_piano').then(function (piano) {
        playMidiBtn.innerText = "⏳ Parsing MIDI...";

        Midi.fromUrl(currentMidiUrl).then(midi => {
            playMidiBtn.innerText = "▶ Playing...";
            const now = audioContext.currentTime;

            midi.tracks.forEach(track => {
                track.notes.forEach(note => {
                    // Apply transposition to audio
                    const pitch = note.midi + transpositionValue;
                    piano.play(pitch, now + note.time, { 
                        duration: note.duration, 
                        gain: note.velocity 
                    });
                });
            });

            // Start Visuals
            startVisualizer(midi, now, audioContext); 

            setTimeout(() => {
                playMidiBtn.innerText = "🎹 Play Generated MIDI";
                playMidiBtn.disabled = false;
                document.querySelectorAll('.piano-key').forEach(k => k.classList.remove('active'));
            }, midi.duration * 1000);
        });
    });
});

// --- PIANO VISUALIZER ---
const pianoContainer = document.getElementById('piano-visualizer');
const NOTE_RANGE_START = 36; 
const NOTE_RANGE_END = 84;  

function isBlackKey(midiParams) {
    const n = midiParams % 12;
    return (n === 1 || n === 3 || n === 6 || n === 8 || n === 10);
}

function createPiano() {
    pianoContainer.innerHTML = '';
    for (let i = NOTE_RANGE_START; i <= NOTE_RANGE_END; i++) {
        const key = document.createElement('div');
        key.dataset.note = i;
        key.classList.add('piano-key');
        if (isBlackKey(i)) key.classList.add('black');
        else key.classList.add('white');
        pianoContainer.appendChild(key);
    }
}
createPiano();

let animationFrameId;
function startVisualizer(midiData, startTime, audioContext) {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    const keys = document.querySelectorAll('.piano-key');

    function draw() {
        const currentTime = audioContext.currentTime - startTime;
        if (currentTime > midiData.duration) {
            keys.forEach(k => k.classList.remove('active'));
            return;
        }

        const activeNotes = new Set();
        midiData.tracks.forEach(track => {
            track.notes.forEach(note => {
                if (currentTime >= note.time && currentTime < (note.time + note.duration)) {
                    // Apply transposition to visuals too
                    activeNotes.add(note.midi + transpositionValue);
                }
            });
        });

        keys.forEach(key => {
            const noteNum = parseInt(key.dataset.note);
            if (activeNotes.has(noteNum)) key.classList.add('active');
            else key.classList.remove('active');
        });

        animationFrameId = requestAnimationFrame(draw);
    }
    draw();
}
