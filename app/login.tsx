import * as LocalAuthentication from "expo-local-authentication";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import * as Speech from "expo-speech";
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from "expo-speech-recognition";
import { signInWithEmailAndPassword } from "firebase/auth";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { auth } from "../firebaseConfig";

const ADMIN_EMAIL = "ngigi.vick82@gmail.com"; 

export default function Login() {
  const router = useRouter();
  
  // --- STATE ---
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [isBiometricSupported, setIsBiometricSupported] = useState(false);
  
  // Voice State
  const [listening, setListening] = useState(false);
  const [step, setStep] = useState(0); 
  const [statusText, setStatusText] = useState("Initializing...");
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // --- 1. SETUP & CHECKS ---
  useEffect(() => {
    checkBiometricSupport();
    
    // Start wizard delay
    const timer = setTimeout(() => {
        startLoginWizard(1);
    }, 1000);

    return () => {
        clearTimeout(timer);
        stopEverything();
    };
  }, []);

  // Check if phone has Fingerprint/FaceID
  const checkBiometricSupport = async () => {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync(); // Has saved fingerprints?
      setIsBiometricSupported(compatible && enrolled);
  };

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

  const stopEverything = () => {
    Speech.stop();
    ExpoSpeechRecognitionModule.stop();
    setListening(false);
  };

  // --- 2. WIZARD LOGIC ---
  const startLoginWizard = (stepNum: number) => {
    stopEverything();
    setStep(stepNum);

    if (stepNum === 1) {
        Speech.speak("Login Page. Please say your Email, or say 'Fingerprint' to log in securely.", {
            onDone: () => {
                setStatusText("Listening... (Say Email or Fingerprint)");
                startListening();
            }
        });
    } else if (stepNum === 2) {
        Speech.speak("Step 2. Please type your password securely.", {
            onDone: () => {
                setStatusText("Waiting for password...");
            }
        });
    }
  };

  // --- 3. VOICE LISTENER ---
  const startListening = async () => {
    try {
        await ExpoSpeechRecognitionModule.requestPermissionsAsync();
        await ExpoSpeechRecognitionModule.start({
            lang: "en-US",
            interimResults: true,
            maxAlternatives: 1,
        });
        setListening(true);
    } catch (e) {
        console.error("Mic Error", e);
    }
  };

  useSpeechRecognitionEvent("result", (event) => {
    const text = event.results[0]?.transcript;
    if (text) {
        if(listening && step === 1) setStatusText(`Heard: "${text}"`);
        if (event.isFinal) {
            handleVoiceInput(text);
        }
    }
  });

  const handleVoiceInput = (text: string) => {
    const cmd = text.toLowerCase();
    stopEverything();

    // Biometric Command
    if (cmd.includes("fingerprint") || cmd.includes("face") || cmd.includes("touch") || cmd.includes("scan")) {
        handleBiometricLogin();
        return;
    }

    // Email Entry
    if (step === 1) {
        const cleanEmail = text.replace(/ /g, "").replace(/at/g, "@").replace(/dot/g, ".").toLowerCase();
        setEmail(cleanEmail);
        Speech.speak(`Email set to ${cleanEmail}. Is this correct? Say Yes or No.`, {
            onDone: () => waitForConfirmation(cleanEmail)
        });
    } 
    else if (step === 3) { // Confirmation
        if (cmd.includes("yes") || cmd.includes("correct")) {
             startLoginWizard(2); // Go to password
        } else {
             startLoginWizard(1); // Retry email
        }
    }
  };

  const waitForConfirmation = (emailVal: string) => {
      setStep(3); 
      startListening();
  };

  // --- 4. LOGIN LOGIC ---
  const handleLogin = async () => {
    if (!email || !password) {
      Speech.speak("Please fill in both email and password.");
      Alert.alert("Missing Fields", "Please enter both email and password.");
      return;
    }

    setLoading(true);
    stopEverything();
    Speech.speak("Logging in...");

    try {
      await signInWithEmailAndPassword(auth, email, password);
      
      // SUCCESS: Save credentials for next time!
      if (isBiometricSupported) {
          await SecureStore.setItemAsync("user_email", email);
          await SecureStore.setItemAsync("user_pass", password);
      }
      
      Speech.speak("Login successful.");
      navigateUser(email);

    } catch (error: any) {
      Speech.speak("Login failed.");
      Alert.alert("Login Error", error.message);
    } finally {
      setLoading(false);
    }
  };

  // --- 5. BIOMETRIC LOGIN LOGIC ---
  const handleBiometricLogin = async () => {
      stopEverything();
      
      // 1. Check if we have saved data
      const savedEmail = await SecureStore.getItemAsync("user_email");
      const savedPass = await SecureStore.getItemAsync("user_pass");

      if (!savedEmail || !savedPass) {
          Speech.speak("No saved fingerprint found. Please login with password first to save it.");
          Alert.alert("No Data", "Please login with password once to enable fingerprint.");
          return;
      }

      // 2. Trigger Fingerprint Prompt
      const result = await LocalAuthentication.authenticateAsync({
          promptMessage: "Scan your fingerprint to login",
          fallbackLabel: "Use Password",
      });

      if (result.success) {
          setLoading(true);
          Speech.speak("Fingerprint accepted. Logging in.");
          try {
              await signInWithEmailAndPassword(auth, savedEmail, savedPass);
              navigateUser(savedEmail);
          } catch (e) {
              Speech.speak("Error logging in.");
              setLoading(false);
          }
      } else {
          Speech.speak("Fingerprint failed. Please try again.");
      }
  };

  const navigateUser = (userEmail: string) => {
      if (userEmail.toLowerCase().trim() === ADMIN_EMAIL.toLowerCase()) {
        router.replace("/admin"); 
      } else {
        router.replace("/home");
      }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 60 : 0}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag" 
      >
        <Text style={styles.title}>Welcome Back</Text>
        <Text style={styles.statusText}>{statusText}</Text>

        {/* EMAIL INPUT */}
        <View style={[styles.inputContainer, step === 1 && styles.activeInput]}>
            <Text style={styles.label}>Email Address</Text>
            <TextInput
            style={styles.input}
            placeholder="example@gmail.com"
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
            />
        </View>

        {/* PASSWORD INPUT */}
        <View style={[styles.inputContainer, step === 2 && styles.activeInput]}>
            <Text style={styles.label}>Password</Text>
            <TextInput
            style={styles.input}
            placeholder="********"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            />
        </View>

        {/* BIOMETRIC BUTTON (If Supported) */}
        {isBiometricSupported && (
            <TouchableOpacity 
                style={styles.bioButton} 
                onPress={handleBiometricLogin}
            >
                <Text style={styles.bioText}>👆 Login with Fingerprint</Text>
            </TouchableOpacity>
        )}

        {/* LOGIN BUTTON */}
        <TouchableOpacity 
          style={styles.button} 
          onPress={handleLogin} 
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading ? "Logging in..." : "Log In"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.push("/signup")}>
          <Text style={styles.linkText}>Don’t have an account? Sign up</Text>
        </TouchableOpacity>

      </ScrollView>

      {/* FLOATING STATUS */}
      {listening && (
        <View style={styles.footer}>
            <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                <Text style={{fontSize: 30}}>🎤</Text>
            </Animated.View>
            <Text style={{marginLeft: 10, color: '#555'}}>Listening...</Text>
        </View>
      )}

    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8f9fa",
  },
  scrollContainer: {
    flexGrow: 1, 
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  title: {
    fontSize: 26,
    fontWeight: "bold",
    marginBottom: 20,
  },
  statusText: {
    fontSize: 14,
    color: "#666",
    marginBottom: 20,
    fontStyle: 'italic'
  },
  inputContainer: {
      width: "100%", maxWidth: 350, marginBottom: 15
  },
  label: {
      marginBottom: 5, fontWeight: 'bold', color: '#333'
  },
  activeInput: {
      borderColor: "#007AFF", borderWidth: 1, borderRadius: 12, padding: 5, backgroundColor: "#E3F2FD"
  },
  input: {
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ccc",
    width: "100%",
  },
  button: {
    backgroundColor: "#007AFF",
    padding: 16,
    borderRadius: 10,
    width: "100%",
    maxWidth: 350,
    alignItems: "center",
    marginTop: 10,
  },
  buttonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  // Biometric Button Styles
  bioButton: {
      backgroundColor: "#fff",
      borderWidth: 1,
      borderColor: "#28a745",
      padding: 14,
      borderRadius: 10,
      width: "100%",
      maxWidth: 350,
      alignItems: "center",
      marginBottom: 10,
  },
  bioText: {
      color: "#28a745",
      fontSize: 16,
      fontWeight: "bold"
  },
  linkText: {
    marginTop: 15,
    color: "#007AFF",
    fontSize: 15,
  },
  footer: {
      position: 'absolute', bottom: 30, alignSelf: 'center',
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: 'white', padding: 15, borderRadius: 30,
      elevation: 5, shadowColor: '#000', shadowOpacity: 0.2
  }
});
