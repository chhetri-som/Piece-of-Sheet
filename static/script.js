// ===============================
// 1. DOM ELEMENTS & SETUP
// ===============================

// Core Elements
const fileInput = document.getElementById("audio-file-input");
const uploadButton = document.getElementById("upload-button");
const loadingText = document.getElementById("loading");
const verovioContainer = document.getElementById("verovio-container");
const playAudioButton = document.getElementById("play-audio-button");
const placeholder = document.getElementById('alpha-placeholder');
const appShell = document.getElementById('app-shell'); // From File 1

// Download Elements (From File 2)
const btnDownloadSheet = document.getElementById('download-sheet-btn');
const btnDownloadMidi = document.getElementById('download-midi-btn');
const btnDownloadPng = document.getElementById('download-png-btn');

// Visualization elements
const waveformContainer = document.getElementById("waveform-container");
const waveformHeading = document.getElementById("waveform-heading");

// Transpose elements
const transposeContainer = document.getElementById('transpose-container');
const btnTransDown = document.getElementById('trans-down');
const btnTransUp = document.getElementById('trans-up');
const transDisplay = document.getElementById('trans-display');

// Tempo elements (From File 2)
const tempoContainer = document.getElementById('tempo-container');
const btnTempoDown = document.getElementById('tempo-down');
const btnTempoUp = document.getElementById('tempo-up');
const tempoDisplay = document.getElementById('tempo-display');

// State Variables
let transpositionValue = 0;
let playbackRate = 1.0;
let wavesurfer;
let currentXmlData = null;
let currentFileId = null; // From File 2 (for server ops)

// MIDI Player State
const playMidiBtn = document.getElementById("play-midi-button");
let currentMidiUrl = null;
let audioContext = null;
let midiPlayerState = 'stopped'; // 'stopped', 'playing', 'paused'

// Verovio
let verovioToolkit = null;

// ===============================
// 2. INITIALIZATION & UI BASICS
// ===============================

// Scroll Reveal (From File 1)
window.addEventListener('scroll', () => {
    if (window.scrollY > window.innerHeight * 0.3) {
        document.body.classList.add('reveal-app');
    }
});

