// Get the HTML elements
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

let api;
let isApiReady = false;
let wavesurfer;
let midiPlayerButton = null;

// --- 1. Initialize AlphaTab API ---
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

// --- 2. Initialize Wavesurfer API ---
try {
    wavesurfer = WaveSurfer.create({
        container: waveformContainer,
        waveColor: 'rgb(101, 163, 240)',
        progressColor: 'rgb(56, 100, 171)',
        barWidth: 2,
        barRadius: 1,
        responsive: true,
        height: 128
    });
    console.log("Wavesurfer initialized successfully.");
} catch (e) {
    console.error("Failed to initialize Wavesurfer.", e);
}
// ---3. Midi player function --- 
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
//--- 4. Show custom message ---
function showCustomMessage(message) {
    console.error("APP_MESSAGE:", message);
    alert(message);
}

// --- 5. Listener for File Input (to show waveform) ---
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
       

// --- 6. Listener for Upload Button (to run analysis) ---
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
            try {
                api.load(null);
            } catch (e) {
                console.warn("AlphaTab clear failed:", e);
            }
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


