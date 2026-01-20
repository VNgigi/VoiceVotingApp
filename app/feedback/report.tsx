import { Audio } from "expo-av";
import { useRouter } from "expo-router";
import * as Speech from "expo-speech";
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from "expo-speech-recognition";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { db, storage } from "../../firebaseConfig";

export default function ReportScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  
  // --- FORM STATE ---
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  
  // --- AUDIO PROOF STATE ---
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [isRecordingProof, setIsRecordingProof] = useState(false);
  const [sound, setSound] = useState<Audio.Sound | null>(null);

  // --- VOICE NAV STATE ---
  const [currentStep, setCurrentStep] = useState(1); // 1=Cat, 2=Desc, 3=Proof, 4=Submit
  const [listening, setListening] = useState(false);
  const [statusText, setStatusText] = useState("Initializing...");
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const categories = ["Bribery", "Intimidation", "Technical Failure", "Impersonation", "Other"];

  // 1. SETUP
  useEffect(() => {
    Audio.requestPermissionsAsync();
    
    // Start the Voice Wizard after a brief delay
    setTimeout(() => startWizardStep(1), 1000);

    return () => {
      if (sound) sound.unloadAsync();
      stopEverything();
    };
  }, []);

  // --- ANIMATION ---
  useEffect(() => {
    if (listening) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.2, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true })
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [listening]);

  const stopEverything = () => {
    Speech.stop();
    ExpoSpeechRecognitionModule.stop();
    setListening(false);
  };

  // --- 2. VOICE WIZARD LOGIC ---
  const startWizardStep = (step: number) => {
    stopEverything();
    setCurrentStep(step);
    
    let prompt = "";
    
    if (step === 1) {
        prompt = "Step 1. What is the issue? You can say Bribery, Intimidation, or Technical Failure.";
    } else if (step === 2) {
        prompt = "Step 2. Please describe what happened. Speak clearly, I will type it for you.";
    } else if (step === 3) {
        prompt = "Step 3. Do you want to record audio evidence? Press the red button manually to record. Or say Next to skip.";
    } else if (step === 4) {
        prompt = "Report ready. Say Submit to finish, or Cancel to exit.";
    }

    Speech.speak(prompt, {
        onDone: () => {
             // Don't auto-listen on Step 3 (User might want to record audio manually)
             if (step !== 3) {
                 startListening();
             } else {
                 setStatusText("Waiting... (Say Next to skip)");
                 startListening(); 
             }
        }
    });
  };

  const startListening = async () => {
    try {
      await ExpoSpeechRecognitionModule.start({
        lang: "en-US",
        interimResults: true,
        maxAlternatives: 1,
      });
      setListening(true);
      setStatusText("Listening...");
    } catch (e) {
      console.error("Mic Error", e);
    }
  };

  useSpeechRecognitionEvent("result", (event) => {
    const text = event.results[0]?.transcript;
    if (text) {
        if(listening) setStatusText(`Heard: "${text}"`);
        if (event.isFinal) {
            handleVoiceInput(text);
        }
    }
  });

  const handleVoiceInput = (text: string) => {
    const cmd = text.toLowerCase();
    stopEverything();

    // GLOBAL COMMANDS
    if (cmd.includes("cancel") || cmd.includes("exit")) {
        router.back();
        return;
    }

    // STEP 1: CATEGORY
    if (currentStep === 1) {
        const match = categories.find(c => cmd.includes(c.toLowerCase()));
        if (match) {
            setCategory(match);
            Speech.speak(`Selected ${match}.`, {
                onDone: () => startWizardStep(2)
            });
        } else {
            Speech.speak("I didn't catch that. Please say one of the categories.", {
                onDone: () => {startListening();}
            });
        }
    }
    // STEP 2: DESCRIPTION (DICTATION)
    else if (currentStep === 2) {
        setDescription(text); // Set whatever they said
        Speech.speak("Description saved.", {
            onDone: () => startWizardStep(3)
        });
    }
    // STEP 3: AUDIO PROOF SKIP
    else if (currentStep === 3) {
        if (cmd.includes("next") || cmd.includes("skip") || cmd.includes("no")) {
            startWizardStep(4);
        } else {
            // If they said something else, assume they are trying to navigate
             Speech.speak("Say Next to continue to submission.", {
                onDone: () => {startListening();}
            });
        }
    }
    // STEP 4: SUBMIT
    else if (currentStep === 4) {
        if (cmd.includes("submit") || cmd.includes("send") || cmd.includes("yes")) {
            submitReport();
        } else {
             Speech.speak("Say Submit to send your report.", {
                onDone: () => {startListening();}
            });
        }
    }
  };


  // --- 3. AUDIO RECORDING (MANUAL ONLY) ---
  // Note: We stop voice recognition when recording audio proof to avoid conflict
  const startRecordingProof = async () => {
    stopEverything(); 
    try {
      if (audioUri) setAudioUri(null);
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      setRecording(recording);
      setIsRecordingProof(true);
    } catch (err) {
      Alert.alert("Error", "Could not start microphone.");
    }
  };

  const stopRecordingProof = async () => {
    if (!recording) return;
    setIsRecordingProof(false);
    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();
    setRecording(null);
    setAudioUri(uri);
    // Resume Wizard
    Speech.speak("Audio recorded. Say Next to continue.", {
        onDone: () => {startListening();}
    });
  };

  const playRecording = async () => {
    if (!audioUri) return;
    try {
      const { sound } = await Audio.Sound.createAsync({ uri: audioUri });
      setSound(sound);
      await sound.playAsync();
    } catch (e) { console.log("Playback Error", e); }
  };


  // --- 4. SUBMIT LOGIC ---
  const submitReport = async () => {
    if (!category) {
       Speech.speak("Please select a category first.");
       startWizardStep(1);
       return;
    }
    
    setLoading(true);
    stopEverything();
    Speech.speak("Submitting your report...");

    try {
      let audioUrl = null;
      if (audioUri) {
        audioUrl = await uploadAudio(audioUri);
      }

      await addDoc(collection(db, "incidents"), {
        category,
        description: description || "Voice Report",
        audioUrl,
        timestamp: serverTimestamp(),
        status: "investigating",
        flagged: true
      });

      Speech.speak("Report submitted successfully. Going home.", {
          onDone: () => router.back()
      });

    } catch (error) {
      console.error(error);
      Speech.speak("There was an error submitting. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const uploadAudio = async (uri: string) => {
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      const filename = `report_${Date.now()}.m4a`;
      const storageRef = ref(storage, `incident_reports/${filename}`);
      await uploadBytes(storageRef, blob);
      return await getDownloadURL(storageRef);
    } catch (e) { throw new Error("Audio upload failed"); }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{flex:1}}>
        <ScrollView contentContainerStyle={styles.content}>
          
          <Text style={styles.headerTitle}>📢 Report Interference</Text>
          <Text style={styles.headerSub}>Voice Assistant Active: Step {currentStep}/4</Text>

          {/* STEP 1: CATEGORY */}
          <View style={[styles.section, currentStep === 1 && styles.activeSection]}>
            <Text style={styles.label}>1. What is the issue?</Text>
            <View style={styles.grid}>
                {categories.map((cat) => (
                <TouchableOpacity
                    key={cat}
                    style={[styles.catButton, category === cat && styles.catButtonSelected]}
                    onPress={() => { setCategory(cat); startWizardStep(2); }}
                >
                    <Text style={[styles.catText, category === cat && styles.catTextSelected]}>{cat}</Text>
                </TouchableOpacity>
                ))}
            </View>
          </View>

          {/* STEP 2: DESCRIPTION */}
          <View style={[styles.section, currentStep === 2 && styles.activeSection]}>
            <Text style={styles.label}>2. Description (Speak to type)</Text>
            <TextInput
                style={styles.textArea}
                placeholder="Listening for description..."
                multiline
                numberOfLines={4}
                value={description}
                onChangeText={setDescription}
                textAlignVertical="top"
            />
          </View>

          {/* STEP 3: AUDIO */}
          <View style={[styles.section, currentStep === 3 && styles.activeSection]}>
            <Text style={styles.label}>3. Record Proof (Hold Button)</Text>
            {!audioUri ? (
                <TouchableOpacity
                style={[styles.recordBtn, isRecordingProof && styles.recordBtnActive]}
                onPressIn={startRecordingProof}
                onPressOut={stopRecordingProof}
                >
                <Text style={styles.recordIcon}>{isRecordingProof ? "👂" : "🎙️"}</Text>
                <Text style={styles.recordText}>
                    {isRecordingProof ? "Recording..." : "Hold to Record"}
                </Text>
                </TouchableOpacity>
            ) : (
                <View style={styles.audioPreview}>
                    <Text>✅ Audio Recorded</Text>
                    <TouchableOpacity onPress={playRecording} style={styles.playBtn}>
                        <Text style={{color:'white'}}>▶ Play</Text>
                    </TouchableOpacity>
                </View>
            )}
          </View>

          {/* SUBMIT */}
          <TouchableOpacity style={styles.submitBtn} onPress={submitReport} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Submit Report 🛡️</Text>}
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>

      {/* FOOTER STATUS */}
      <View style={styles.footer}>
         <Text style={styles.footerText}>{statusText}</Text>
         {listening && (
            <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                <Text>🎤</Text>
            </Animated.View>
         )}
      </View>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFF5F5" },
  content: { padding: 20, paddingBottom: 60 },
  headerTitle: { fontSize: 24, fontWeight: "bold", color: "#C0392B", marginBottom: 5 },
  headerSub: { fontSize: 14, color: "#555", marginBottom: 25 },
  
  section: { marginBottom: 20, padding: 10, borderRadius: 10 },
  activeSection: { backgroundColor: "#fff", borderWidth: 2, borderColor: "#C0392B" },

  label: { fontSize: 16, fontWeight: "bold", color: "#333", marginBottom: 10 },
  
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  catButton: { padding: 10, borderRadius: 20, borderWidth: 1, borderColor: "#C0392B", backgroundColor: "white" },
  catButtonSelected: { backgroundColor: "#C0392B" },
  catText: { color: "#C0392B", fontWeight: "600" },
  catTextSelected: { color: "white" },

  recordBtn: { 
    backgroundColor: "#FFEBEE", padding: 15, borderRadius: 15, alignItems: 'center', 
    borderWidth: 2, borderColor: "#ffcdd2", borderStyle: 'dashed' 
  },
  recordBtnActive: { backgroundColor: "#ffcdd2", borderColor: "#C0392B", borderStyle: 'solid' },
  recordIcon: { fontSize: 24 },
  recordText: { color: "#C0392B", fontWeight: "600" },
  
  audioPreview: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 10, backgroundColor: 'white', borderRadius: 8 },
  playBtn: { backgroundColor: "#2980b9", padding: 8, borderRadius: 5 },

  textArea: { 
    backgroundColor: "white", borderRadius: 10, padding: 15, fontSize: 16, 
    borderWidth: 1, borderColor: "#ddd", height: 100
  },
  submitBtn: {
    backgroundColor: "#C0392B", padding: 18, borderRadius: 12, alignItems: "center",
    shadowColor: "#000", shadowOpacity: 0.2, elevation: 5, marginTop: 10
  },
  submitText: { color: "white", fontSize: 18, fontWeight: "bold" },

  footer: {
      position: 'absolute', bottom: 0, left: 0, right: 0,
      backgroundColor: '#fff', borderTopWidth: 1, borderColor: '#eee',
      padding: 10, flexDirection: 'row', justifyContent: 'center', alignItems: 'center'
  },
  footerText: { marginRight: 10, color: '#555' }
});