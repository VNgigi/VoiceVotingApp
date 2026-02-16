import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Speech from "expo-speech";
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from "expo-speech-recognition";
import { collection, getDocs } from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { db } from "../firebaseConfig";

// --- THEME Colours ---
const PRIMARY_COLOR = "#4F46E5"; 
const SECONDARY_COLOR = "#10B981"; 
const BG_COLOR = "#F9FAFB"; 
const TEXT_COLOR = "#1F2937"; 
const BAR_BG = "#E5E7EB"; 

// --- SORT ORDER ---
const POSITION_ORDER = [
  "President",
  "Vice President",
  "Secretary General",
  "Treasurer",
  "Gender and Disability Representative",
  "Sports, Entertainment and Security Secretary"
];

interface CandidateResult {
  name: string;
  votes: number;
}

interface PositionResult {
  position: string;
  candidates: CandidateResult[];
}

export default function Results() {
  const router = useRouter();
  
  // --- STATE ---
  const [results, setResults] = useState<PositionResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Voice State
  const [listening, setListening] = useState(false);
  const [statusText, setStatusText] = useState("Loading...");
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // --- 1. INITIAL FETCH ---
  useEffect(() => {
    fetchResults();
    return () => {
      stopEverything();
    };
  }, []);

  // --- ANIMATION (Crash Proof) ---
  useEffect(() => {
    if (listening) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.2, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true })
        ])
      ).start();
    } else {
      //  Stop animation before resetting
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [listening]);

  const fetchResults = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, "votes"));
      let fetchedData: PositionResult[] = [];

      querySnapshot.forEach((doc) => {
        const position = doc.id;
        const data = doc.data();
        const candidatesArray: CandidateResult[] = Object.entries(data).map(
          ([name, voteCount]) => ({ name, votes: Number(voteCount) })
        );
        // Sort candidates by highest votes first
        candidatesArray.sort((a, b) => b.votes - a.votes);
        fetchedData.push({ position, candidates: candidatesArray });
      });

      // --- CUSTOM SORT LOGIC ---
      fetchedData.sort((a, b) => {
        const indexA = POSITION_ORDER.indexOf(a.position);
        const indexB = POSITION_ORDER.indexOf(b.position);

        // If both are in the known list, sort by index
        if (indexA !== -1 && indexB !== -1) {
          return indexA - indexB;
        }
        // If A is in list but B is not, A comes first
        if (indexA !== -1) return -1;
        // If B is in list but A is not, B comes first
        if (indexB !== -1) return 1;
        // If neither are in list, sort alphabetically
        return a.position.localeCompare(b.position);
      });

      setResults(fetchedData);
      
      Speech.speak("Results loaded. Say Read All, or name a position.", {
          onDone: () => { startListening(); }
      });

    } catch (error) {
      console.error("Error fetching results:", error);
      setStatusText("Error fetching data.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    stopEverything();
    fetchResults();
  };

  const stopEverything = () => {
    Speech.stop();
    ExpoSpeechRecognitionModule.stop();
    setListening(false);
  };

  // --- 2. READING LOGIC ---
  const readResultsAloud = (data: PositionResult[]) => {
    stopEverything();
    setStatusText("Reading Results...");

    if (data.length === 0) {
      Speech.speak("No votes have been cast yet.", { onDone: () => { startListening(); } });
      return;
    }

    Speech.speak("Here are the full election results.");

    data.forEach((item) => {
      const winner = item.candidates[0];
      if (winner) {
        Speech.speak(`For ${item.position}, the leader is ${winner.name}, with ${winner.votes} votes.`);
      } else {
        Speech.speak(`For ${item.position}, there are no votes.`);
      }
    });

    Speech.speak("End of list. Say Read Again, or Go Home.", {
        onDone: () => { startListening(); }
    });
  };

  const readSpecificPosition = (posName: string) => {
    const target = results.find(r => r.position === posName);
    
    if (target) {
        Speech.speak(`Results for ${target.position}.`);
        target.candidates.forEach((c) => {
            Speech.speak(`${c.name} has ${c.votes} votes.`);
        });
        Speech.speak("Finished reading. Say Read All, or Go Home", { 
            onDone: () => { startListening(); } 
        });
    } else {
        Speech.speak("I couldn't find that position.", { 
            onDone: () => { startListening(); } 
        });
    }
  };

  // --- 3. VOICE LISTENER ---
  const startListening = async () => {
    const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!result.granted) {
        Alert.alert("Permission needed", "Please enable microphone access.");
        return;
    }

    try {
        ExpoSpeechRecognitionModule.start({
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
            handleVoiceCommand(text);
        }
    }
  });

  useSpeechRecognitionEvent("end", () => setListening(false));

  // --- 4. COMMAND HANDLER ---
  const handleVoiceCommand = (text: string) => {
    const cmd = text.toLowerCase();
    stopEverything(); 

    if (cmd.includes("home") || cmd.includes("back") || cmd.includes("menu")) {
        Speech.speak("Going home.", {
            onDone: () => { router.back(); }
        });
        return;
    } 
    
    if (cmd.includes("refresh") || cmd.includes("reload")) {
        onRefresh();
        return;
    }

    if (cmd.includes("read all") || cmd.includes("read everything")) {
        readResultsAloud(results);
        return;
    }

    const matches = results.filter(r => {
        const positionTitle = r.position.toLowerCase();
        if (cmd.includes(positionTitle)) return true;
        const words = positionTitle.split(" ");
        return words.some(word => word.length > 3 && cmd.includes(word));
    });

    if (matches.length > 0) {
        matches.sort((a, b) => b.position.length - a.position.length);
        readSpecificPosition(matches[0].position);
    } else {
        Speech.speak("I didn't catch that. Say Read All, Go Home, or name a position.", {
            onDone: () => { startListening(); }
        });
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={PRIMARY_COLOR} />
        <Text style={styles.loadingText}>Tallying Votes...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={BG_COLOR} />
      
      {/* --- HEADER --- */}
      <View style={styles.header}>
          <Text style={styles.headerTitle}>Live Results</Text>
          <TouchableOpacity onPress={onRefresh} style={styles.refreshBtn}>
              <Ionicons name="refresh" size={20} color={PRIMARY_COLOR} />
          </TouchableOpacity>
      </View>

      <FlatList
        data={results}
        keyExtractor={(item) => item.position}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[PRIMARY_COLOR]} />
        }
        renderItem={({ item }) => {
            const totalVotes = item.candidates.reduce((sum, c) => sum + c.votes, 0);

            return (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                    <Text style={styles.positionTitle}>{item.position}</Text>
                    <View style={styles.totalBadge}>
                        <Text style={styles.totalText}>{totalVotes} Total</Text>
                    </View>
                </View>
                
                {item.candidates.length > 0 ? (
                  item.candidates.map((candidate, index) => {
                    const percentage = totalVotes > 0 ? (candidate.votes / totalVotes) * 100 : 0;
                    const isWinner = index === 0;

                    return (
                        <View key={index} style={styles.rowWrapper}>
                             <View style={styles.rowTop}>
                                <Text style={[styles.candidateName, isWinner && styles.winnerText]}>
                                   {isWinner && "🏆 "} {candidate.name}
                                </Text>
                                <Text style={[styles.voteCount, isWinner && styles.winnerVote]}>
                                    {candidate.votes} ({percentage.toFixed(0)}%)
                                </Text>
                             </View>
                             
                             <View style={styles.progressBarBg}>
                                 <View style={[
                                     styles.progressBarFill, 
                                     { width: `${percentage}%`, backgroundColor: isWinner ? SECONDARY_COLOR : PRIMARY_COLOR, opacity: isWinner ? 1 : 0.6 }
                                 ]} />
                             </View>
                        </View>
                    );
                  })
                ) : (
                  <View style={styles.emptyState}>
                      <Ionicons name="file-tray-outline" size={20} color="#9CA3AF" />
                      <Text style={styles.noVotes}>No votes cast yet.</Text>
                  </View>
                )}
              </View>
            );
        }}
      />

      {/* --- FLOATING STATUS & MIC  --- */}
      {/* */}
      <View style={styles.floatingContainer} collapsable={false}>
         <View style={styles.statusPill}>
             <View style={[styles.statusDot, listening && styles.statusDotActive]} />
             <Text style={styles.footerText} numberOfLines={1}>{statusText}</Text>
         </View>

         <TouchableOpacity 
             onPress={() => listening ? stopEverything() : startListening()}
             style={[styles.micButton, listening && styles.micActive]}
             activeOpacity={0.8}
         >
             {/*  */}
             <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                <Ionicons name={listening ? "mic" : "mic-off"} size={24} color="#fff" />
             </Animated.View>
         </TouchableOpacity>
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, 
    backgroundColor: BG_COLOR,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: BG_COLOR,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: "#6B7280",
    fontWeight: "500"
  },
  
  // HEADER
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderColor: "#F3F4F6"
  },
  headerTitle: { fontSize: 24, fontWeight: "800", color: TEXT_COLOR, letterSpacing: -0.5 },
  refreshBtn: { padding: 8, backgroundColor: "#EEF2FF", borderRadius: 12 },

  // LIST
  listContent: { padding: 20, paddingBottom: 100 },
  
  // CARD
  card: {
    backgroundColor: "white",
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
    borderWidth: 1,
    borderColor: "#F9FAFB"
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  positionTitle: { fontSize: 18, fontWeight: "700", color: TEXT_COLOR, flex: 1 },
  totalBadge: { backgroundColor: "#F3F4F6", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  totalText: { fontSize: 12, color: "#6B7280", fontWeight: "600" },

  // ROWS
  rowWrapper: { marginBottom: 16 },
  rowTop: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  candidateName: { fontSize: 15, color: "#4B5563", fontWeight: "600" },
  winnerText: { color: TEXT_COLOR, fontWeight: "800" },
  voteCount: { fontSize: 14, fontWeight: "600", color: "#6B7280" },
  winnerVote: { color: SECONDARY_COLOR },
  
  // PROGRESS BAR
  progressBarBg: { height: 6, backgroundColor: BAR_BG, borderRadius: 3, overflow: 'hidden' },
  progressBarFill: { height: '100%', borderRadius: 3 },
  
  // EMPTY
  emptyState: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  noVotes: { fontStyle: "italic", color: "#9CA3AF" },
  
  // FOOTER UI
  floatingContainer: {
      position: 'absolute', bottom: 30, left: 24, right: 24,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  statusPill: {
      flex: 1, flexDirection: 'row', alignItems: 'center',
      backgroundColor: "rgba(255,255,255,0.95)", 
      paddingHorizontal: 16, paddingVertical: 12,
      borderRadius: 30, marginRight: 16,
      shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 10, elevation: 5,
      borderWidth: 1, borderColor: "#E5E7EB"
  },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#D1D5DB", marginRight: 10 },
  statusDotActive: { backgroundColor: "#EF4444" },
  footerText: { fontSize: 14, color: "#4B5563", fontWeight: "600" },
  
  micButton: {
      width: 56, height: 56, borderRadius: 28, 
      backgroundColor: TEXT_COLOR,
      justifyContent: 'center', alignItems: 'center',
      shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 10, elevation: 10
  },
  micActive: { backgroundColor: "#EF4444" }
});