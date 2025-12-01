import os
import time
import numpy as np
import tensorflow as tf
from flask import Flask, request, jsonify, send_from_directory, url_for
from music21 import converter
from basic_pitch.inference import predict
from basic_pitch import ICASSP_2022_MODEL_PATH
import matplotlib
matplotlib.use("Agg")  # Use non-GUI backend to avoid threading issues
import matplotlib.pyplot as plt
import traceback
from threading import Lock

# ============================================
#  🎹 Piano Roll Visualization (Custom)
# ============================================
def save_piano_roll_plot(piano_roll, output_path, note_events, overlay_onsets=True):
    """Create a simple custom piano roll visualization."""
    plt.figure(figsize=(12, 6))
    plt.imshow(
        np.flipud(piano_roll.T),
        aspect="auto",
        interpolation="nearest",
        cmap="magma"
    )
    plt.xlabel("Time (frames)")
    plt.ylabel("MIDI Note")
    plt.title("Piano Roll Visualization")
    plt.colorbar(label="Activation")

    if overlay_onsets and note_events is not None:
        for onset, _, pitch, _, _ in note_events:
            plt.axvline(onset, color="cyan", linestyle="--", linewidth=0.6)

    plt.tight_layout()
    plt.savefig(output_path, dpi=150)
    plt.close()


# ============================================
#  🚀 FLASK APP SETUP
# ============================================
app = Flask(__name__, static_url_path='', static_folder='static')

UPLOAD_DIR = "uploads"
OUTPUT_DIR = os.path.join('static', 'generated')

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)


# ============================================
#  🧠 LOAD BASIC PITCH MODEL
# ============================================
try:
    tf.get_logger().setLevel('ERROR')

    gpus = tf.config.experimental.list_physical_devices('GPU')
    if gpus:
        print(f" * Found {len(gpus)} GPU(s). Enabling memory growth...")
        for gpu in gpus:
            tf.config.experimental.set_memory_growth(gpu, True)
    else:
        print(" * No GPU found. Running on CPU.")

    # Load the model once and reuse
    print(f" * Loading Basic Pitch model from {ICASSP_2022_MODEL_PATH}...")
    model = ICASSP_2022_MODEL_PATH  # Keep as path (not tf.load)
    print(" * Model reference initialized successfully.\n")

except Exception as e:
    print(f"❌ ERROR: Could not load Basic Pitch model.\n{e}")
    traceback.print_exc()
    model = None


# ============================================
#  🎼 MIDI → MUSICXML CONVERSION
# ============================================
from music21 import midi

def convert_midi_to_xml(midi_path, xml_filename):
    """
    Convert a MIDI file to MusicXML using music21 with better timing accuracy.
    """
    try:
        if not xml_filename.endswith('.xml'):
            xml_filename += '.xml'

        # Load MIDI file
        mf = midi.MidiFile()
        mf.open(midi_path)
        mf.read()
        mf.close()

        # Convert MIDI to music21 stream
        score = midi.translate.midiFileToStream(mf)

        output_path = os.path.join(OUTPUT_DIR, xml_filename)
        score.write('musicxml', fp=output_path)

        # Return both relative and absolute URLs
        xml_rel = f"generated/{xml_filename}"
        xml_full_url = url_for('static', filename=xml_rel, _external=True)
        return xml_full_url, output_path

    except Exception as e:
        print(f"❌ Error converting MIDI to XML: {e}")
        traceback.print_exc()
        return None, None


# ============================================
#  🎵 WAV → MIDI + Visualization
# ============================================
def predict_wav_to_mid(wav_path, output_mid_path, output_vis_path):
    """Run Basic Pitch model and generate piano roll + MIDI output."""
    if model is None:
        print("❌ Model not loaded.")
        return False

    print(f"🎶 Running Basic Pitch prediction on: {wav_path}")
    try:
        with predict_lock:
            model_output, midi_data, note_events = predict(wav_path, model)

        # Save MIDI file
        midi_data.write(output_mid_path)
        print(f"✅ MIDI saved: {output_mid_path}")

        # Extract piano roll
        piano_roll = model_output.get('note')
        if piano_roll is None:
            print("⚠️ No piano roll data found.")
            return False

        if tf.is_tensor(piano_roll):
            piano_roll = piano_roll.numpy()
        if len(piano_roll.shape) == 3:
            piano_roll = np.squeeze(piano_roll, axis=0)

        # Save visualization
        print(f"🖼️ Saving piano roll visualization to: {output_vis_path}")
        save_piano_roll_plot(piano_roll, output_vis_path, note_events)
        print("✅ Visualization saved.\n")

        return True

    except Exception as e:
        print(f"❌ Error during prediction: {e}")
        traceback.print_exc()
        return False


# ============================================
#  🧩 API ENDPOINT — AUDIO PROCESS
# ============================================
@app.route('/process-audio', methods=['POST'])
def process_audio_file():
    """Handle uploaded audio and return MusicXML + visualization URLs."""
    if 'audio' not in request.files:
        return jsonify({"error": "No file part"}), 400

    file = request.files['audio']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400

    if not model:
        return jsonify({"error": "Model not loaded on server"}), 500

    try:
        unique_id = str(int(time.time()))

        wav_filename = f"{unique_id}.wav"
        midi_filename = f"{unique_id}.mid"
        vis_filename = f"{unique_id}_vis.png"
        xml_filename = f"{unique_id}.xml"

        wav_path = os.path.join(UPLOAD_DIR, wav_filename)
        midi_path = os.path.join(UPLOAD_DIR, midi_filename)
        vis_path = os.path.join(OUTPUT_DIR, vis_filename)

        # Save uploaded audio
        file.save(wav_path)
        print(f"📥 Received audio: {wav_path}")

        # Predict
        success = predict_wav_to_mid(wav_path, midi_path, vis_path)
        if not success:
            return jsonify({"error": "Failed to run ML prediction"}), 500

        # Convert MIDI → XML
        xml_url, xml_path = convert_midi_to_xml(midi_path, xml_filename)

        # Cleanup
        for temp_path in [wav_path, midi_path, vis_path]:
            if os.path.exists(wav_path):
                os.remove(wav_path)

        # Response
        if xml_url:
            vis_rel = f"generated/{vis_filename}"
            vis_full_url = url_for('static', filename=vis_rel, _external=True)

            return jsonify({
                "xmlUrl": xml_url,
                "visUrl": vis_full_url
                 "midiUrl": url_for('static', filename=f"generated/{midi_filename}", _external=True)
            })
        else:
            return jsonify({"error": "Failed to convert MIDI to MusicXML"}), 500

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": f"Unexpected server error: {str(e)}"}), 500


# ============================================
#  🌐 FRONTEND ROUTE
# ============================================
@app.route('/')
def index():
    return send_from_directory('static', 'index.html')


# ============================================
#  🩺 HEALTH CHECK
# ============================================
@app.route('/health', methods=['GET'])
def health_check():
    """Verify model availability."""
    if model is not None:
        return jsonify({"model_status": "ready", "message": "Model loaded and healthy."})
    else:
        return jsonify({"model_status": "error", "message": "Model not loaded"}), 500


# ============================================
#  🚀 RUN SERVER
# ============================================
if __name__ == '__main__':
    app.run(debug=True, port=5000, threaded=False)
 # Set threaded=False for thread safety, optional if using predict_lock
