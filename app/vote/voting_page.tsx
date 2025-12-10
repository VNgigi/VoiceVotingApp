import Voice from "@react-native-voice/voice";
import { useRouter } from "expo-router";
import * as Speech from "expo-speech";
import { collection, doc, getDocs, increment, query, setDoc } from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { db } from "../../firebaseConfig"; // Check your path

// Define types for our data
interface Candidate {
  id: string;
  name: string;
  photoUri?: string;
  briefInfo?: string; // e.g. Party Name
  [key: string]: any;
}

interface ElectionPosition {
  position: string;
  candidates: Candidate[];
}

export default function VotingScreen() {
  const router = useRouter();

  // --- State ---
  const [positionsData, setPositionsData] = useState<ElectionPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  
  // Voice & Selection State
  const [listening, setListening] = useState(false);
  const [recognizedText, setRecognizedText] = useState("");
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [step, setStep] = useState<"selecting" | "confirming">("selecting");
  const [errorMessage, setErrorMessage] = useState("");

  // --- Refs (Crucial for Voice Listeners to see latest state) ---
  const positionsRef = useRef<ElectionPosition[]>([]);
  const indexRef = useRef(0);
  const stepRef = useRef("selecting");
  const selectedRef = useRef<Candidate | null>(null);

  // Sync State to Refs
  useEffect(() => { positionsRef.current = positionsData; }, [positionsData]);
  useEffect(() => { indexRef.current = currentIndex; }, [currentIndex]);
  useEffect(() => { stepRef.current = step; }, [step]);
  useEffect(() => { selectedRef.current = selectedCandidate; }, [selectedCandidate]);

  // --- 1. Fetch Data on Mount ---
  useEffect(() => {
    const fetchData = async () => {
      try {
        const q = query(collection(db, "contestants"));
        const snapshot = await getDocs(q);
        const rawList: Candidate[] = [];
        
        snapshot.forEach((doc) => {
           rawList.push({ id: doc.id, ...doc.data() } as Candidate);
        });

        // Group by Position
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
  }, []);

  // Helper to group data
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

  // --- 2. Voice Setup ---
  useEffect(() => {
    Voice.onSpeechStart = () => setListening(true);
    Voice.onSpeechEnd = () => setListening(false);
    Voice.onSpeechError = (e: any) => {
        console.error("Voice Error:", e);
        setErrorMessage(e.error?.message || "Voice error");
        setListening(false);
    };
    
    // The Core Logic
    Voice.onSpeechResults = (e: any) => {
      const text = e.value?.[0] || "";
      setRecognizedText(text);
      processVoiceLogic(text);
    };

    return () => {
      Voice.destroy().then(Voice.removeAllListeners);
      Speech.stop();
    };
  }, []);

  // Speak prompt when index changes
  useEffect(() => {
    if (!loading && positionsData.length > 0) {
      speakPrompt();
    }
  }, [currentIndex, loading, positionsData]);

  const speakPrompt = () => {
    Speech.stop();
    // Safety check
    const currentPos = positionsData[currentIndex];
    if (!currentPos) return;

    const names = currentPos.candidates.map(c => c.name).join(", ");
    Speech.speak(`Voting for ${currentPos.position}. Candidates are: ${names}. Say a name to select.`);
  };

  // --- 3. Voice Logic ---
  const processVoiceLogic = (text: string) => {
    const clean = text.toLowerCase().trim();
    
    // Use REFS to get current state inside the callback
    const currentStep = stepRef.current;
    const currentPos = positionsRef.current[indexRef.current];

    if (!currentPos) return;

    if (currentStep === "selecting") {
      // Find candidate name in speech
      const match = currentPos.candidates.find(c => 
        c.name.toLowerCase().includes(clean) || clean.includes(c.name.toLowerCase())
      );

      if (match) {
        handleSelectCandidate(match);
      } else {
        Speech.speak("I didn't catch that name. Please try again.");
      }

    } else if (currentStep === "confirming") {
      if (clean.includes("confirm") || clean.includes("yes") || clean.includes("submit")) {
        submitVote();
      } else if (clean.includes("cancel") || clean.includes("no") || clean.includes("change")) {
        cancelSelection();
      } else {
        Speech.speak("Please say Confirm or Cancel.");
      }
    }
  };

  const handleSelectCandidate = (candidate: Candidate) => {
    setSelectedCandidate(candidate);
    setStep("confirming");
    Speech.speak(`You selected ${candidate.name}. Say Confirm to vote.`);
  };

  const cancelSelection = () => {
    setSelectedCandidate(null);
    setStep("selecting");
    setRecognizedText("");
    Speech.speak("Selection cleared. Please select a candidate.");
  };

  const submitVote = async () => {
    const candidate = selectedRef.current;
    const currentPos = positionsRef.current[indexRef.current];
    
    if (!candidate || !currentPos) return;

    try {
      // Save vote to Firestore
      const voteRef = doc(db, "votes", currentPos.position);
      // We use the candidate's name as the key for counting
      await setDoc(voteRef, { [candidate.name]: increment(1) }, { merge: true });

      Speech.speak(`Vote for ${candidate.name} confirmed.`);

      // Move to next or finish
      if (indexRef.current < positionsRef.current.length - 1) {
        setTimeout(() => {
          setSelectedCandidate(null);
          setRecognizedText("");
          setStep("selecting");
          setCurrentIndex(prev => prev + 1);
        }, 1500);
      } else {
        Speech.speak("All votes cast. Thank you.");
        router.replace("/results"); // Ensure this route exists!
      }

    } catch (e) {
      console.error(e);
      Speech.speak("Error recording vote. Please try again.");
      Alert.alert("Error", "Could not record vote.");
    }
  };

  const startListening = async () => {
    setErrorMessage("");
    if (Platform.OS === 'android') {
       const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
       if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
         Alert.alert("Permission Denied", "Microphone needed.");
         return;
       }
    }
    try {
      await Voice.start("en-US");
    } catch (e) {
      console.error(e);
    }
  };

  // --- RENDER ---
  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#007AFF"/></View>;
  if (positionsData.length === 0) return <View style={styles.center}><Text>No elections found.</Text></View>;

  const currentPosition = positionsData[currentIndex];

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Voice Vote</Text>
        <Text style={styles.stepIndicator}>
          Position {currentIndex + 1} of {positionsData.length}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.positionTitle}>{currentPosition.position}</Text>

        {/* Candidate List */}
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
                  <View style={styles.checkmarkBadge}>
                    <Text style={styles.checkmark}>✓</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Voice Feedback Section */}
        <View style={styles.voiceSection}>
          <TouchableOpacity 
            style={[styles.micButton, listening && styles.micButtonActive]} 
            onPress={startListening}
          >
            <Text style={styles.micIcon}>{listening ? "👂" : "🎤"}</Text>
          </TouchableOpacity>
          <Text style={styles.micLabel}>
            {listening ? "Listening..." : "Tap to Speak"}
          </Text>
          
          {recognizedText ? (
            <Text style={styles.recognizedText}>Heard: "{recognizedText}"</Text>
          ) : null}
        </View>

        {/* Confirm / Cancel Actions (Manual) */}
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
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 12,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "transparent",
    // Shadow
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  cardSelected: {
    borderColor: "#007AFF",
    backgroundColor: "#F0F9FF",
  },
  avatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: "#eee" },
  cardInfo: { marginLeft: 16, flex: 1 },
  name: { fontSize: 18, fontWeight: "700", color: "#333" },
  nameSelected: { color: "#007AFF" },
  party: { fontSize: 14, color: "#666", marginTop: 2 },
  
  checkmarkBadge: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: "#007AFF",
    justifyContent: "center", alignItems: "center", marginLeft: 10
  },
  checkmark: { color: "#fff", fontWeight: "bold", fontSize: 14 },

  voiceSection: { marginTop: 30, alignItems: "center" },
  micButton: {
    width: 70, height: 70, borderRadius: 35, backgroundColor: "#1A4A7A",
    justifyContent: "center", alignItems: "center",
    shadowColor: "#007AFF", shadowOpacity: 0.3, shadowRadius: 10, elevation: 5
  },
  micButtonActive: { backgroundColor: "#ef4444", transform: [{scale: 1.1}] },
  micIcon: { fontSize: 32 },
  micLabel: { marginTop: 10, fontSize: 14, color: "#666", fontWeight: "600" },
  recognizedText: { marginTop: 8, fontSize: 16, color: "#333", fontStyle: "italic" },

  actionContainer: { marginTop: 30, backgroundColor: "#fff", padding: 20, borderRadius: 16, alignItems: "center", elevation: 4 },
  confirmPrompt: { fontSize: 16, fontWeight: "600", marginBottom: 16, color: "#333" },
  actionButtons: { flexDirection: "row", width: "100%", gap: 10 },
  cancelBtn: { flex: 1, padding: 14, borderRadius: 10, backgroundColor: "#F3F4F6", alignItems: "center" },
  cancelText: { color: "#4B5563", fontWeight: "700" },
  confirmBtn: { flex: 1, padding: 14, borderRadius: 10, backgroundColor: "#007AFF", alignItems: "center" },
  confirmText: { color: "#fff", fontWeight: "700" },
});