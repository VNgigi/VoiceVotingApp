import { Ionicons } from "@expo/vector-icons"; // Added for modern icons
import { useFocusEffect, useRouter } from "expo-router";
import * as Speech from "expo-speech";
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from "expo-speech-recognition";
import { getAuth, signOut } from "firebase/auth";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Dimensions,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";

const { width } = Dimensions.get("window");
const PRIMARY_COLOR = "#4F46E5"; // Indigo 600
const BG_COLOR = "#F9FAFB"; // Slate 50

export default function Home() {
  const auth = getAuth();
  const user = auth.currentUser;
  const router = useRouter();

  // --- STATE ---
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [statusText, setStatusText] = useState("Initializing...");
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // --- FOCUS EFFECT (Runs every time page appears) ---
  useFocusEffect(
    useCallback(() => {
      let timer: any;

      // 1. Setup User
      if (user) {
        const name = user.displayName || user.email?.split("@")[0] || "Voter";
        setDisplayName(name);
        
        // 2. Start Intro Sequence
        timer = setTimeout(() => {
            runIntroSequence(name);
        }, 1000);
      }

      // 3. Cleanup
      return () => {
        clearTimeout(timer);
        stopEverything();
      };
    }, [user]) 
  );

  const stopEverything = () => {
    Speech.stop();
    ExpoSpeechRecognitionModule.stop();
    setListening(false);
  };

  // SPEAK THEN LISTEN SEQUENCE ---
  const runIntroSequence = (name: string) => {
    stopEverything(); 
    setStatusText("System Speaking...");

    Speech.speak(`Welcome, ${name}.`, {
        onDone: () => {
            Speech.speak("You are on the Home Menu. You can say: Start Voting, View contestants, View Results, Application page, Give feedback, Logout, or Replay instructions.", {
                onDone: () => {
                    setStatusText("Your turn to speak...");
                    startListening();
                },
                onError: (e) => console.log("Speech Error", e)
            });
        }
    });
  };

  // VOICE LISTENER ---
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

  // Handle incoming voice results
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

  // NAVIGATION LOGIC ---
  const handleVoiceCommand = (text: string) => {
    const cmd = text.toLowerCase();
    
    stopEverything(); 

    if (cmd.includes("vote") || cmd.includes("start")) {
        speakAndNavigate("Opening Voting Page...", "../vote/voting_page");
    } 
    else if (cmd.includes("contestant") || cmd.includes("candidate")) {
        speakAndNavigate("Showing Contestants...", "../vote/contestants");
    }
    else if (cmd.includes("result") || cmd.includes("score")) {
        speakAndNavigate("Opening Results...", "../results");
    }
    else if (cmd.includes("apply") || cmd.includes("run") || cmd.includes("application")) {
        speakAndNavigate("Opening Candidates Application...", "../vote/apply");
    }
    else if (cmd.includes("feedback") || cmd.includes("report")) {
        speakAndNavigate("Opening Feedback...", "../feedback/report");
    }
    else if (cmd.includes("log out") || cmd.includes("sign out") || cmd.includes("logout") || cmd.includes("exit") || cmd.includes("back")) {
        handleLogout();
    }
    else if (cmd.includes("replay") || cmd.includes("repeat") || cmd.includes("instruction")) {
        runIntroSequence(displayName || "Voter");
    }
    else {
        Speech.speak("I didn't catch that. Please say a command like Start Voting or Logout.", {
           onDone: () => { startListening(); }
        });
    }
  };

  const speakAndNavigate = (message: string, path: string) => {
    Speech.speak(message, {
        onDone: () => {
            // @ts-ignore
            router.push(path);
        }
    });
  };

  const handleLogout = async () => {
    stopEverything();
    await signOut(auth);
    router.replace("/");
  };

  // ANIMATION FOR MIC ---
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


  // RENDER  
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      {/* --- HEADER --- */}
      <View style={styles.header}>
        <View style={styles.userInfo}>
           <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>{displayName ? displayName[0].toUpperCase() : "V"}</Text>
           </View>
           <View>
              <Text style={styles.greeting}>Welcome back,</Text>
              <Text style={styles.username}>{displayName || "Voter"}</Text>
           </View>
        </View>
        
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={24} color="#EF4444" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* --- STATUS PILL --- */}
        <View style={styles.statusContainer}>
             <View style={[styles.statusDot, listening && styles.statusDotActive]} />
             <Text style={styles.statusText}>{statusText}</Text>
        </View>

        {/* --- MAIN ACTION --- */}
        <TouchableOpacity 
            style={styles.heroCard} 
            onPress={() => speakAndNavigate("Voting", "../vote/voting_page")}
            activeOpacity={0.9}
        >
            <View style={styles.heroContent}>
                <View style={styles.heroIconBox}>
                    <Ionicons name="finger-print" size={32} color="#fff" />
                </View>
                <View>
                    <Text style={styles.heroTitle}>Start Voting</Text>
                    <Text style={styles.heroSubtitle}>Cast your ballot now</Text>
                </View>
            </View>
            <Ionicons name="chevron-forward" size={24} color="#fff" style={{opacity: 0.8}} />
        </TouchableOpacity>

        {/* --- GRID MENU --- */}
        <Text style={styles.sectionTitle}>Dashboard</Text>
        
        <View style={styles.gridContainer}>
            <TouchableOpacity style={styles.gridCard} onPress={() => speakAndNavigate("Contestants", "../vote/contestants")}>
                <View style={[styles.iconCircle, { backgroundColor: "#ECFDF5" }]}>
                     <Ionicons name="people" size={24} color="#10B981" />
                </View>
                <Text style={styles.gridTitle}>Contestants</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.gridCard} onPress={() => speakAndNavigate("Results", "../results")}>
                <View style={[styles.iconCircle, { backgroundColor: "#FFF7ED" }]}>
                     <Ionicons name="stats-chart" size={24} color="#F97316" />
                </View>
                <Text style={styles.gridTitle}>Results</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.gridCard} onPress={() => speakAndNavigate("Apply", "../vote/apply")}>
                <View style={[styles.iconCircle, { backgroundColor: "#F3E8FF" }]}>
                     <Ionicons name="document-text" size={24} color="#A855F7" />
                </View>
                <Text style={styles.gridTitle}>Apply</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.gridCard} onPress={() => speakAndNavigate("Feedback", "../feedback/report")}>
                <View style={[styles.iconCircle, { backgroundColor: "#F0F9FF" }]}>
                     <Ionicons name="chatbox-ellipses" size={24} color="#0EA5E9" />
                </View>
                <Text style={styles.gridTitle}>Feedback</Text>
            </TouchableOpacity>
        </View>

      </ScrollView>

      {/* --- FLOATING MIC --- */}
      <TouchableOpacity 
        style={styles.fabWrapper} 
        onPress={() => {
             if (listening) {
                 stopEverything();
                 setStatusText("Mic Paused");
             } else {
                 startListening();
             }
        }}
        activeOpacity={0.9}
      >
         <Animated.View style={[styles.fab, listening && styles.fabListening, { transform: [{ scale: pulseAnim }] }]}>
            <Ionicons name={listening ? "mic" : "mic-off"} size={28} color="#fff" />
         </Animated.View>
      </TouchableOpacity>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG_COLOR },
  
  // Header
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 24, paddingVertical: 16,
    backgroundColor: "#fff", 
    borderBottomWidth: 1, borderBottomColor: "#F3F4F6",
  },
  userInfo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatarPlaceholder: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: PRIMARY_COLOR, justifyContent: 'center', alignItems: 'center'
  },
  avatarText: { color: "#fff", fontSize: 18, fontWeight: "bold" },
  greeting: { fontSize: 12, color: "#6B7280", fontWeight: "500" },
  username: { fontSize: 16, fontWeight: "bold", color: "#111827" },
  logoutBtn: { padding: 8, backgroundColor: "#FEF2F2", borderRadius: 12 },

  scrollContent: { padding: 24, paddingBottom: 100 },

  // Status Pill
  statusContainer: { 
    flexDirection: 'row', alignItems: 'center', alignSelf: 'center',
    backgroundColor: "#fff", paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 20, marginBottom: 24,
    borderWidth: 1, borderColor: "#E5E7EB",
    shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 4, elevation: 1
  },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#9CA3AF", marginRight: 8 },
  statusDotActive: { backgroundColor: "#EF4444" },
  statusText: { fontSize: 14, color: "#4B5563", fontWeight: "500" },

  // Hero Card
  heroCard: {
    backgroundColor: PRIMARY_COLOR,
    borderRadius: 24, padding: 24,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    shadowColor: PRIMARY_COLOR, shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: {width:0, height:4},
    elevation: 8, marginBottom: 32
  },
  heroContent: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  heroIconBox: { width: 48, height: 48, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.2)", justifyContent: 'center', alignItems: 'center' },
  heroTitle: { fontSize: 20, fontWeight: "bold", color: "#fff" },
  heroSubtitle: { fontSize: 13, color: "rgba(255,255,255,0.8)" },

  // Grid
  sectionTitle: { fontSize: 18, fontWeight: "700", color: "#374151", marginBottom: 16 },
  gridContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  gridCard: {
    width: (width - 48 - 16) / 2, // (Screen - Padding - Gap) / 2
    backgroundColor: "#fff", borderRadius: 20, padding: 20,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: {width:0, height:2},
    elevation: 2,
    borderWidth: 1, borderColor: "#F3F4F6"
  },
  iconCircle: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  gridTitle: { fontSize: 15, fontWeight: "600", color: "#374151" },

  // Floating Action Button
  fabWrapper: { position: 'absolute', bottom: 32, right: 24, alignItems: 'center', justifyContent: 'center' },
  fab: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: "#1F2937", // Dark Gray
    justifyContent: 'center', alignItems: 'center',
    shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 8, elevation: 8
  },
  fabListening: { backgroundColor: "#EF4444" } // Red when active
});