document.addEventListener("DOMContentLoaded", () => {
    // Disable download buttons initially
    if (btnDownloadSheet) btnDownloadSheet.classList.add('pointer-events-none', 'opacity-50');
    if (btnDownloadMidi) btnDownloadMidi.classList.add('pointer-events-none', 'opacity-50');
    if (btnDownloadPng) btnDownloadPng.classList.add('pointer-events-none', 'opacity-50');

    // Check if Verovio script loaded
    if (typeof verovio === 'undefined') {
        console.error("Verovio script not found. Make sure you added it to HTML.");
        return;
    }

    verovio.module.onRuntimeInitialized = function() {
        verovioToolkit = new verovio.toolkit();
        console.log("Verovio Toolkit Initialized");

        verovioToolkit.setOptions({
            // Page Layout
            pageWidth: verovioContainer.clientWidth * 2,
            pageHeight: 2000,
            scale: 35,
            adjustPageHeight: true,

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

// ===============================
// 3. HELPER FUNCTIONS
// ===============================

function showCustomMessage(message) {
    console.error("APP_MESSAGE:", message);
    alert(message);
}

function updateDownloadButtons(xmlUrl, midiUrl) {
    if (xmlUrl) {
        btnDownloadSheet.href = xmlUrl;
        btnDownloadSheet.classList.remove('pointer-events-none', 'opacity-50');
    }
    if (midiUrl) {
        btnDownloadMidi.href = midiUrl;
        btnDownloadMidi.classList.remove('pointer-events-none', 'opacity-50');
    }
    if (btnDownloadPng) {
        btnDownloadPng.classList.remove('pointer-events-none', 'opacity-50');
    }
}

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

function resetUI() {
    // Reset Variables
    transpositionValue = 0;
    transDisplay.innerText = "0";
    playbackRate = 1.0;
    if (tempoDisplay) tempoDisplay.innerText = "1.0x";
    currentXmlData = null;
    currentFileId = null;

    // Clear Verovio
    if (verovioContainer) verovioContainer.innerHTML = "";

    // Show placeholder again
    if (placeholder) placeholder.style.display = 'flex';

    // Disable downloads
    if (btnDownloadSheet) {
        btnDownloadSheet.classList.add('pointer-events-none', 'opacity-50');
        btnDownloadSheet.href = "#";
    }
    if (btnDownloadMidi) {
        btnDownloadMidi.classList.add('pointer-events-none', 'opacity-50');
        btnDownloadMidi.href = "#";
    }
    if (btnDownloadPng) {
        btnDownloadPng.classList.add('pointer-events-none', 'opacity-50');
    }
}

// ===============================
// 4. DOWNLOAD LOGIC (PNG)
// ===============================

if (btnDownloadPng) {
    btnDownloadPng.addEventListener('click', () => {
        if (!verovioContainer) return;

        // Find the SVG in the container
        const svg = verovioContainer.querySelector('svg');
        if (!svg) {
            alert("No music rendered to export.");
            return;
        }

        // 1. Serialize SVG
        const serializer = new XMLSerializer();
        const svgString = serializer.serializeToString(svg);

        // 2. Create an Image from SVG
        const img = new Image();
        const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);

        img.onload = function() {
            // 3. Draw to Canvas
            const canvas = document.createElement('canvas');
            const rect = svg.getBoundingClientRect();
            canvas.width = rect.width * 2; // 2x scale for better quality
            canvas.height = rect.height * 2;

            const ctx = canvas.getContext('2d');
            ctx.scale(2, 2);
            
            // White background (transparent by default)
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.drawImage(img, 0, 0);

            // 4. Download
            const pngUrl = canvas.toDataURL('image/png');
            const downloadLink = document.createElement('a');
            downloadLink.href = pngUrl;
            downloadLink.download = 'sheet-music-view.png';
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);

            URL.revokeObjectURL(url);
        };

        img.src = url;
    });
}

// ===============================
// 5. TRANSPOSE & TEMPO LOGIC
// ===============================

async function updateTransposition() {
    // Update UI Text
    transDisplay.innerText = transpositionValue > 0 ? `+${transpositionValue}` : transpositionValue;

    if (!currentFileId) {
        // Fallback: Client-side only if no file ID (legacy/demo mode)
        if (verovioToolkit && currentXmlData) {
            verovioToolkit.setOptions({ transpose: transpositionValue });
            verovioToolkit.loadData(currentXmlData);
            verovioContainer.innerHTML = verovioToolkit.renderToSVG(1);
        }
        return;
    }

    // Call Server for clean transposition (updates Tabs + Sheet + MIDI)
    try {
        verovioContainer.style.opacity = '0.5';

        const response = await fetch('/transpose', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: currentFileId,
                semitones: transpositionValue
            })
        });

        if (!response.ok) throw new Error("Transposition failed");

        const data = await response.json();

        // Update Download Links
        updateDownloadButtons(data.xmlUrl, data.midiUrl);

        if (data.midiUrl) {
            currentMidiUrl = data.midiUrl; // Update playback URL
        }

        if (data.xmlUrl) {
            // Load NEW XML
            // Important: Set Verovio transpose to 0 because the XML is already transposed by server!
            if (verovioToolkit) {
                verovioToolkit.setOptions({ transpose: 0 });
                const xmlRes = await fetch(data.xmlUrl);
                const newXmlData = await xmlRes.text();
                verovioToolkit.loadData(newXmlData);
                verovioContainer.innerHTML = verovioToolkit.renderToSVG(1);
            }
        }

    } catch (e) {
        console.error("Transposition Server Error:", e);
    } finally {
        verovioContainer.style.opacity = '1';
    }

    // Stop any playing MIDI since pitch changed
    stopMidiPlayback();
}

btnTransDown.addEventListener('click', () => {
    transpositionValue--;
    updateTransposition();
});

btnTransUp.addEventListener('click', () => {
    transpositionValue++;
    updateTransposition();
});

// --- Tempo Logic ---
function updateTempoDisplay() {
    tempoDisplay.innerText = `${playbackRate.toFixed(1)}x`;
    // We stop playback when tempo changes to reset context timing
    stopMidiPlayback();
}

if (btnTempoDown) {
    btnTempoDown.addEventListener('click', () => {
        if (playbackRate > 0.2) {
            playbackRate = Math.max(0.1, playbackRate - 0.1);
            updateTempoDisplay();
        }
    });
}

if (btnTempoUp) {
    btnTempoUp.addEventListener('click', () => {
        if (playbackRate < 4.0) {
            playbackRate = Math.min(4.0, playbackRate + 0.1);
            updateTempoDisplay();
        }
    });
}

