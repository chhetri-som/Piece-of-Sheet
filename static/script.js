// Get HTML elements
const fileInput = document.getElementById("audio-file-input");
const uploadButton = document.getElementById("upload-button");
const loadingText = document.getElementById("loading");
const container = document.getElementById("alphaTab-container");
const playAudioButton = document.getElementById("play-audio-button");

// New visualization elements
const waveformContainer = document.getElementById("waveform-container");
const waveformHeading = document.getElementById("waveform-heading");
const pianoRollImage = document.getElementById("piano-roll-img");
const pianoRollHeading = document.getElementById("piano-roll-heading");

// Transpose elements
const transposeContainer = document.getElementById('transpose-container');
const btnTransDown = document.getElementById('trans-down');
const btnTransUp = document.getElementById('trans-up');
const transDisplay = document.getElementById('trans-display');

const fileNameDisplay = document.getElementById("file-name-display");

let transpositionValue = 0;



let api;
let isApiReady = false;
let wavesurfer;
let midiPlayerButton = null;

// 1. Initialize AlphaTab API

try {
    const settings = {
        core: {
            fontDirectory: "https://cdn.jsdelivr.net/npm/@coderline/alphatab@latest/dist/font/"
        }
    };
    api = new alphaTab.AlphaTabApi(container, settings);
    isApiReady = true;
    console.log("AlphaTab API initialized successfully.");
} catch (e) {
    console.error("Failed to initialize AlphaTab.", e);
}

// 2️. Initialize Wavesurfer API

try {
    wavesurfer = WaveSurfer.create({
        container: waveformContainer,
        waveColor: 'rgb(101, 163, 240)',
        progressColor: 'rgb(56, 100, 171)',
        //barWidth: 2,
        //barRadius: 1,
        responsive: true,
        height: 128
    });
    console.log("Wavesurfer initialized successfully.");
} catch (e) {
    console.error("Failed to initialize Wavesurfer.", e);
}



// 3️. MIDI PLAYER FUNCTION

function showMidiPlayer(url) {
    if (!url) return;

    // Remove previous button if exists
    if (midiPlayerButton) {
        midiPlayerButton.remove();
        midiPlayerButton = null;
    }

    // Create button
    midiPlayerButton = document.createElement("button");
    midiPlayerButton.innerText = "▶ Play MIDI";
    midiPlayerButton.style.marginTop = "12px";
    container.parentNode.insertBefore(midiPlayerButton, container.nextSibling);

    midiPlayerButton.onclick = async () => {
        try {
            const resp = await fetch(url);
            if (!resp.ok) throw new Error("Failed to fetch MIDI file");
            const arrayBuffer = await resp.arrayBuffer();
            const midi = new Midi(arrayBuffer);

            const synth = new Tone.PolySynth(Tone.Synth).toDestination();
            const now = Tone.now() + 0.5; // small delay

            midi.tracks.forEach(track => {
                track.notes.forEach(note => {
                    synth.triggerAttackRelease(
                        note.name,
                        note.duration,
                        note.time + now,
                        note.velocity
                    );
                });
            });

            console.log("MIDI playback scheduled.");
        } catch (err) {
            console.error("Error playing MIDI:", err);
            alert("Could not play MIDI: " + err.message);
        }
    };
}


// 4️. Show Custom Message

function showCustomMessage(message) {
    console.error("APP_MESSAGE:", message);
    alert(message);
}


// Transposition Logic (Visual Only)

function updateTransposition() {
    // Update UI Text
    transDisplay.innerText = transpositionValue > 0 ? `+${transpositionValue}` : transpositionValue;

    if (isApiReady && api) {
        // 1. Update AlphaTab settings
        // transpositionPitches accepts an array (one value per track). 
        // We assume 1 track for now.
        api.settings.notation.transpositionPitches = [transpositionValue];
        
        // 2. Apply settings
        api.updateSettings();
        
        // 3. Re-render the score
        api.render();
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



// 5️. File Input Change Listener

fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (file && wavesurfer) {
        const fileUrl = URL.createObjectURL(file);
        wavesurfer.load(fileUrl);

        // Enable play/pause
        playAudioButton.disabled = false;
        playAudioButton.onclick = () => {
            if (wavesurfer.isPlaying()) {
                wavesurfer.pause();
                playAudioButton.innerText = "▶ Play Audio";
            } else {
                wavesurfer.play();
                playAudioButton.innerText = "⏸ Pause Audio";
            }
        };

        waveformHeading.style.display = 'block';
        uploadButton.disabled = false;

        
        // SHOW TRANSPOSE CONTROLS
        transposeContainer.style.display = 'block';
        
        // RESET TRANSPOSITION ON NEW FILE
        transpositionValue = 0;
        transDisplay.innerText = "0";

        // Clear old results
        pianoRollImage.style.display = 'none';
        pianoRollHeading.style.display = 'none';
        pianoRollImage.src = '';
        if (isApiReady && api) {
            try {
                api.load(null);
            } catch (e) {
                console.warn("AlphaTab clear failed:", e);
            }
        }
        if (midiPlayerButton) {
            midiPlayerButton.remove();
            midiPlayerButton = null;
        }
    } else {
        uploadButton.disabled = true;
    }
});


