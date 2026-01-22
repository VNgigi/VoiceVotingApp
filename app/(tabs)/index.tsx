import { Ionicons } from "@expo/vector-icons"; // Added for modern icons
import { useFocusEffect, useRouter } from "expo-router";
import * as Speech from "expo-speech";
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from "expo-speech-recognition";
import React, { useCallback, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Dimensions,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";

const { width } = Dimensions.get("window");
const PRIMARY_COLOR = "#4F46E5"; // Indigo 600
const BG_COLOR = "#F9FAFB"; // Slate 50

export default function Index() {
  const router = useRouter();

  // --- STATE ---
  const [listening, setListening] = useState(false);
  const [statusText, setStatusText] = useState("Initializing...");
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // --- 1. START SEQUENCE ON FOCUS ---
  useFocusEffect(
    useCallback(() => {
      let timer: any;

      // Small delay to ensure transition completes
      timer = setTimeout(() => {
        runIntroSequence();
      }, 1000);

      // Cleanup when leaving the screen or losing focus
      return () => {
        clearTimeout(timer);
        stopEverything();
      };
    }, [])
  );

  // --- ANIMATION FOR MIC ---
  React.useEffect(() => {
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

  // --- 2. THE INTRO SEQUENCE ---
  const runIntroSequence = () => {
    stopEverything(); // Clear previous sessions
    setStatusText("System Speaking...");

    Speech.speak("Welcome to the Voice Voting App.", {
        onDone: () => {
            Speech.speak("Please say Login to enter, or Sign Up to create an account.", {
                onDone: () => {
                    setStatusText("Listening...");
                    startListening();
                },
                onError: (e) => console.log("Speech Error", e)
            });
        }
    });
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
        setStatusText("Say 'Login' or 'Sign Up'");
    } catch (e) {
        console.error("Mic Error", e);
    }
  };

  // Handle Results
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

  // --- 4. NAVIGATION LOGIC ---
  const handleVoiceCommand = (text: string) => {
    const cmd = text.toLowerCase();
    
    // Stop mic
    stopEverything();

    if (cmd.includes("login") || cmd.includes("sign in") || cmd.includes("log in")) {
        speakAndNavigate("Opening Login...", "/login");
    } 
    else if (cmd.includes("sign up") || cmd.includes("register") || cmd.includes("create")) {
        speakAndNavigate("Opening Sign Up...", "/signup");
    }
    else {
        Speech.speak("I didn't catch that. Please say Login or Sign Up.", {
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

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={BG_COLOR} />
      
      <View style={styles.content}>
          
          {/* HERO SECTION */}
          <View style={styles.heroSection}>
              <View style={styles.iconCircle}>
                <Ionicons name="finger-print-outline" size={64} color={PRIMARY_COLOR} />
              </View>
              <Text style={styles.title}>Voice Vote</Text>
              <Text style={styles.subtitle}>Secure, Accessible, Modern.</Text>
          </View>
          
          {/* STATUS PILL */}
          <View style={[styles.statusPill, listening && styles.statusPillActive]}>
             <View style={[styles.statusDot, listening && styles.statusDotActive]} />
             <Text style={styles.statusText}>{statusText}</Text>
          </View>

          {/* ACTIONS */}
          <View style={styles.actionContainer}>
            <TouchableOpacity 
                style={styles.primaryButton} 
                onPress={() => speakAndNavigate("Opening Login", "/login")}
                activeOpacity={0.9}
            >
                <Text style={styles.primaryButtonText}>Login</Text>
                <Ionicons name="arrow-forward" size={20} color="#fff" />
            </TouchableOpacity>
            
            <TouchableOpacity 
                style={styles.secondaryButton} 
                onPress={() => speakAndNavigate("Opening Sign Up", "/signup")}
                activeOpacity={0.9}
            >
                <Text style={styles.secondaryButtonText}>Create Account</Text>
            </TouchableOpacity>
          </View>
      </View>

      {/* FLOATING MIC */}
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
  
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
    paddingBottom: 80 // Space for FAB
  },

  // HERO
  heroSection: { alignItems: 'center', marginBottom: 40 },
  iconCircle: {
      width: 120, height: 120, borderRadius: 60,
      backgroundColor: "#E0E7FF", // Indigo 100
      justifyContent: 'center', alignItems: 'center',
      marginBottom: 24,
      borderWidth: 1, borderColor: "#C7D2FE"
  },
  title: { fontSize: 32, fontWeight: "800", color: "#1F2937", letterSpacing: -1 },
  subtitle: { fontSize: 16, color: "#6B7280", marginTop: 8, fontWeight: "500" },

  // STATUS
  statusPill: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: "#fff", paddingHorizontal: 16, paddingVertical: 10,
      borderRadius: 20, marginBottom: 40,
      borderWidth: 1, borderColor: "#E5E7EB",
      shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 4, elevation: 2
  },
  statusPillActive: { borderColor: PRIMARY_COLOR },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#D1D5DB", marginRight: 8 },
  statusDotActive: { backgroundColor: "#EF4444" },
  statusText: { fontSize: 14, color: "#4B5563", fontWeight: "600" },

  // BUTTONS
  actionContainer: { width: '100%', gap: 16 },
  primaryButton: {
    backgroundColor: PRIMARY_COLOR,
    paddingVertical: 18, borderRadius: 16,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8,
    shadowColor: PRIMARY_COLOR, shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: {width: 0, height: 4},
    elevation: 8
  },
  primaryButtonText: { color: "#fff", fontSize: 18, fontWeight: "bold" },
  
  secondaryButton: {
    backgroundColor: "#fff",
    paddingVertical: 18, borderRadius: 16,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1.5, borderColor: "#E5E7EB"
  },
  secondaryButtonText: { color: "#374151", fontSize: 18, fontWeight: "600" },

  // FAB
  fabWrapper: { position: 'absolute', bottom: 40, right: 30 },
  fab: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: "#1F2937",
    justifyContent: 'center', alignItems: 'center',
    shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 8, elevation: 8
  },
  fabListening: { backgroundColor: "#EF4444" }
});