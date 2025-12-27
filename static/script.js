// DOM ELEMENTS & SETUP
const fileInput = document.getElementById("audio-file-input");
const uploadButton = document.getElementById("upload-button");
const loadingText = document.getElementById("loading");
const verovioContainer = document.getElementById("verovio-container");
const playAudioButton = document.getElementById("play-audio-button");
const placeholder = document.getElementById('alpha-placeholder');

// Download Elements
// Download Elements
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

// Tempo elements
const tempoContainer = document.getElementById('tempo-container');
const btnTempoDown = document.getElementById('tempo-down');
const btnTempoUp = document.getElementById('tempo-up');
const tempoDisplay = document.getElementById('tempo-display');

let transpositionValue = 0;
let playbackRate = 1.0;
let wavesurfer;
let currentXmlData = null;
let currentFileId = null;

// VEROVIO INITIALIZATION
let verovioToolkit = null;

document.addEventListener("DOMContentLoaded", () => {
    // Disable download buttons initially
    if (btnDownloadSheet) btnDownloadSheet.classList.add('pointer-events-none', 'opacity-50');
    if (btnDownloadMidi) btnDownloadMidi.classList.add('pointer-events-none', 'opacity-50');
    if (btnDownloadMidi) btnDownloadMidi.classList.add('pointer-events-none', 'opacity-50');
    if (btnDownloadPng) btnDownloadPng.classList.add('pointer-events-none', 'opacity-50');

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

// PNG DOWNLOAD LOGIC
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
        // Use base64 to ensure it loads
        const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);

        img.onload = function () {
            // 3. Draw to Canvas
            const canvas = document.createElement('canvas');
            canvas.width = svg.getBoundingClientRect().width * 2; // 2x scale for better quality
            canvas.height = svg.getBoundingClientRect().height * 2;

            const ctx = canvas.getContext('2d');
            ctx.scale(2, 2);
            // White background (transparent by default)
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.drawImage(img, 0, 0);

            // 4. Download
            // We use standard link trick
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
    playbackRate = 1.0;
    if (tempoDisplay) tempoDisplay.innerText = "1.0x";
    currentXmlData = null;

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

// EVENT LISTENERS
// --- Transposition Logic ---
async function updateTransposition() {
    // Update UI Text
    transDisplay.innerText = transpositionValue > 0 ? `+${transpositionValue}` : transpositionValue;

    if (!currentFileId) {
        // Fallback or just ignore if no file loaded
        // If we want to support client-side only (legacy), we could keep the old logic here.
        // But assumed usage is with uploaded file.
        if (verovioToolkit && currentXmlData) {
            verovioToolkit.setOptions({ transpose: transpositionValue });
            verovioToolkit.loadData(currentXmlData);
            verovioContainer.innerHTML = verovioToolkit.renderToSVG(1);
        }
        return;
    }

    // Call Server for clean transposition (updates Tabs + Sheet)
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
            currentMidiUrl = data.midiUrl; // Update playback URL too
        }

        if (data.xmlUrl) {
            // Load NEW XML
            // Important: Set Verovio transpose to 0 because the XML is already transposed!
            if (verovioToolkit) {
                verovioToolkit.setOptions({ transpose: 0 });

                // Fetch the new XML content
                const xmlRes = await fetch(data.xmlUrl);
                const newXmlData = await xmlRes.text();

                // Don't update currentXmlData if you want to keep original? 
                // Actually better to keep original as base? 
                // No, for this flow, we just render the new one.
                // But wait, if we transpose +1 then +1 (total +2), we send +2 to server.
                // So we don't need to update 'currentXmlData' to the transposed one 
                // if we consider 'currentXmlData' as the cached original.
                // BUT renderWithVerovio updates 'currentXmlData'.

                verovioToolkit.loadData(newXmlData);
                verovioContainer.innerHTML = verovioToolkit.renderToSVG(1);
            }
        }

    } catch (e) {
        console.error("Transposition Server Error:", e);
        // Fallback to client side if server fails?
        // showCustomMessage("Transposition failed on server.");
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
    stopMidiPlayback();
}

btnTempoDown.addEventListener('click', () => {
    if (playbackRate > 0.2) {
        playbackRate = Math.max(0.1, playbackRate - 0.1);
        updateTempoDisplay();
    }
});

btnTempoUp.addEventListener('click', () => {
    if (playbackRate < 4.0) {
        playbackRate = Math.min(4.0, playbackRate + 0.1);
        updateTempoDisplay();
    }
});

// --- File Selection ---
fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    resetUI();
    currentFileId = null; // Reset ID

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
        if (tempoContainer) tempoContainer.style.display = 'block';
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
        if (data.id) {
            currentFileId = data.id;
        }

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

        // Update Download Buttons
        updateDownloadButtons(data.xmlUrl, data.midiUrl);

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
let midiPlayerState = 'stopped'; // 'stopped', 'playing', 'paused'

function initAudioContext() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    } else if (audioContext.state === 'closed') {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
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

    Soundfont.instrument(audioContext, 'acoustic_grand_piano').then(function (piano) {
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
                    // Apply transposition to audio
                    const pitch = note.midi + transpositionValue;
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
        // If paused, just keep loop running but don't update state or check finish
        // Actually, if paused, currentTime stops, so visuals freeze naturally.

        const currentTime = audioContext.currentTime - startTime;

        // FINISH DETECTION
        // Add a small buffer (e.g., 0.5s) to ensure last note plays out
        // FINISH DETECTION
        // Add a small buffer (e.g., 0.5s) to ensure last note plays out
        if (currentTime > (midiData.duration / playbackRate) + 0.5) {
            keys.forEach(k => k.classList.remove('active'));
            midiPlayerState = 'stopped';
            playMidiBtn.innerText = "🎹 Play Generated MIDI";
            playMidiBtn.disabled = false;
            cancelAnimationFrame(animationFrameId);
            return;
        }

        const activeNotes = new Set();
        midiData.tracks.forEach(track => {
            track.notes.forEach(note => {
                if (currentTime >= (note.time / playbackRate) && currentTime < ((note.time + note.duration) / playbackRate)) {
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