// 6️. Upload Button Click Listener

if (isApiReady) {
    uploadButton.addEventListener("click", async () => {
        const file = fileInput.files[0];
        if (!file) {
            showCustomMessage("Please select an audio file first.");
            return;
        }

        loadingText.style.display = "block";

        // Clear previous results
        if (api) {
            try { api.load(null); } catch (e) { console.warn("AlphaTab clear failed:", e); }
        }
        pianoRollImage.style.display = 'none';
        pianoRollHeading.style.display = 'none';
        pianoRollImage.src = '';
        if (midiPlayerButton) {
            midiPlayerButton.remove();
            midiPlayerButton = null;
        }

        const formData = new FormData();
        formData.append("audio", file);

        try {
            // Health check
            const healthRes = await fetch("/health");
            if (!healthRes.ok) throw new Error("Server health check failed");
            const healthData = await healthRes.json();
            if (healthData.model_status !== "ready") throw new Error(healthData.message || "Model is not ready");

            // Upload audio & process
            const response = await fetch("/process-audio", {
                method: "POST",
                body: formData,
            });

            if (!response.ok) {
                const errorText = await response.text();
                try {
                    const errorJson = JSON.parse(errorText);
                    throw new Error(errorJson.error || "Server error");
                } catch {
                    throw new Error(errorText || `Server error: ${response.status}`);
                }
            }

            const data = await response.json();

            // Load Sheet Music
            if (data.xmlUrl && api) {
                api.load(data.xmlUrl);
                const placeholder = document.getElementById('alpha-placeholder');
                if (placeholder) {
                    placeholder.style.display = 'none'; // Hide it!
                }
            } else {
                showCustomMessage("Error: " + (data.error || "Failed to get XML URL."));
            }

            // Load Piano Roll Visualization
            if (data.visUrl) {
                pianoRollImage.src = data.visUrl;
                pianoRollImage.style.display = 'block';
                pianoRollHeading.style.display = 'block';
            }

            // Show MIDI player
            if (data.midiUrl) {
                showMidiPlayer(data.midiUrl);
            }

        } catch (error) {
            console.error("Upload failed:", error);
            showCustomMessage(`Upload failed: ${error.message}`);
        } finally {
            loadingText.style.display = "none";
        }
    });

    console.log("Generate Music button is loaded and ready.");
} else {
    console.error("Button listener NOT attached because AlphaTab API failed to load.");
}



// Zoom / Scaling Logic (Global UI + Sheet)


if (zoomSlider) {
    zoomSlider.addEventListener('input', (e) => {
        const scaleLevel = parseFloat(e.target.value);
        const percent = Math.round(scaleLevel * 100);
        
        // 1. Update Text Display
        if (zoomDisplay) {
            zoomDisplay.innerText = percent + "%";
        }

        // 2. Scale the Entire UI (Tailwind uses 'rem', so changing root font-size scales everything)
        // Default browser font-size is 16px. 
        // 100% = 16px, 150% = 24px, etc.
        const basePixelSize = 16;
        document.documentElement.style.fontSize = `${basePixelSize * scaleLevel}px`;

        // 3. Scale AlphaTab (The sheet music engine)
        if (isApiReady && api) {
            api.settings.display.scale = scaleLevel;
            api.updateSettings();
            api.render();
        }
    });
}

// Handle Window Resizing (Responsive Layout)
window.addEventListener('resize', () => {
    if (isApiReady && api) {
        // Allow the UI to settle before asking AlphaTab to redraw
        setTimeout(() => {
            api.render();
        }, 100);
    }
});
