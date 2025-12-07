import os
import time
import numpy as np
import tensorflow as tf
from flask import Flask, request, jsonify, send_from_directory, url_for
from music21 import converter, stream, note, chord, meter
from basic_pitch.inference import predict
from basic_pitch import ICASSP_2022_MODEL_PATH
import traceback
import gc

# ============================================
#   FLASK APP SETUP
# ============================================
app = Flask(__name__, static_url_path='', static_folder='static')

UPLOAD_DIR = "uploads"
OUTPUT_DIR = os.path.join('static', 'generated')

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)

# ============================================
#   LOAD BASIC PITCH MODEL
# ============================================
model = None
try:
    tf.get_logger().setLevel('ERROR')
    gpus = tf.config.experimental.list_physical_devices('GPU')
    if gpus:
        for gpu in gpus:
            tf.config.experimental.set_memory_growth(gpu, True)
    
    print(f" * Loading Basic Pitch model...")
    model = ICASSP_2022_MODEL_PATH
    print(" * Model initialized successfully.\n")

except Exception as e:
    print(f"❌ ERROR: Could not load Basic Pitch model.\n{e}")
    traceback.print_exc()

# ============================================
#   CLEANUP & QUANTIZATION LOGIC
# ============================================
def clean_and_quantize_score(score):
    """
    Takes a raw Music21 stream, removes noise, and snaps to grid.
    """
    print("   ...Quantizing and cleaning score...")
    
    # 1. Quantize to nearest 16th note (0.25 quarter length)
    # This aligns the notes to a readable grid
    try:
        score.quantize([4, 16], processOffsets=True, processDurations=True, inPlace=True)
    except Exception as e:
        print(f"   ⚠️ Quantization warning: {e}")

    # 2. Remove artifacts (Tiny notes < 1/32th note)
    # Basic Pitch sometimes generates tiny blips. We remove them.
    for n in list(score.flat.notes):  # Use list() to allow modification during iteration
        if n.quarterLength < 0.1:  
            score.remove(n, recurse=True)

    # 3. Remove "Rests" that are just gaps in audio processing
    # Sometimes useful, sometimes not. Let's collapse short rests if needed.
    # For now, we leave rests as they help timing.

    return score

# ============================================
#   MIDI → MUSICXML CONVERSION
# ============================================
def convert_midi_to_xml(midi_path, xml_filename):
    try:
        if not xml_filename.endswith('.xml'):
            xml_filename += '.xml'
        
        output_path = os.path.join(OUTPUT_DIR, xml_filename)

        # 1. Parse the MIDI
        score = converter.parse(midi_path)
        
        # 2. APPLY CLEANUP (The new feature)
        cleaned_score = clean_and_quantize_score(score)

        # 3. Write XML
        cleaned_score.write('musicxml', fp=output_path)

        # Return URLs
        xml_rel = f"generated/{xml_filename}"
        xml_full_url = url_for('static', filename=xml_rel, _external=True)
        return xml_full_url, output_path

    except Exception as e:
        print(f"❌ Error converting MIDI to XML: {e}")
        traceback.print_exc()
        return None, None

# ============================================
#   WAV → MIDI PREDICTION
# ============================================
def predict_wav_to_mid(wav_path, output_mid_path):
    if model is None:
        return False

    print(f"🎶 Running Basic Pitch prediction on: {wav_path}")
    try:
        # Tweak parameters here to reduce initial noise if needed
        # onset_threshold: Higher = fewer false positives
        # frame_threshold: Higher = sustains notes longer
        _, midi_data, _ = predict(
            wav_path, 
            model, 
            onset_threshold=0.6, 
            frame_threshold=0.4
        )

        midi_data.write(output_mid_path)
        print(f"✅ MIDI saved: {output_mid_path}")

        return True

    except Exception as e:
        print(f"❌ Error during prediction: {e}")
        traceback.print_exc()
        return False

# ============================================
#   API ENDPOINT
# ============================================
@app.route('/process-audio', methods=['POST'])
def process_audio_file():
    if 'audio' not in request.files:
        return jsonify({"error": "No file part"}), 400

    file = request.files['audio']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400

    if not model:
        return jsonify({"error": "Model not loaded on server"}), 500

    # Paths
    unique_id = str(int(time.time()))
    wav_path = os.path.join(UPLOAD_DIR, f"{unique_id}.wav")
    midi_filename = f"{unique_id}.mid"
    midi_path = os.path.join(OUTPUT_DIR, midi_filename)
    xml_filename = f"{unique_id}.xml"

    try:
        file.save(wav_path)
        
        # 1. Predict (Wav -> MIDI)
        success = predict_wav_to_mid(wav_path, midi_path)
        if not success:
            return jsonify({"error": "Prediction failed"}), 500

        # 2. Convert & Clean (MIDI -> XML)
        xml_url, xml_path = convert_midi_to_xml(midi_path, xml_filename)
        
        if xml_url:
            midi_rel = f"generated/{midi_filename}"
            midi_full_url = url_for('static', filename=midi_rel, _external=True)

            return jsonify({ 
                "xmlUrl": xml_url, 
                "midiUrl": midi_full_url 
            })
        else:
            return jsonify({"error": "XML conversion failed"}), 500

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500



@app.route('/')
def index():
    return send_from_directory('static', 'index.html')

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({"status": "ready" if model else "error"})

if __name__ == '__main__':
    app.run(debug=True, port=5000, threaded=True)
