import { Ionicons } from "@expo/vector-icons"; // Added for modern icons
import { useRouter } from "expo-router";
import * as Speech from "expo-speech";
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from "expo-speech-recognition";
import { getAuth } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  query,
  runTransaction
} from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Image,
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
  photoUrl?: string; 
  photoUri?: string; 
  briefInfo?: string; 
  position?: string;
  [key: string]: any;
}

interface ElectionPosition {
  position: string;
  candidates: Candidate[];
}

const { width } = Dimensions.get('window');
const ACTIVE_COLOR = "#4F46E5"; // Indigo 600
const BG_COLOR = "#F9FAFB"; // Slate 50

export default function VotingScreen() {
  const router = useRouter();
  const auth = getAuth();
  const user = auth.currentUser;

  // --- STATE ---
  const [positionsData, setPositionsData] = useState<ElectionPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  
  // Voice & Selection
  const [listening, setListening] = useState(false);
  const [recognizedText, setRecognizedText] = useState("");
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [step, setStep] = useState<"selecting" | "confirming">("selecting");
  
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // --- REFS ---
  const positionsRef = useRef<ElectionPosition[]>([]);
  const indexRef = useRef(0);
  const stepRef = useRef("selecting");
  const selectedRef = useRef<Candidate | null>(null);
  
  const isIntentionalStop = useRef(false); 
  const retryCount = useRef(0);

  // Sync State to Refs
  useEffect(() => { positionsRef.current = positionsData; }, [positionsData]);
  useEffect(() => { indexRef.current = currentIndex; }, [currentIndex]);
  useEffect(() => { stepRef.current = step; }, [step]);
  useEffect(() => { selectedRef.current = selectedCandidate; }, [selectedCandidate]);

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

  // --- 1. SETUP ---
  useEffect(() => {
    if (!user) {
        Alert.alert("Error", "You must be logged in to vote.");
        router.replace("/");
        return;
    }

    const setup = async () => {
      const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!result.granted) {
        Alert.alert("Permission Denied", "Microphone access is required for voice voting.");
      }
    };
    setup();

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

    return () => {
        stopEverything();
    };
  }, []);

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
    
    const result = order
      .filter(pos => groups[pos] && groups[pos].length > 0)
      .map(pos => ({ position: pos, candidates: groups[pos] }));
      
    Object.keys(groups).forEach(k => {
        if(!order.includes(k)) result.push({ position: k, candidates: groups[k] });
    });
    
    return result;
  };

  // --- 2. VOICE LISTENER ---
  useSpeechRecognitionEvent("result", (event) => {
    const text = event.results[0]?.transcript;
    if (text) {
        setRecognizedText(text);
        if (event.isFinal) {
            isIntentionalStop.current = true;
            processVoiceLogic(text);
        }
    }
  });

  useSpeechRecognitionEvent("start", () => setListening(true));

  useSpeechRecognitionEvent("end", () => {
    setListening(false);
    if (!isIntentionalStop.current) {
        handleSilenceOrError();
    }
  });

  useSpeechRecognitionEvent("error", (event) => {
      if (!isIntentionalStop.current) {
          handleSilenceOrError();
      }
  });

  const handleSilenceOrError = () => {
      if (retryCount.current < 2) {
          retryCount.current += 1;
          Speech.speak("I didn't hear anything. Please say a name, Skip, or Go Back.", {
              onDone: () => { startListening(); }
          });
      } else {
          Speech.speak("Mic turned off. Tap the button to try again.");
          isIntentionalStop.current = true;
      }
  };

  // --- 3. AUTO-PROMPT ---
  useEffect(() => {
    if (!loading && positionsData.length > 0) {
      checkIfAlreadyVotedAndStart();
    }
  }, [currentIndex, loading, positionsData]);

  const checkIfAlreadyVotedAndStart = async () => {
      const currentPos = positionsData[currentIndex];
      if (!currentPos || !user) return;

      stopEverything();

      try {
          const userVoteRef = doc(db, "user_votes", user.uid);
          const docSnap = await getDoc(userVoteRef);

          if (docSnap.exists() && docSnap.data()[currentPos.position] === true) {
              Speech.speak(`You have already voted for ${currentPos.position}. Moving to next.`, {
                  onDone: () => { moveToNextPosition(); }
              });
          } else {
              speakPromptAndListen();
          }
      } catch (e) {
          console.error("Error checking vote status", e);
          speakPromptAndListen();
      }
  };

  const speakPromptAndListen = () => {
    stopEverything();
    const currentPos = positionsData[currentIndex];
    if (!currentPos) return;

    if (step === "selecting") {
        const names = currentPos.candidates.map(c => c.name).join(", ");
        const prompt = `Voting for ${currentPos.position}. Candidates are: ${names}. Say a name, Skip, or Go Back.`;
        
        Speech.speak(prompt, {
            onDone: () => { 
                retryCount.current = 0; 
                startListening(); 
            },
            onError: () => console.log("Speech Error")
        });
    }
  };

  const startListening = () => {
    isIntentionalStop.current = false;
    ExpoSpeechRecognitionModule.stop();
    setRecognizedText("");
    ExpoSpeechRecognitionModule.start({
        lang: "en-US",
        interimResults: true, 
        maxAlternatives: 1,
    });
  };

  const stopEverything = () => {
    isIntentionalStop.current = true;
    Speech.stop();
    ExpoSpeechRecognitionModule.stop();
    setListening(false);
  };

  // --- 4. LOGIC PROCESSING ---
  const processVoiceLogic = (text: string) => {
    const clean = text.toLowerCase().trim();
    const currentStep = stepRef.current;
    const currentPos = positionsRef.current[indexRef.current];

    if (!currentPos) return;
    
    stopEverything();
    retryCount.current = 0;

    if (currentStep === "selecting") {
      if (clean.includes("back") || clean.includes("return") || clean.includes("home")) {
        Speech.speak("Going back.", { onDone: () => { router.back(); } });
        return;
      }
      if (clean.includes("skip") || clean.includes("next") || clean.includes("pass")) {
        handleSkip();
        return;
      }

      const match = currentPos.candidates.find(c => 
        c.name.toLowerCase().includes(clean) || clean.includes(c.name.toLowerCase())
      );

      if (match) {
        handleSelectCandidate(match);
      } else {
        Speech.speak("I didn't catch a valid name. Say the name again, Skip, or Go Back.", {
            onDone: () => { startListening(); }
        });
      }
    } else if (currentStep === "confirming") {
      if (clean.includes("confirm") || clean.includes("yes") || clean.includes("vote")) {
        submitVote();
      } else if (clean.includes("cancel") || clean.includes("no")) {
        cancelSelection();
      } else {
        Speech.speak("Please say Confirm or Cancel.", {
            onDone: () => { startListening(); }
        });
      }
    }
  };

  // --- 5. ACTIONS ---
  const handleSkip = () => {
    Speech.speak("Skipping position.", { onDone: () => moveToNextPosition() });
  };

  const moveToNextPosition = () => {
    if (indexRef.current < positionsRef.current.length - 1) {
      setSelectedCandidate(null);
      setRecognizedText("");
      setStep("selecting");
      setCurrentIndex(prev => prev + 1);
    } else {
      Speech.speak("All voting complete. Submitting results.");
      router.replace("/results");
    }
  };

  const handleSelectCandidate = (candidate: Candidate) => {
    setSelectedCandidate(candidate);
    setStep("confirming");
    Speech.speak(`You selected ${candidate.name}. Say Confirm to vote, or Cancel.`, {
        onDone: () => { startListening(); }
    });
  };

  const cancelSelection = () => {
    setSelectedCandidate(null);
    setStep("selecting");
    setRecognizedText("");
    Speech.speak("Selection cleared. Say a name.", {
        onDone: () => { startListening(); }
    });
  };

  const submitVote = async () => {
    const candidate = selectedRef.current;
    const currentPos = positionsRef.current[indexRef.current];
    
    if (!candidate || !currentPos || !user) return;

    try {
      await runTransaction(db, async (transaction) => {
          const userVoteRef = doc(db, "user_votes", user.uid);
          const userVoteDoc = await transaction.get(userVoteRef);

          if (userVoteDoc.exists() && userVoteDoc.data()[currentPos.position]) {
              throw "ALREADY_VOTED";
          }
          const voteRef = doc(db, "votes", currentPos.position);
          transaction.set(voteRef, { [candidate.name]: increment(1) }, { merge: true });
          transaction.set(userVoteRef, { [currentPos.position]: true }, { merge: true });
      });

      Speech.speak(`Vote recorded for ${candidate.name}.`);
      moveToNextPosition();

    } catch (e) {
      if (e === "ALREADY_VOTED") {
          Speech.speak("You have already voted for this position.");
          moveToNextPosition();
      } else {
          console.error(e);
          Speech.speak("Error recording vote. Please try again.");
          startListening();
      }
    }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={ACTIVE_COLOR}/></View>;
  if (positionsData.length === 0) return <View style={styles.center}><Text style={styles.emptyText}>No elections active.</Text></View>;

  const currentPosition = positionsData[currentIndex];
  // Calculate Progress
  const progress = ((currentIndex + 1) / positionsData.length) * 100;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      
      {/* --- HEADER --- */}
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
            <Text style={styles.headerTitle}>Voice Vote</Text>
            <View style={styles.progressContainer}>
                <View style={[styles.progressBar, { width: `${progress}%` }]} />
            </View>
        </View>
        <Text style={styles.subHeader}>
             {currentIndex + 1} / {positionsData.length}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.positionTitle}>{currentPosition.position}</Text>
        
        <View style={styles.grid}>
          {currentPosition.candidates.map((candidate) => {
            const isSelected = selectedCandidate?.id === candidate.id;
            const imageSource = (candidate.photoUrl || candidate.photoUri)
              ? { uri: candidate.photoUrl || candidate.photoUri }
              : { uri: `https://ui-avatars.com/api/?name=${candidate.name}&background=random&size=128` };

            return (
              <TouchableOpacity
                key={candidate.id}
                style={[styles.card, isSelected && styles.cardSelected]}
                onPress={() => handleSelectCandidate(candidate)} 
                activeOpacity={0.9}
              >
                <Image source={imageSource} style={styles.avatar} resizeMode="cover" />
                
                <View style={styles.cardInfo}>
                  <Text style={[styles.name, isSelected && styles.nameSelected]}>{candidate.name}</Text>
                  {candidate.briefInfo && (
                      <Text style={styles.party} numberOfLines={1}>{candidate.briefInfo}</Text>
                  )}
                </View>

                {isSelected ? (
                     <Ionicons name="checkmark-circle" size={28} color={ACTIVE_COLOR} />
                ) : (
                    <View style={styles.radioPlaceholder} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {step === "selecting" && (
           <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
             <Text style={styles.skipButtonText}>Skip this Position</Text>
             <Ionicons name="play-skip-forward" size={16} color="#6B7280" style={{marginLeft:8}} />
           </TouchableOpacity>
        )}
      </ScrollView>

      {/* --- FLOATING FOOTER --- */}
      <View style={styles.voiceFooter}>
         {/* LISTENING MODE */}
         {!selectedCandidate && (
             <View style={styles.statusRow}>
                <TouchableOpacity onPress={() => startListening()}>
                    <Animated.View style={[styles.micButton, { transform: [{ scale: pulseAnim }] }]}>
                        <Ionicons name={listening ? "mic" : "mic-off"} size={24} color="#fff" />
                    </Animated.View>
                </TouchableOpacity>
                
                <View style={styles.statusTextContainer}>
                    <Text style={styles.statusTitle}>
                        {listening ? "Listening..." : "Microphone Paused"}
                    </Text>
                    <Text style={styles.statusSub} numberOfLines={1}>
                        {recognizedText ? `"${recognizedText}"` : "Say a name or 'Skip'"}
                    </Text>
                </View>
             </View>
         )}

         {/* CONFIRMATION MODE */}
         {selectedCandidate && step === "confirming" && (
            <View style={styles.confirmContainer}>
                <Text style={styles.confirmHeader}>Confirm Vote?</Text>
                <View style={styles.confirmActions}>
                    <TouchableOpacity style={styles.btnCancel} onPress={cancelSelection}>
                        <Ionicons name="close" size={20} color="#374151" />
                        <Text style={styles.btnCancelText}>Cancel</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity style={styles.btnConfirm} onPress={submitVote}>
                        <Ionicons name="checkmark" size={20} color="#fff" />
                        <Text style={styles.btnConfirmText}>Confirm</Text>
                    </TouchableOpacity>
                </View>
            </View>
         )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // LAYOUT
  container: { flex: 1, backgroundColor: BG_COLOR },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  scrollContent: { padding: 24, paddingBottom: 180 }, // Extra padding for footer
  
  // HEADER
  header: { 
    paddingHorizontal: 24, 
    paddingVertical: 16, 
    backgroundColor: "#fff", 
    borderBottomWidth: 1, 
    borderColor: "#F3F4F6",
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10
  },
  headerTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { fontSize: 24, fontWeight: "800", color: "#111827", letterSpacing: -0.5 },
  subHeader: { fontSize: 13, color: "#6B7280", marginTop: 4, fontWeight: "600" },
  progressContainer: { width: 100, height: 6, backgroundColor: "#E5E7EB", borderRadius: 3, overflow: 'hidden' },
  progressBar: { height: '100%', backgroundColor: ACTIVE_COLOR, borderRadius: 3 },

  // CONTENT
  positionTitle: { 
    fontSize: 20, 
    fontWeight: "700", 
    color: "#374151", 
    marginBottom: 24, 
    marginTop: 8,
    textAlign: "left"
  },
  grid: { gap: 16 },
  
  // CARDS
  card: { 
    flexDirection: "row", 
    backgroundColor: "#fff", 
    borderRadius: 20, 
    padding: 16, 
    alignItems: "center", 
    borderWidth: 1.5, 
    borderColor: "transparent",
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  cardSelected: { 
    borderColor: ACTIVE_COLOR, 
    backgroundColor: "#EEF2FF",
    shadowOpacity: 0.1,
    shadowColor: ACTIVE_COLOR
  },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: "#E5E7EB", borderWidth: 1, borderColor: "#F3F4F6" },
  cardInfo: { marginLeft: 16, flex: 1, justifyContent: 'center' },
  name: { fontSize: 17, fontWeight: "700", color: "#1F2937", marginBottom: 4 },
  nameSelected: { color: ACTIVE_COLOR },
  party: { fontSize: 14, color: "#6B7280", fontWeight: "500" },
  radioPlaceholder: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: "#E5E7EB" },

  // SKIP BUTTON
  skipButton: { 
    marginTop: 32, 
    flexDirection: 'row',
    alignSelf: "center", 
    alignItems: 'center',
    paddingVertical: 12, 
    paddingHorizontal: 24, 
    borderRadius: 30,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E5E7EB"
  },
  skipButtonText: { color: "#6B7280", fontWeight: "600", fontSize: 14 },
  emptyText: { color: "#9CA3AF", fontSize: 16 },

  // FOOTER UI
  voiceFooter: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: 'rgba(255,255,255,0.95)',
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 24,
      paddingBottom: 34, // Safe area
      shadowColor: "#000",
      shadowOffset: { width: 0, height: -5 },
      shadowOpacity: 0.08,
      shadowRadius: 15,
      elevation: 20,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center' },
  micButton: { 
    width: 56, 
    height: 56, 
    borderRadius: 28, 
    backgroundColor: ACTIVE_COLOR, 
    justifyContent: "center", 
    alignItems: "center", 
    shadowColor: ACTIVE_COLOR,
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: {width: 0, height: 4},
    elevation: 8
  },
  statusTextContainer: { marginLeft: 16, flex: 1 },
  statusTitle: { fontSize: 16, fontWeight: "700", color: "#1F2937" },
  statusSub: { fontSize: 14, color: "#6B7280", marginTop: 2 },

  // CONFIRMATION UI
  confirmContainer: { width: '100%' },
  confirmHeader: { fontSize: 18, fontWeight: "700", color: "#1F2937", marginBottom: 16, textAlign: 'center' },
  confirmActions: { flexDirection: 'row', gap: 12 },
  btnCancel: { 
    flex: 1, 
    flexDirection: 'row',
    alignItems: 'center', 
    justifyContent: 'center', 
    backgroundColor: "#F3F4F6", 
    padding: 16, 
    borderRadius: 16,
    gap: 8
  },
  btnConfirm: { 
    flex: 1, 
    flexDirection: 'row',
    alignItems: 'center', 
    justifyContent: 'center', 
    backgroundColor: ACTIVE_COLOR, 
    padding: 16, 
    borderRadius: 16,
    gap: 8,
    shadowColor: ACTIVE_COLOR,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 4}
  },
  btnCancelText: { fontWeight: '700', fontSize: 16, color: "#374151" },
  btnConfirmText: { fontWeight: '700', fontSize: 16, color: "#fff" }
});