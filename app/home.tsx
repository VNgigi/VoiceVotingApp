import { useFocusEffect, useRouter } from "expo-router";
import * as Speech from "expo-speech";
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from "expo-speech-recognition";
import { getAuth, signOut } from "firebase/auth";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";

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
      let timer: any; // FIX: Changed type to 'any' to accept React Native's timer ID

      // 1. Setup User
      if (user) {
        const name = user.displayName || user.email?.split("@")[0] || "Voter";
        setDisplayName(name);
        
        // 2. Start Intro Sequence (Delayed slightly for smooth transition)
        timer = setTimeout(() => {
            runIntroSequence(name);
        }, 1000);
      }

      // 3. Cleanup (Runs when you leave the page)
      return () => {
        clearTimeout(timer);
        stopEverything();
      };
    }, [user]) // Re-run only if user changes (or on focus)
  );

  const stopEverything = () => {
    Speech.stop();
    ExpoSpeechRecognitionModule.stop();
    setListening(false);
  };

  // SPEAK THEN LISTEN SEQUENCE ---
  const runIntroSequence = (name: string) => {
    stopEverything(); // Ensure clean slate
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
        setStatusText("Listening... (Say a command)");
    } catch (e) {
        console.error("Mic Error", e);
    }
  };

  // Handle incoming voice results
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

  // NAVIGATION LOGIC ---
  const handleVoiceCommand = (text: string) => {
    const cmd = text.toLowerCase();
    
    stopEverything(); // Stop mic before moving

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
    else if (cmd.includes("log out") || cmd.includes("sign out")) {
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
      <StatusBar barStyle="dark-content" backgroundColor="#f8f9fa" />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.profileLabel}>Signed in as:</Text>
          <Text style={styles.profileName}>{displayName || "Voter"}</Text>
        </View>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutText}>🚪 Logout</Text>
        </TouchableOpacity>
      </View>

      {/* Main Content */}
      <View style={styles.content}>
        <Text style={styles.title}>Main Menu</Text>
        
        {/* Dynamic Status Text */}
        <Text style={[styles.statusText, listening ? styles.statusActive : null]}>
            {statusText}
        </Text>

        {/* Menu Buttons */}
        <TouchableOpacity style={styles.button} onPress={() => speakAndNavigate("Voting", "../vote/voting_page")}>
          <Text style={styles.buttonText}>🗳️ Start Voting</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.button, styles.secondaryButton]} onPress={() => speakAndNavigate("Contestants", "../vote/contestants")}>
          <Text style={styles.buttonText}>👥 View Contestants</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.button, styles.resultsButton]} onPress={() => speakAndNavigate("Results", "../results")}>
          <Text style={styles.buttonText}>📊 View Results</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.button, styles.applyButton]} onPress={() => speakAndNavigate("Apply", "../vote/apply")}>
          <Text style={styles.buttonText}>📝 Application page</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.button, styles.feedbackButton]} onPress={() => speakAndNavigate("Feedback", "../feedback/report")}>
          <Text style={styles.buttonText}>📢 Give Feedback</Text>
        </TouchableOpacity>

      </View>

      {/* Floating Mic Button (Manual Override) */}
      <TouchableOpacity 
        style={[styles.fab, listening ? styles.fabActive : null]} 
        onPress={() => {
             if (listening) {
                 stopEverything();
                 setStatusText("Mic Stopped.");
             } else {
                 startListening();
             }
        }}
        activeOpacity={0.8}
      >
         <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <Text style={styles.fabIcon}>{listening ? "👂" : "🎤"}</Text>
         </Animated.View>
      </TouchableOpacity>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8f9fa" },
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 20, paddingTop: 40, paddingBottom: 20,
    backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#eee",
  },
  profileLabel: { fontSize: 12, color: "#666" },
  profileName: { fontSize: 18, fontWeight: "bold", color: "#333" },
  logoutButton: {
    backgroundColor: "#FFEBEE", paddingVertical: 8, paddingHorizontal: 12,
    borderRadius: 20, borderWidth: 1, borderColor: "#FFCDD2",
  },
  logoutText: { color: "#D32F2F", fontWeight: "600", fontSize: 14 },
  
  content: { flex: 1, alignItems: "center", padding: 24 },
  title: { fontSize: 22, fontWeight: "bold", marginBottom: 10, color: "#1A1A1A" },
  
  statusText: { 
    fontSize: 16, fontStyle: "italic", color: "#666", marginBottom: 20, 
    textAlign: "center", height: 24 
  },
  statusActive: { color: "#007AFF", fontWeight: "bold" },

  button: {
    backgroundColor: "#007AFF", padding: 18, borderRadius: 12, marginVertical: 6,
    width: "100%", alignItems: "center", elevation: 2,
  },
  secondaryButton: { backgroundColor: "#34C759" },
  resultsButton: { backgroundColor: "#FF9500" },
  applyButton: { backgroundColor: "#9b59b6" },
  feedbackButton: { backgroundColor: "#5f591fff" },
  buttonText: { color: "white", fontWeight: "700", fontSize: 18 },

  fab: {
    position: 'absolute', bottom: 30, right: 30,
    width: 70, height: 70, borderRadius: 35,
    backgroundColor: '#007AFF', justifyContent: 'center', alignItems: 'center',
    elevation: 6,
  },
  fabActive: { backgroundColor: '#FF3B30' },
  fabIcon: { fontSize: 30 },
});