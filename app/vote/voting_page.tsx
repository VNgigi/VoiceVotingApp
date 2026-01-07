import Voice from "@react-native-voice/voice";
import { useRouter } from "expo-router";
import * as Speech from "expo-speech";
import { collection, doc, getDocs, increment, query, setDoc } from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  PermissionsAndroid,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { db } from "../../firebaseConfig";

// --- TYPES ---
interface Candidate {
  id: string;
  name: string;
  photoUri?: string;
  briefInfo?: string; 
  [key: string]: any;
}

interface ElectionPosition {
  position: string;
  candidates: Candidate[];
}

export default function VotingScreen() {
  const router = useRouter();

  // --- STATE ---
  const [positionsData, setPositionsData] = useState<ElectionPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  
  // Voice & Selection
  const [listening, setListening] = useState(false);
  const [recognizedText, setRecognizedText] = useState("");
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [step, setStep] = useState<"selecting" | "confirming">("selecting");
  const [errorMessage, setErrorMessage] = useState("");

  // Animation Value for the "Listening" Pulse
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // --- REFS ---
  const positionsRef = useRef<ElectionPosition[]>([]);
  const indexRef = useRef(0);
  const stepRef = useRef("selecting");
  const selectedRef = useRef<Candidate | null>(null);

  // Sync State to Refs
  useEffect(() => { positionsRef.current = positionsData; }, [positionsData]);
  useEffect(() => { indexRef.current = currentIndex; }, [currentIndex]);
  useEffect(() => { stepRef.current = step; }, [step]);
  useEffect(() => { selectedRef.current = selectedCandidate; }, [selectedCandidate]);

  // --- ANIMATION LOOP ---
  useEffect(() => {
    if (listening) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.2, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true })
        ])
      ).start();
    } else {
      pulseAnim.setValue(1); // Reset
    }
  }, [listening]);

  // --- 1. SETUP & FETCH DATA ---
  useEffect(() => {
    // A. Request Permissions Immediately
    const requestPerms = async () => {
        if (Platform.OS === 'android') {
            await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
        }
    };
    requestPerms();

    // B. Fetch Data
    const fetchData = async () => {
      try {
        const q = query(collection(db, "contestants"));
        const snapshot = await getDocs(q);
        const rawList: Candidate[] = [];
        
        snapshot.forEach((doc) => {
           rawList.push({ id: doc.id, ...doc.data() } as Candidate);
        });

        const grouped = groupCandidates(rawList);
        setPositionsData(grouped);
      } catch (e) {
        console.error(e);
        Alert.alert("Error", "Could not fetch ballot.");
      } finally {
        setLoading(false);
      }
    };
    fetchData();

    // C. Cleanup Voice on Unmount
    return () => {
        // Safe Cleanup
        if (Voice) {
            try {
                Voice.destroy().then(Voice.removeAllListeners);
            } catch (e) {
                console.log("Cleanup error:", e);
            }
        }
        Speech.stop();
    };
  }, []);

  // Helper: Group Data
  const groupCandidates = (list: Candidate[]) => {
    const order = [
      "President", "Vice President", "Secretary General", 
      "Treasurer", "Gender and Disability Representative", 
      "Sports, Entertainment and Security Secretary"
    ];
    const groups: Record<string, Candidate[]> = {};
    list.forEach(c => {
      const pos = c.position || "Other";
      if (!groups[pos]) groups[pos] = [];
      groups[pos].push(c);
    });
    return order
      .filter(pos => groups[pos] && groups[pos].length > 0)
      .map(pos => ({ position: pos, candidates: groups[pos] }));
  };

  // --- 2. VOICE EVENT LISTENERS (WITH SAFETY CHECK) ---
  useEffect(() => {
    // --- SAFETY CHECK START ---
    console.log("Voice Module Status:", Voice); 

    if (Voice === null || Voice === undefined) {
      setErrorMessage("Voice Library Missing");
      Alert.alert(
        "Critical Error", 
        "The Voice Library is missing from this device.\n\nAre you using Expo Go? This feature does NOT work in Expo Go. You must use a Development Build."
      );
      return;
    }
    // --- SAFETY CHECK END ---

    // Define Listeners
    const onSpeechStart = (e: any) => setListening(true);
    const onSpeechEnd = (e: any) => setListening(false);
    const onSpeechError = (e: any) => {
        console.log("Voice Error:", e);
        setListening(false);
    };
    const onSpeechResults = (e: any) => {
        const text = e.value?.[0] || "";
        setRecognizedText(text);
        processVoiceLogic(text);
    };

    // Safely Attach Listeners
    try {
        Voice.onSpeechStart = onSpeechStart;
        Voice.onSpeechEnd = onSpeechEnd;
        Voice.onSpeechError = onSpeechError;
        Voice.onSpeechResults = onSpeechResults;
    } catch (e) {
        console.error("Setup Error: Could not attach listeners", e);
    }
  }, []);

  // --- 3. AUTO-PROMPT LOGIC ---
  useEffect(() => {
    if (!loading && positionsData.length > 0) {
      speakPromptAndListen();
    }
  }, [currentIndex, loading, positionsData]);

  const speakPromptAndListen = () => {
    Speech.stop();
    stopListening(); 

    const currentPos = positionsData[currentIndex];
    if (!currentPos) return;

    let prompt = "";
    if (step === "selecting") {
        const names = currentPos.candidates.map(c => c.name).join(", ");
        prompt = `Voting for ${currentPos.position}. Candidates are: ${names}. Say a name.`;
    } else {
        return; 
    }

    Speech.speak(prompt, {
        onDone: () => {
            setTimeout(() => startListening(), 500); 
        },
        onError: () => console.log("Speech Error")
    });
  };

  // --- 4. LISTENING FUNCTIONS ---
  const startListening = async () => {
    setErrorMessage("");
    if (!Voice) return;

    try {
      await Voice.stop(); 
      setRecognizedText(""); 
      await Voice.start("en-US");
    } catch (e: any) {
      console.error(e);
    }
  };

  const stopListening = async () => {
    if (!Voice) return;
    try { await Voice.stop(); } catch (e) {}
  };

  // --- 5. LOGIC PROCESSING ---
  const processVoiceLogic = (text: string) => {
    const clean = text.toLowerCase().trim();
    const currentStep = stepRef.current;
    const currentPos = positionsRef.current[indexRef.current];

    if (!currentPos) return;

    stopListening();

    if (currentStep === "selecting") {
      const match = currentPos.candidates.find(c => 
        c.name.toLowerCase().includes(clean) || clean.includes(c.name.toLowerCase())
      );

      if (match) {
        handleSelectCandidate(match);
      } else {
        Speech.speak("I didn't catch that name. Please say it again.", {
            onDone: () => {
                setTimeout(() => startListening(), 500);
            }
        });
      }

    } else if (currentStep === "confirming") {
      if (clean.includes("confirm") || clean.includes("yes") || clean.includes("submit")) {
        submitVote();
      } else if (clean.includes("cancel") || clean.includes("no") || clean.includes("change")) {
        cancelSelection();
      } else {
        Speech.speak("Please say Confirm or Cancel.", {
            onDone: () => {
                setTimeout(() => startListening(), 500);
            }
        });
      }
    }
  };

  const handleSelectCandidate = (candidate: Candidate) => {
    setSelectedCandidate(candidate);
    setStep("confirming");
    
    Speech.speak(`You selected ${candidate.name}. Say Confirm to vote, or Cancel.`, {
        onDone: () => {
            setTimeout(() => startListening(), 500);
        }
    });
  };

  const cancelSelection = () => {
    setSelectedCandidate(null);
    setStep("selecting");
    setRecognizedText("");
    
    Speech.speak("Selection cleared. Say a candidate name.", {
        onDone: () => {
            setTimeout(() => startListening(), 500);
        }
    });
  };

  const submitVote = async () => {
    const candidate = selectedRef.current;
    const currentPos = positionsRef.current[indexRef.current];
    
    if (!candidate || !currentPos) return;

    try {
      const voteRef = doc(db, "votes", currentPos.position);
      await setDoc(voteRef, { [candidate.name]: increment(1) }, { merge: true });

      Speech.speak(`Vote for ${candidate.name} confirmed.`);

      if (indexRef.current < positionsRef.current.length - 1) {
        setTimeout(() => {
          setSelectedCandidate(null);
          setRecognizedText("");
          setStep("selecting");
          setCurrentIndex(prev => prev + 1);
        }, 2000);
      } else {
        Speech.speak("All votes cast. Thank you.");
        router.replace("/results");
      }

    } catch (e) {
      console.error(e);
      Speech.speak("Error recording vote. Please try again.");
    }
  };


  // --- RENDER ---
  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#eaeff4ff"/></View>;
  if (positionsData.length === 0) return <View style={styles.center}><Text>No elections found. Check your Internet connection</Text></View>;

  const currentPosition = positionsData[currentIndex];

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Voice Vote</Text>
        <Text style={styles.stepIndicator}>
          Position {currentIndex + 1} of {positionsData.length}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.positionTitle}>{currentPosition.position}</Text>

        <View style={styles.grid}>
          {currentPosition.candidates.map((candidate) => {
            const isSelected = selectedCandidate?.id === candidate.id;
            return (
              <TouchableOpacity
                key={candidate.id}
                style={[styles.card, isSelected && styles.cardSelected]}
                onPress={() => handleSelectCandidate(candidate)} 
                activeOpacity={0.8}
              >
                <Image
                  source={{ 
                    uri: candidate.photoUri && !candidate.photoUri.startsWith('blob') 
                      ? candidate.photoUri 
                      : `https://ui-avatars.com/api/?name=${candidate.name}&background=random&size=128` 
                  }}
                  style={styles.avatar}
                />
                <View style={styles.cardInfo}>
                  <Text style={[styles.name, isSelected && styles.nameSelected]}>
                    {candidate.name}
                  </Text>
                  {candidate.briefInfo ? (
                    <Text style={styles.party}>{candidate.briefInfo}</Text>
                  ) : null}
                </View>
                {isSelected && (
                  <View style={styles.checkmarkBadge}><Text style={styles.checkmark}>✓</Text></View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.statusSection}>
            <Animated.View style={[styles.statusCircle, { transform: [{ scale: pulseAnim }] }]}>
                <Text style={styles.statusIcon}>{listening ? "👂" : "🤖"}</Text>
            </Animated.View>

            <Text style={styles.statusText}>
                {listening ? "Listening..." : "Processing..."}
            </Text>

            {recognizedText ? (
                <Text style={styles.recognizedText}>Heard: "{recognizedText}"</Text>
            ) : null}
            
            {errorMessage ? (
                <Text style={{color: 'red', marginTop: 10, textAlign: 'center', fontWeight: 'bold'}}>
                    {errorMessage}
                </Text>
            ) : null}
        </View>

        {selectedCandidate && (
          <View style={styles.actionContainer}>
            <Text style={styles.confirmPrompt}>Confirm vote for {selectedCandidate.name}?</Text>
            <View style={styles.actionButtons}>
              <TouchableOpacity style={styles.cancelBtn} onPress={cancelSelection}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={submitVote}>
                <Text style={styles.confirmText}>Confirm Vote</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F7FA" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: { padding: 20, backgroundColor: "#fff", alignItems: "center", borderBottomWidth: 1, borderColor: "#eee" },
  headerTitle: { fontSize: 20, fontWeight: "800", color: "#333" },
  stepIndicator: { fontSize: 14, color: "#666", marginTop: 4 },
  scrollContent: { padding: 20, paddingBottom: 50 },
  positionTitle: { fontSize: 22, fontWeight: "bold", color: "#1A4A7A", textAlign: "center", marginBottom: 20, textTransform: "uppercase" },
  grid: { gap: 12 },
  card: {
    flexDirection: "row", backgroundColor: "#fff", borderRadius: 16, padding: 12, alignItems: "center",
    borderWidth: 2, borderColor: "transparent", shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 10, elevation: 2,
  },
  cardSelected: { borderColor: "#007AFF", backgroundColor: "#F0F9FF" },
  avatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: "#eee" },
  cardInfo: { marginLeft: 16, flex: 1 },
  name: { fontSize: 18, fontWeight: "700", color: "#333" },
  nameSelected: { color: "#007AFF" },
  party: { fontSize: 14, color: "#666", marginTop: 2 },
  checkmarkBadge: { width: 24, height: 24, borderRadius: 12, backgroundColor: "#007AFF", justifyContent: "center", alignItems: "center", marginLeft: 10 },
  checkmark: { color: "#fff", fontWeight: "bold", fontSize: 14 },
  statusSection: { marginTop: 40, alignItems: "center", justifyContent: 'center' },
  statusCircle: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: "#E3F2FD",
    justifyContent: "center", alignItems: "center", marginBottom: 15,
    borderWidth: 1, borderColor: "#2196F3"
  },
  statusIcon: { fontSize: 32 },
  statusText: { fontSize: 16, fontWeight: "600", color: "#555" },
  recognizedText: { marginTop: 8, fontSize: 16, color: "#333", fontStyle: "italic" },
  actionContainer: { marginTop: 30, backgroundColor: "#fff", padding: 20, borderRadius: 16, alignItems: "center", elevation: 4 },
  confirmPrompt: { fontSize: 16, fontWeight: "600", marginBottom: 16, color: "#333" },
  actionButtons: { flexDirection: "row", width: "100%", gap: 10 },
  cancelBtn: { flex: 1, padding: 14, borderRadius: 10, backgroundColor: "#F3F4F6", alignItems: "center" },
  cancelText: { color: "#4B5563", fontWeight: "700" },
  confirmBtn: { flex: 1, padding: 14, borderRadius: 10, backgroundColor: "#007AFF", alignItems: "center" },
  confirmText: { color: "#fff", fontWeight: "700" },
});