// ===============================
// 6. FILE SELECTION & UPLOAD
// ===============================

// File Selection
fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    resetUI();

    // Phase 2 UI Logic (File 1)
    setActiveStep('generate');

    if (file && wavesurfer) {
        const fileUrl = URL.createObjectURL(file);
        wavesurfer.load(fileUrl);

        playAudioButton.disabled = false;
        playAudioButton.onclick = () => {
            wavesurfer.isPlaying() ? wavesurfer.pause() : wavesurfer.play();
            playAudioButton.innerText = wavesurfer.isPlaying() ? "⏸ Pause Audio" : "▶ Play Audio";
        };
        wavesurfer.on('finish', () => {
            playAudioButton.innerText = "↺ Replay Audio";
        });

        waveformHeading.style.display = 'block';
        uploadButton.disabled = false;
        transposeContainer.style.display = 'block';
        if (tempoContainer) tempoContainer.style.display = 'block';
    } else {
        uploadButton.disabled = true;
    }
});

// Upload & Process
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
        const response = await fetch("/process-audio", {
            method: "POST",
            body: formData
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Server Error: ${errorText}`);
        }

        const data = await response.json();

        // Handle Results
        if (data.id) currentFileId = data.id;

        if (data.xmlUrl) {
            renderWithVerovio(data.xmlUrl);
        } else {
            throw new Error("No XML URL returned.");
        }

        if (data.midiUrl) {
            currentMidiUrl = data.midiUrl;
            playMidiBtn.disabled = false;
            console.log("MIDI ready at:", currentMidiUrl);
            
            // Phase 2 UI Logic (File 1)
            document.getElementById('transpose-container')?.classList.add('unlocked');
            setActiveStep('explore');
        }

        updateDownloadButtons(data.xmlUrl, data.midiUrl);

    } catch (error) {
        console.error("Upload failed:", error);
        showCustomMessage(`Error: ${error.message}`);
    } finally {
        loadingText.style.display = "none";
        uploadButton.disabled = false;
    }
});

// ===============================
// 7. MIDI PLAYBACK & VISUALIZER
// ===============================

function initAudioContext() {
    if (!audioContext) {
        audioContext = new(window.AudioContext || window.webkitAudioContext)();
    } else if (audioContext.state === 'closed') {
        audioContext = new(window.AudioContext || window.webkitAudioContext)();
    }
}

function stopMidiPlayback() {
    if (audioContext) {
        audioContext.close();
        audioContext = null;
    }
    midiPlayerState = 'stopped';
    playMidiBtn.innerText = "🎹 Play Generated MIDI";
    playMidiBtn.disabled = false;

    // Reset Visualizer
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    document.querySelectorAll('.piano-key').forEach(k => k.classList.remove('active'));
}

playMidiBtn.addEventListener("click", () => {
    if (!currentMidiUrl) return;

    // Phase 3 UI Logic (File 1) - Visual Feedback
    document.body.classList.add('is-playing');
    setTimeout(() => {
        document.body.classList.remove('is-playing');
    }, 3000);

    // RESUME
    if (midiPlayerState === 'paused') {
        if (audioContext && audioContext.state === 'suspended') {
            audioContext.resume().then(() => {
                midiPlayerState = 'playing';
                playMidiBtn.innerText = "⏸ Pause MIDI";
            });
        }
        return;
    }

    // PAUSE
    if (midiPlayerState === 'playing') {
        if (audioContext && audioContext.state === 'running') {
            audioContext.suspend().then(() => {
                midiPlayerState = 'paused';
                playMidiBtn.innerText = "▶ Resume MIDI";
            });
        }
        return;
    }

    // START NEW PLAYBACK
    initAudioContext();
    playMidiBtn.disabled = true;
    playMidiBtn.innerText = "⏳ Loading SoundFont...";

    Soundfont.instrument(audioContext, 'acoustic_grand_piano').then(function(piano) {
        playMidiBtn.innerText = "⏳ Parsing MIDI...";

        Midi.fromUrl(currentMidiUrl).then(midi => {
            // Check if we need to resume context if it was previously suspended/closed
            if (audioContext.state === 'suspended') {
                audioContext.resume();
            }

            playMidiBtn.innerText = "⏸ Pause MIDI";
            playMidiBtn.disabled = false;
            midiPlayerState = 'playing';

            const now = audioContext.currentTime;

            midi.tracks.forEach(track => {
                track.notes.forEach(note => {
                    // Apply transposition to audio (handled by adding value to note.midi)
                    const pitch = note.midi + transpositionValue;
                    
                    // Apply playbackRate to time and duration
                    piano.play(pitch, now + (note.time / playbackRate), {
                        duration: note.duration / playbackRate,
                        gain: note.velocity
                    });
                });
            });

            // Start Visuals & End Detection
            startVisualizer(midi, now, audioContext);
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
    if (!pianoContainer) return;
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

// --- GUITAR FRETBARD VISUALIZER ---
const guitarContainer = document.getElementById('guitar-fretboard');
const STRINGS = 6;
const FRETS = 24;

// Standard guitar tuning (high to low): E-B-G-D-A-E
const STRING_TUNING = [64, 59, 55, 50, 45, 40]; // MIDI note numbers
const STRING_NAMES = ['E', 'B', 'G', 'D', 'A', 'E']; // High to low


// HELPER: GUITAR POSITION SOLVER
function calculateBestPosition(midiPitch) {
    let bestString = -1;
    let bestFret = 999;

    // Check all 6 strings to find valid positions
    for (let s = 0; s < STRINGS; s++) {
        const stringBasePitch = STRING_TUNING[s];
        const fret = midiPitch - stringBasePitch;

        // Only consider valid frets (0 to 24)
        if (fret >= 0 && fret <= 24) {
            // Heuristic: Strict preference for lower frets
            if (fret < bestFret) {
                bestFret = fret;
                bestString = s;
            }
        }
    }

    // Return a unique key if a valid position was found
    if (bestString !== -1) {
        return `${bestString}-${bestFret}`; // Format: "StringIndex-FretIndex"
    }
    return null;
}

function createFretboard() {
    if (!guitarContainer) return;
    guitarContainer.innerHTML = '';

    const fretboard = document.createElement('div');
    fretboard.classList.add('fretboard');

    // 1. Create Strings Container
    const stringsContainer = document.createElement('div');
    stringsContainer.classList.add('strings');

    // CONFIGURATION FOR SPACING ( PERCENTAGES )
    const startOffset = 3.5; // Start the Nut 3.5% from the left
    const endOffset = 98;    // End the 24th fret at 98%
    const usableWidth = endOffset - startOffset;
    const spacingPerFret = usableWidth / FRETS; // Dynamically calculate width

    // 2. Render Strings (High E at Top -> Low E at Bottom)
    for (let i = STRINGS - 1; i >= 0; i--) {
        const stringElement = document.createElement('div');
        stringElement.classList.add('guitar-string');
        stringElement.dataset.string = i;

        // Label
        const stringLabel = document.createElement('div');
        stringLabel.classList.add('string-label');
        stringLabel.textContent = STRING_NAMES[i];
        stringElement.appendChild(stringLabel);

        // Pre-generate Notes
        for (let fret = 0; fret <= FRETS; fret++) {
            const noteIndicator = document.createElement('div');
            noteIndicator.classList.add('fret-note');
            noteIndicator.dataset.string = i;
            noteIndicator.dataset.fret = fret;
            noteIndicator.dataset.pitch = STRING_TUNING[i] + fret;
            noteIndicator._coordKey = `${i}-${fret}`;

            // [UPDATED] Calculate LEFT position using Percentages
            const fretPosPercent = startOffset + (fret * spacingPerFret);
            noteIndicator.style.left = `${fretPosPercent}%`;
            
            noteIndicator.style.top = '50%'; 

            stringElement.appendChild(noteIndicator);
        }

        stringsContainer.appendChild(stringElement);
    }

    // 3. Render Frets (Overlay)
    for (let fret = 0; fret <= FRETS; fret++) {
        const fretElement = document.createElement('div');
        fretElement.classList.add('fret');
        fretElement.dataset.fret = fret;

        // [UPDATED] Calculate LEFT position using Percentages
        const fretPosPercent = startOffset + (fret * spacingPerFret);
        fretElement.style.left = `${fretPosPercent}%`;
        
        stringsContainer.appendChild(fretElement);

        // Fret Numbers
        if (fret > 0) {
            const fretNumber = document.createElement('div');
            fretNumber.classList.add('fret-number');
            fretNumber.textContent = fret;
            // [UPDATED] Position
            fretNumber.style.left = `${fretPosPercent}%`;
            stringsContainer.appendChild(fretNumber);
        }

        // Inlays
        if ([3, 5, 7, 9, 12, 15, 17, 19, 21, 24].includes(fret)) {
            const inlay = document.createElement('div');
            inlay.classList.add('fret-inlay');
            // [UPDATED] Position
            inlay.style.left = `${fretPosPercent}%`;
            
            inlay.style.top = '50%'; 

            if (fret === 12 || fret === 24) {
                // Double dots for 12th and 24th fret
                inlay.style.top = '35%';
                const inlayBottom = inlay.cloneNode(true);
                inlayBottom.style.top = '65%';
                stringsContainer.appendChild(inlayBottom);
            }
            
            stringsContainer.appendChild(inlay);
        }
    }

    // Nut
    const nut = document.createElement('div');
    nut.classList.add('nut');
    // [UPDATED] Position Nut at the start offset
    nut.style.left = `${startOffset}%`; 
    stringsContainer.appendChild(nut);

    fretboard.appendChild(stringsContainer);
    guitarContainer.appendChild(fretboard);
}

createFretboard();

let animationFrameId;

//  UPDATED VISUALIZER LOOP
function startVisualizer(midiData, startTime, audioContext) {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);

    // Cache DOM elements
    const pianoKeys = document.querySelectorAll('.piano-key');
    const fretNotes = document.querySelectorAll('.fret-note');

    // Pre-calculate lookup keys for faster rendering
    // Assign a "coordinate" property to each DOM element for O(1) matching
    fretNotes.forEach(el => {
        el._coordKey = `${el.dataset.string}-${el.dataset.fret}`;
    });

    function draw() {
        const currentTime = audioContext.currentTime - startTime;

        // Cleanup if finished
        if (currentTime > (midiData.duration / playbackRate) + 0.5) {
            pianoKeys.forEach(k => k.classList.remove('active'));
            fretNotes.forEach(f => f.classList.remove('active'));
            
            midiPlayerState = 'stopped';
            playMidiBtn.innerText = "🎹 Play Generated MIDI";
            playMidiBtn.disabled = false;
            cancelAnimationFrame(animationFrameId);
            return;
        }

        // 1. Identify Active MIDI Notes
        const activeMidiNotes = new Set();
        midiData.tracks.forEach(track => {
            track.notes.forEach(note => {
                const start = note.time / playbackRate;
                const end = (note.time + note.duration) / playbackRate;
                if (currentTime >= start && currentTime < end) {
                    activeMidiNotes.add(note.midi + transpositionValue);
                }
            });
        });

        // 2. Solve Guitar Positions (The Semantic Fix)
        // Convert active pitches -> specific (string, fret) coordinates
        const activeGuitarCoords = new Set();
        activeMidiNotes.forEach(pitch => {
            const coord = calculateBestPosition(pitch);
            if (coord) activeGuitarCoords.add(coord);
        });

        // 3. Render Piano (Standard Logic)
        pianoKeys.forEach(key => {
            const noteNum = parseInt(key.dataset.note);
            key.classList.toggle('active', activeMidiNotes.has(noteNum));
        });

        // 4. Render Fretboard (Semantic Logic)
        // Only light up the specific calculated coordinates
        fretNotes.forEach(noteEl => {
            noteEl.classList.toggle('active', activeGuitarCoords.has(noteEl._coordKey));
        });

        animationFrameId = requestAnimationFrame(draw);
    }
    draw();
}

// ===============================
// 8. PHASE 2 & 3 UI POLISH (FROM FILE 1)
// ===============================

const steps = {
    upload: document.querySelector('.flow-step[data-step="upload"]'),
    generate: document.querySelector('.flow-step[data-step="generate"]'),
    explore: document.querySelector('.flow-step[data-step="explore"]')
};

function setActiveStep(step) {
    Object.values(steps).forEach(s => {
        if (s) s.classList.remove('active');
    });
    if (steps[step]) steps[step].classList.add('active');
}

// Focus Mode
const focusBtn = document.getElementById('focus-toggle');
if (focusBtn) {
    focusBtn.addEventListener('click', () => {
        document.body.classList.toggle('focus-mode');
        focusBtn.textContent =
            document.body.classList.contains('focus-mode') ?
            'Exit Focus' :
            'Focus Mode';
    });
}
