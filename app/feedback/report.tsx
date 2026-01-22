import { Ionicons } from "@expo/vector-icons";
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
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { db, storage } from "../../firebaseConfig";

// --- THEME ---
const PRIMARY_COLOR = "#DC2626"; 
const BG_COLOR = "#F9FAFB"; 
const CARD_BG = "#FFFFFF";
const TEXT_COLOR = "#1F2937";
const ACTIVE_BG = "#FEF2F2"; 

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
  const [currentStep, setCurrentStep] = useState(1); 
  const [listening, setListening] = useState(false);
  const [statusText, setStatusText] = useState("Initializing...");
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const categories = ["Bribery", "Intimidation", "Technical Failure", "Impersonation", "Other"];

  // 1. SETUP
  useEffect(() => {
    Audio.requestPermissionsAsync();
    
    // Start the Voice Wizard after a brief delay
    const timer = setTimeout(() => startWizardStep(1), 1000);

    return () => {
      clearTimeout(timer);
      if (sound) sound.unloadAsync();
      stopEverything();
    };
  }, []);

  // --- ANIMATION ---
  useEffect(() => {
    if (listening) {
      // Start pulsing
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.2, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true })
        ])
      ).start();
    } else {
      // Stop pulsing and reset smoothly
      pulseAnim.stopAnimation();
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
        if(listening) setStatusText(`"${text}"`);
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
    // STEP 2: DESCRIPTION
    else if (currentStep === 2) {
        setDescription(text); 
        Speech.speak("Description saved.", {
            onDone: () => startWizardStep(3)
        });
    }
    // STEP 3: AUDIO PROOF SKIP
    else if (currentStep === 3) {
        if (cmd.includes("next") || cmd.includes("skip") || cmd.includes("no")) {
            startWizardStep(4);
        } else {
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

  // --- 3. AUDIO RECORDING ---
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

  const progress = (currentStep / 4) * 100;

  return (
    <SafeAreaView style={styles.container} collapsable={false}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      
      {/* HEADER */}
      <View style={styles.header}>
         <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="close" size={24} color={TEXT_COLOR} />
         </TouchableOpacity>
         <Text style={styles.headerTitle}>Report Incident</Text>
         <View style={{width: 24}} /> 
      </View>
      
      {/* PROGRESS */}
      <View style={styles.progressTrack}>
         <Animated.View style={[styles.progressBar, { width: `${progress}%` }]} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{flex:1}}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          
          <Text style={styles.stepTitle}>
            {currentStep === 1 && "What type of issue?"}
            {currentStep === 2 && "Describe the incident"}
            {currentStep === 3 && "Add Evidence"}
            {currentStep === 4 && "Review & Submit"}
          </Text>

          {/* STEP 1: CATEGORY */}
          <View style={[styles.card, currentStep === 1 && styles.activeCard]}>
             <View style={styles.cardHeader}>
                <Ionicons name="alert-circle-outline" size={20} color={PRIMARY_COLOR} />
                <Text style={styles.cardLabel}>Category</Text>
             </View>
             
             <View style={styles.grid}>
                {categories.map((cat) => {
                    const isSelected = category === cat;
                    return (
                        <TouchableOpacity
                            key={cat}
                            style={[styles.chip, isSelected && styles.chipSelected]}
                            onPress={() => { setCategory(cat); startWizardStep(2); }}
                        >
                            <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>{cat}</Text>
                        </TouchableOpacity>
                    );
                })}
             </View>
          </View>

          {/* STEP 2: DESCRIPTION */}
          <View style={[styles.card, currentStep === 2 && styles.activeCard]}>
             <View style={styles.cardHeader}>
                <Ionicons name="document-text-outline" size={20} color={PRIMARY_COLOR} />
                <Text style={styles.cardLabel}>Description</Text>
             </View>
             
             <TextInput
                style={styles.textArea}
                placeholder="Start speaking or type here..."
                multiline
                numberOfLines={4}
                value={description}
                onChangeText={setDescription}
                textAlignVertical="top"
             />
          </View>

          {/* STEP 3: AUDIO */}
          <View style={[styles.card, currentStep === 3 && styles.activeCard]}>
             <View style={styles.cardHeader}>
                <Ionicons name="mic-outline" size={20} color={PRIMARY_COLOR} />
                <Text style={styles.cardLabel}>Voice Evidence</Text>
             </View>

             {!audioUri ? (
                <TouchableOpacity
                    style={[styles.recordBtn, isRecordingProof && styles.recordBtnActive]}
                    onPressIn={startRecordingProof}
                    onPressOut={stopRecordingProof}
                    activeOpacity={0.8}
                >
                    <Ionicons name={isRecordingProof ? "radio-button-on" : "mic"} size={32} color={isRecordingProof ? "#fff" : PRIMARY_COLOR} />
                    <Text style={[styles.recordText, isRecordingProof && { color: "#fff" }]}>
                        {isRecordingProof ? "Recording..." : "Hold to Record"}
                    </Text>
                </TouchableOpacity>
             ) : (
                <View style={styles.audioPreview}>
                    <View style={styles.audioInfo}>
                        <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                        <Text style={styles.audioText}>Audio Recorded</Text>
                    </View>
                    <TouchableOpacity onPress={playRecording} style={styles.playBtn}>
                        <Ionicons name="play" size={16} color="#fff" />
                        <Text style={styles.playText}>Play</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setAudioUri(null)} style={styles.deleteBtn}>
                        <Ionicons name="trash-outline" size={16} color="#EF4444" />
                    </TouchableOpacity>
                </View>
             )}
          </View>

          {/* SUBMIT BUTTON */}
          <View style={{marginTop: 20}}>
              <TouchableOpacity 
                style={[styles.submitBtn, loading && { opacity: 0.7 }]} 
                onPress={submitReport} 
                disabled={loading}
              >
                {loading ? (
                    <ActivityIndicator color="#fff" />
                ) : (
                    <>
                        <Text style={styles.submitText}>Submit Report</Text>
                        <Ionicons name="arrow-forward" size={20} color="#fff" />
                    </>
                )}
              </TouchableOpacity>
              
              <TouchableOpacity onPress={() => router.back()} style={styles.cancelLink}>
                  <Text style={styles.cancelText}>Cancel Report</Text>
              </TouchableOpacity>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>

      {/* --- FLOATING STATUS (FIXED) --- */}
      <View style={styles.floatingContainer} collapsable={false}>
         <View style={styles.statusPill}>
             {/* Use opacity to hide/show instead of removing element to prevent crash */}
             <View style={[styles.statusDot, { opacity: listening ? 1 : 0 }]} />
             <Text style={styles.footerText} numberOfLines={1}>{statusText}</Text>
         </View>
         
         <TouchableOpacity 
            onPress={() => startWizardStep(currentStep)}
            style={styles.micButton}
            activeOpacity={0.9}
         >
             {/* CRASH FIX: Always render Animated.View, just animate scale */}
             <Animated.View style={{ transform: [{ scale: listening ? pulseAnim : 1 }] }}>
                 <Ionicons name={listening ? "mic" : "refresh"} size={24} color="#fff" />
             </Animated.View>
         </TouchableOpacity>
      </View>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG_COLOR },
  
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16,
    backgroundColor: "#fff",
  },
  headerTitle: { fontSize: 18, fontWeight: "700", color: TEXT_COLOR },
  backBtn: { padding: 4 },
  
  progressTrack: { height: 4, backgroundColor: "#E5E7EB", width: '100%' },
  progressBar: { height: '100%', backgroundColor: PRIMARY_COLOR },

  content: { padding: 24, paddingBottom: 100 },
  stepTitle: { fontSize: 22, fontWeight: "800", color: TEXT_COLOR, marginBottom: 24 },

  card: {
    backgroundColor: CARD_BG,
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    shadowColor: "#000", shadowOpacity: 0.03, shadowRadius: 10, elevation: 2,
    borderWidth: 1, borderColor: "transparent"
  },
  activeCard: {
    borderColor: PRIMARY_COLOR,
    shadowColor: PRIMARY_COLOR, shadowOpacity: 0.1
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  cardLabel: { fontSize: 13, fontWeight: "700", color: "#6B7280", textTransform: "uppercase" },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: {
    paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: "#F3F4F6",
    borderWidth: 1, borderColor: "transparent"
  },
  chipSelected: { backgroundColor: ACTIVE_BG, borderColor: PRIMARY_COLOR },
  chipText: { fontSize: 14, color: "#4B5563", fontWeight: "600" },
  chipTextSelected: { color: PRIMARY_COLOR },

  textArea: {
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: TEXT_COLOR,
    minHeight: 100,
    borderWidth: 1, borderColor: "#E5E7EB"
  },

  recordBtn: { 
    backgroundColor: ACTIVE_BG, 
    padding: 20, borderRadius: 16, 
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: "#FECACA", borderStyle: 'dashed',
    gap: 8
  },
  recordBtnActive: { 
    backgroundColor: PRIMARY_COLOR, borderColor: PRIMARY_COLOR, borderStyle: 'solid' 
  },
  recordText: { color: PRIMARY_COLOR, fontWeight: "700", fontSize: 14 },
  
  audioPreview: { 
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 12, backgroundColor: "#F0FDF4", borderRadius: 12, borderWidth: 1, borderColor: "#BBF7D0"
  },
  audioInfo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  audioText: { color: "#065F46", fontWeight: "600", fontSize: 14 },
  playBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: "#10B981", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  playText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  deleteBtn: { padding: 8 },

  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: PRIMARY_COLOR,
    padding: 18, borderRadius: 16,
    shadowColor: PRIMARY_COLOR, shadowOpacity: 0.3, shadowRadius: 10, elevation: 4
  },
  submitText: { color: "white", fontSize: 16, fontWeight: "700" },
  cancelLink: { alignItems: 'center', marginTop: 16 },
  cancelText: { color: "#6B7280", fontSize: 14, fontWeight: "500" },

  floatingContainer: {
      position: 'absolute', bottom: 30, left: 24, right: 24,
      flexDirection: 'row', alignItems: 'center', gap: 12
  },
  statusPill: {
      flex: 1, flexDirection: 'row', alignItems: 'center',
      backgroundColor: "rgba(31, 41, 55, 0.95)",
      paddingHorizontal: 16, paddingVertical: 14,
      borderRadius: 30,
      shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 10, elevation: 5
  },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#EF4444", marginRight: 10 },
  footerText: { fontSize: 14, color: "#fff", fontWeight: "600" },
  
  micButton: {
      width: 52, height: 52, borderRadius: 26, 
      backgroundColor: PRIMARY_COLOR,
      justifyContent: 'center', alignItems: 'center',
      shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 8, elevation: 6
  }
});