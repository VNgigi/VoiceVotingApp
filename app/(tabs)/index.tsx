import { useFocusEffect, useRouter } from "expo-router";
import * as Speech from "expo-speech";
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from "expo-speech-recognition";
import React, { useCallback, useRef, useState } from "react";
import {
  Alert,
  Animated,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";

export default function Index() {
  const router = useRouter();

  // --- STATE ---
  const [listening, setListening] = useState(false);
  const [statusText, setStatusText] = useState("Initializing...");
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // --- 1. START SEQUENCE ON FOCUS ---
  // usage: Runs every time this screen becomes active/visible
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
  // Use React.useEffect here because this depends on 'listening' state changes, not focus
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
                    setStatusText("Your turn to speak...");
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
        setStatusText("Listening... (Say Login or Sign Up)");
    } catch (e) {
        console.error("Mic Error", e);
    }
  };

  // Handle Results
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
      <View style={styles.content}>
          <Text style={styles.title}>Welcome to Voice Voting App</Text>
          
          {/* Status Text for Voice Feedback */}
          <Text style={[styles.statusText, listening ? styles.statusActive : null]}>
            {statusText}
          </Text>

          <TouchableOpacity style={styles.button} onPress={() => speakAndNavigate("Opening Login", "/login")}>
            <Text style={styles.buttonText}>Login</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={[styles.button, styles.outlineButton]} onPress={() => speakAndNavigate("Opening Sign Up", "/signup")}>
            <Text style={styles.buttonText}>Sign Up</Text>
          </TouchableOpacity>
      </View>

      {/* Floating Mic Button (Manual Toggle) */}
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
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  title: {
    fontSize: 26,
    fontWeight: "bold",
    marginBottom: 10,
    textAlign: "center",
    color: "#333",
  },
  statusText: { 
    fontSize: 16, 
    fontStyle: "italic", 
    color: "#666", 
    marginBottom: 30, 
    textAlign: "center",
    height: 24
  },
  statusActive: { 
    color: "#007bff", 
    fontWeight: "bold" 
  },
  button: {
    backgroundColor: "#007bff",
    paddingVertical: 15,
    paddingHorizontal: 40,
    borderRadius: 10,
    marginVertical: 10,
    width: "100%",
    alignItems: "center",
    elevation: 3,
  },
  outlineButton: {
    backgroundColor: "#6c757d", // Grey for secondary action
  },
  buttonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
  },
  
  // Mic Styles
  fab: {
    position: 'absolute', bottom: 40, right: 30,
    width: 70, height: 70, borderRadius: 35,
    backgroundColor: '#007bff', justifyContent: 'center', alignItems: 'center',
    elevation: 6, shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 4.65,
  },
  fabActive: { backgroundColor: '#dc3545' }, // Red when listening
  fabIcon: { fontSize: 30 },
});