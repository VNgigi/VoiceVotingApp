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
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { db } from "../firebaseConfig";

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
    
    // Cleanup on unmount
    return () => {
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

  const fetchResults = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, "votes"));
      const fetchedData: PositionResult[] = [];

      querySnapshot.forEach((doc) => {
        const position = doc.id;
        const data = doc.data();
        const candidatesArray: CandidateResult[] = Object.entries(data).map(
          ([name, voteCount]) => ({ name, votes: Number(voteCount) })
        );
        // Sort highest votes first
        candidatesArray.sort((a, b) => b.votes - a.votes);
        fetchedData.push({ position, candidates: candidatesArray });
      });

      setResults(fetchedData);
      
      // Notify user we are ready (Don't read full list yet)
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
    // Find exact match from our data
    const target = results.find(r => r.position === posName);
    
    if (target) {
        Speech.speak(`Results for ${target.position}.`);
        target.candidates.forEach((c) => {
            Speech.speak(`${c.name} has ${c.votes} votes.`);
        });
        Speech.speak("Finished reading the results for that position. Say Read All for the whole results, or specify another position or Go Home to go back", { 
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
        setStatusText("Listening... (Say 'Read President' or 'Go Home')");
    } catch (e) {
        console.error("Mic Error", e);
    }
  };

  useSpeechRecognitionEvent("result", (event) => {
    const text = event.results[0]?.transcript;
    if (text) {
        if(listening) setStatusText(`Heard: "${text}"`);
        if (event.isFinal) {
            handleVoiceCommand(text);
        }
    }
  });

  useSpeechRecognitionEvent("end", () => setListening(false));

  // --- 4. COMMAND HANDLER (SMART MATCHING) ---
  const handleVoiceCommand = (text: string) => {
    const cmd = text.toLowerCase();
    stopEverything(); // Stop listening while processing

    // A. Navigation Commands
    if (cmd.includes("home") || cmd.includes("back") || cmd.includes("menu")) {
        Speech.speak("Going home.", {
            onDone: () => { router.back(); }
        });
        return;
    } 
    
    // B. Refresh Commands
    if (cmd.includes("refresh") || cmd.includes("reload")) {
        onRefresh();
        return;
    }

    // C. Read All Command
    if (cmd.includes("read all") || cmd.includes("read everything")) {
        readResultsAloud(results);
        return;
    }

    // D. SMART POSITION MATCHING
    // Find all positions that might match what the user said
    const matches = results.filter(r => {
        const positionTitle = r.position.toLowerCase();
        
        // 1. Exact phrase match (e.g. user said "Vice President")
        if (cmd.includes(positionTitle)) return true;

        // 2. Keyword match (e.g. user said "Secretary", position is "Secretary General")
        const words = positionTitle.split(" ");
        // Check if any significant word (len > 3) is in the command
        return words.some(word => word.length > 3 && cmd.includes(word));
    });

    if (matches.length > 0) {
        // Sort matches by length (Longest first)
        // This ensures "Vice President" is picked over just "President" if user said "Vice..."
        matches.sort((a, b) => b.position.length - a.position.length);
        
        // Read the best match
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
        <ActivityIndicator size="large" color="#1E6BB8" />
        <Text style={styles.loadingText}>Tallying Votes...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>🗳️ Live Election Results</Text>
      
      <FlatList
        data={results}
        keyExtractor={(item) => item.position}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.positionTitle}>{item.position}</Text>
            
            {item.candidates.length > 0 ? (
              item.candidates.map((candidate, index) => (
                <View key={index} style={styles.row}>
                  <Text style={[
                    styles.candidateName, 
                    index === 0 && styles.winnerText
                  ]}>
                    {index + 1}. {candidate.name} {index === 0 ? "🏆" : ""}
                  </Text>
                  <Text style={styles.voteCount}>{candidate.votes} votes</Text>
                </View>
              ))
            ) : (
              <Text style={styles.noVotes}>No votes cast yet.</Text>
            )}
          </View>
        )}
      />

      {/* --- STATUS FOOTER --- */}
      <View style={styles.footerBar}>
          <Text style={styles.footerText}>{statusText}</Text>
          <TouchableOpacity 
             onPress={() => listening ? stopEverything() : startListening()}
             style={styles.micButton}
          >
             <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                <Text style={{ fontSize: 24 }}>{listening ? "🛑" : "🎤"}</Text>
             </Animated.View>
          </TouchableOpacity>
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, 
    backgroundColor: "#F4F7FB",
    paddingTop: 50,
    paddingHorizontal: 20,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F4F7FB",
  },
  header: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#1A4A7A",
    textAlign: "center",
    marginBottom: 20,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: "#666",
  },
  card: {
    backgroundColor: "white",
    padding: 20,
    borderRadius: 15,
    marginBottom: 15,
    elevation: 3, 
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  positionTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#1E6BB8",
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    paddingBottom: 5,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  candidateName: {
    fontSize: 16,
    color: "#333",
    fontWeight: "500",
  },
  winnerText: {
    fontWeight: "bold",
    color: "#2E8B57", // SeaGreen for winner
  },
  voteCount: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#1A4A7A",
  },
  noVotes: {
    fontStyle: "italic",
    color: "#999",
    marginTop: 5,
  },
  
  // Footer Styles
  footerBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#fff', borderTopWidth: 1, borderColor: '#ccc',
    padding: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    elevation: 10
  },
  footerText: { fontSize: 14, color: '#555', fontStyle: 'italic', flex: 1 },
  micButton: {
      width: 50, height: 50, borderRadius: 25, backgroundColor: '#E3F2FD',
      justifyContent: 'center', alignItems: 'center', marginLeft: 10
  }
});