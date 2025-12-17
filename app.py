import os
import time
import copy  # Required for duplicating the staff
import numpy as np
import tensorflow as tf
from flask import Flask, request, jsonify, send_from_directory, url_for
from music21 import converter, stream, note, chord, meter, articulations, instrument, clef, layout, metadata
from basic_pitch.inference import predict
from basic_pitch import ICASSP_2022_MODEL_PATH
import traceback
import gc

#   FLASK APP SETUP
app = Flask(__name__, static_url_path='', static_folder='static')

# Optional: Enable CORS if your frontend is on a different port (requires: pip install flask-cors)
# from flask_cors import CORS
# CORS(app)

UPLOAD_DIR = "uploads"
OUTPUT_DIR = os.path.join('static', 'generated')

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)

#   LOAD BASIC PITCH MODEL (Global Load)
model = None
try:
    tf.get_logger().setLevel('ERROR')
    gpus = tf.config.experimental.list_physical_devices('GPU')
    if gpus:
        for gpu in gpus:
            tf.config.experimental.set_memory_growth(gpu, True)
    
    print(f" * Loading Basic Pitch model into memory...")
    
    # FIX 1: Load the model object once into RAM
    model = ICASSP_2022_MODEL_PATH
    
    print(" * Model initialized successfully.\n")

except Exception as e:
    print(f"❌ ERROR: Could not load Basic Pitch model.\n{e}")
    traceback.print_exc()


# GUITAR TAB LOGIC
# Standard Tuning (E2 - E4)
GUITAR_TUNING = {
    1: 64, # High E (E4)
    2: 59, # B (B3)
    3: 55, # G (G3)
    4: 50, # D (D3)
    5: 45, # A (A2)
    6: 40  # Low E (E2)
}

def clamp_to_guitar_range(midi_val):
    """Force notes into playable electric guitar range (E2-E6)."""
    while midi_val < 40: # Below Low E
        midi_val += 12
    while midi_val > 88: # Above High E (24th fret)
        midi_val -= 12
    return midi_val

def add_guitar_tab_data(score):
    print("    ...Calculating Guitar Tab positions...")
    
    for n in score.flatten().notes:
        if isinstance(n, note.Note):
            process_single_note_for_tab(n)
        elif isinstance(n, chord.Chord):
            # Simplify chords for tabs (just tab the root/bass note for now)
            # Full chord tabbing requires complex logic, this prevents crashes.
            pass 

    return score

def process_single_note_for_tab(n):
    midi_pitch = int(n.pitch.midi)
    
    best_string = 0
    best_fret = 100
    
    for string_num, open_pitch in GUITAR_TUNING.items():
        fret = midi_pitch - open_pitch
        
        # Extended range (0-24) to catch solos
        if 0 <= fret <= 24:
            if fret == 0:
                best_string = string_num
                best_fret = 0
                break
            elif fret < best_fret:
                best_fret = fret
                best_string = string_num
    
    # FIX 2: Safer Fallback
    # If no valid string found, force to Low E (String 6) to avoid negative frets
    if best_string == 0:
         best_string = 6 
         best_fret = max(0, midi_pitch - GUITAR_TUNING[6])

    if best_string != 0:
        s_ind = articulations.StringIndication(best_string)
        f_ind = articulations.FretIndication(best_fret)
        n.articulations.append(s_ind)
        n.articulations.append(f_ind)


# CLEANUP & QUANTIZATION LOGIC
def clean_and_quantize_score(score):
    print("    ...Quantizing and Clamping...")
    
    try:
        score.quantize([4, 16], processOffsets=True, processDurations=True, inPlace=True)
    except Exception as e:
        print(f"    ⚠️ Quantization warning: {e}")

    notes_to_remove = []

    for n in score.flatten().notes:
        if n.quarterLength < 0.1:
            notes_to_remove.append(n)
            continue

        # Clamp Range
        if isinstance(n, note.Note):
            n.pitch.midi = clamp_to_guitar_range(n.pitch.midi)
        elif isinstance(n, chord.Chord):
            for p in n.pitches:
                p.midi = clamp_to_guitar_range(p.midi)

    for n in notes_to_remove:
        score.remove(n, recurse=True)

    return score

#   MIDI → MUSICXML CONVERSION (DUAL STAFF FOR VEROVIO)
def convert_midi_to_xml(midi_path, xml_filename):
    try:
        if not xml_filename.endswith('.xml'):
            xml_filename += '.xml'
        
        output_path = os.path.join(OUTPUT_DIR, xml_filename)
        
        # 1. Parse & Clean
        original_score = converter.parse(midi_path)
        cleaned_score = clean_and_quantize_score(original_score)
        cleaned_score = add_guitar_tab_data(cleaned_score)

        # 2. SETUP DUAL-STAFF SCORE
        dual_staff_score = stream.Score()
        
        # --- PART 1: Standard Notation ---
        part_standard = copy.deepcopy(cleaned_score.parts[0])
        part_standard.id = 'Standard'
        part_standard.partName = 'Sheet' 
        
        for inst in part_standard.flatten().getElementsByClass(instrument.Instrument):
            inst.partName = "Sheet" 
            inst.partAbbreviation = ""
            inst.bestName = ""
        
        # --- PART 2: Tablature ---
        part_tab = copy.deepcopy(cleaned_score.parts[0])
        part_tab.id = 'Tab'
        part_tab.partName = 'Tab'

        for tempo in part_tab.flatten().getElementsByClass('MetronomeMark'):
            part_tab.remove(tempo, recurse=True)

        for inst in part_tab.flatten().getElementsByClass(instrument.Instrument):
            inst.partName = "Tab"
            inst.partAbbreviation = ""
            inst.bestName = ""
            
        for m in part_tab.getElementsByClass('Measure'):
            for c in m.getElementsByClass(clef.Clef):
                m.remove(c)
            if m.number == 1:
                m.insert(0, clef.TabClef())

        # 3. ASSEMBLE
        dual_staff_score.insert(0, part_standard)
        dual_staff_score.insert(0, part_tab)

        grp = layout.StaffGroup([part_standard, part_tab], symbol='bracket', text='')
        dual_staff_score.insert(0, grp)

        # 4. METADATA CLEANUP (This stops the weird number)
        dual_staff_score.metadata = metadata.Metadata()
        dual_staff_score.metadata.title = "Guitar Transcription"
        dual_staff_score.metadata.composer = ""
        
        # CRITICAL: This wipes the specific text field causing the integer overflow
        if hasattr(dual_staff_score, 'credits'):
            dual_staff_score.credits.clear()

        # 5. WRITE
        dual_staff_score.write('musicxml', fp=output_path)

        xml_rel = f"generated/{xml_filename}"
        xml_full_url = url_for('static', filename=xml_rel, _external=True)
        return xml_full_url, output_path

    except Exception as e:
        print(f"❌ Error converting MIDI to XML: {e}")
        traceback.print_exc()
        return None, None
    
#   WAV → MIDI PREDICTION
def predict_wav_to_mid(wav_path, output_mid_path):
    if model is None:
        return False

    print(f"🎶 Running Basic Pitch prediction on: {wav_path}")
    try:
        # Pass the pre-loaded model object
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

# API ENDPOINT
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
    
        success = predict_wav_to_mid(wav_path, midi_path)
        
        # FIX 3: Immediate cleanup of input file
        if os.path.exists(wav_path):
            os.remove(wav_path)

        if not success:
            return jsonify({"error": "Prediction failed"}), 500

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
