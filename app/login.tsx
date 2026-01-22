import { Ionicons } from "@expo/vector-icons"; // Modern Icons
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
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { auth } from "../firebaseConfig";

const ADMIN_EMAIL = "ngigi.vick82@gmail.com"; 
const PRIMARY_COLOR = "#4F46E5"; // Indigo 600
const BG_COLOR = "#F9FAFB"; // Slate 50
const TEXT_COLOR = "#1F2937"; // Gray 800

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
                setStatusText("Say Email or 'Fingerprint'");
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
        if(listening && step === 1) setStatusText(`"${text}"`);
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
      
      // SUCCESS: Save credentials
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
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
    >
      <StatusBar barStyle="dark-content" backgroundColor={BG_COLOR} />
      
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* --- HEADER --- */}
        <View style={styles.header}>
            <View style={styles.iconCircle}>
                <Ionicons name="lock-closed-outline" size={40} color={PRIMARY_COLOR} />
            </View>
            <Text style={styles.title}>Welcome Back</Text>
            <Text style={styles.subtitle}>Sign in to access your dashboard</Text>
        </View>

        {/* --- STATUS PILL (Voice) --- */}
        <View style={[styles.statusPill, listening && styles.statusPillActive]}>
             <View style={[styles.statusDot, listening && styles.statusDotActive]} />
             <Text style={styles.statusText} numberOfLines={1}>{statusText}</Text>
        </View>

        {/* --- INPUTS --- */}
        <View style={styles.formContainer}>
            {/* EMAIL */}
            <View style={[styles.inputWrapper, step === 1 && styles.activeInput]}>
                <Ionicons name="mail-outline" size={20} color="#9CA3AF" style={styles.inputIcon} />
                <View style={styles.inputContent}>
                    <Text style={styles.label}>Email Address</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="name@example.com"
                        placeholderTextColor="#9CA3AF"
                        keyboardType="email-address"
                        autoCapitalize="none"
                        value={email}
                        onChangeText={setEmail}
                    />
                </View>
            </View>

            {/* PASSWORD */}
            <View style={[styles.inputWrapper, step === 2 && styles.activeInput]}>
                <Ionicons name="key-outline" size={20} color="#9CA3AF" style={styles.inputIcon} />
                <View style={styles.inputContent}>
                    <Text style={styles.label}>Password</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="••••••••"
                        placeholderTextColor="#9CA3AF"
                        secureTextEntry
                        value={password}
                        onChangeText={setPassword}
                    />
                </View>
            </View>
        </View>

        {/* --- BIOMETRIC & ACTION --- */}
        <View style={styles.actionContainer}>
            {isBiometricSupported && (
                <TouchableOpacity 
                    style={styles.bioButton} 
                    onPress={handleBiometricLogin}
                    activeOpacity={0.7}
                >
                    <Ionicons name="finger-print" size={24} color={PRIMARY_COLOR} />
                    <Text style={styles.bioText}>Use Biometrics</Text>
                </TouchableOpacity>
            )}

            <TouchableOpacity 
                style={[styles.button, loading && styles.buttonDisabled]} 
                onPress={handleLogin} 
                disabled={loading}
                activeOpacity={0.8}
            >
                <Text style={styles.buttonText}>
                    {loading ? "Verifying..." : "Sign In"}
                </Text>
                {!loading && <Ionicons name="arrow-forward" size={20} color="#fff" />}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => router.push("/signup")} style={styles.linkButton}>
                <Text style={styles.linkText}>
                    New here? <Text style={styles.linkHighlight}>Create an account</Text>
                </Text>
            </TouchableOpacity>
        </View>

      </ScrollView>

      {/* --- FLOATING MIC INDICATOR --- */}
      {listening && (
        <View style={styles.floatingMic}>
            <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                <View style={styles.micCircle}>
                    <Ionicons name="mic" size={24} color="#fff" />
                </View>
            </Animated.View>
        </View>
      )}

    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG_COLOR },
  scrollContainer: {
    flexGrow: 1, 
    justifyContent: "center",
    padding: 24,
    paddingTop: 60
  },
  
  // HEADER
  header: { alignItems: 'center', marginBottom: 32 },
  iconCircle: {
      width: 80, height: 80, borderRadius: 40,
      backgroundColor: "#EEF2FF", // Light Indigo
      justifyContent: 'center', alignItems: 'center',
      marginBottom: 24,
      borderWidth: 1, borderColor: "#E0E7FF"
  },
  title: { fontSize: 28, fontWeight: "800", color: TEXT_COLOR, letterSpacing: -0.5 },
  subtitle: { fontSize: 15, color: "#6B7280", marginTop: 8 },

  // STATUS
  statusPill: {
      flexDirection: 'row', alignItems: 'center', alignSelf: 'center',
      backgroundColor: "#fff", paddingHorizontal: 16, paddingVertical: 8,
      borderRadius: 20, marginBottom: 24,
      borderWidth: 1, borderColor: "#E5E7EB",
      shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 4, elevation: 1
  },
  statusPillActive: { borderColor: PRIMARY_COLOR, backgroundColor: "#F5F3FF" },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#D1D5DB", marginRight: 8 },
  statusDotActive: { backgroundColor: "#EF4444" },
  statusText: { fontSize: 13, color: "#6B7280", fontWeight: "600", maxWidth: 200 },

  // FORM
  formContainer: { width: "100%", gap: 16, marginBottom: 32 },
  inputWrapper: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: "#fff",
      borderRadius: 16,
      padding: 12,
      borderWidth: 1, borderColor: "#E5E7EB",
      shadowColor: "#000", shadowOpacity: 0.02, shadowRadius: 5, elevation: 1
  },
  activeInput: {
      borderColor: PRIMARY_COLOR,
      backgroundColor: "#EEF2FF",
      shadowColor: PRIMARY_COLOR, shadowOpacity: 0.1, shadowRadius: 8
  },
  inputIcon: { marginRight: 12, marginLeft: 4 },
  inputContent: { flex: 1 },
  label: { fontSize: 12, color: "#6B7280", fontWeight: "600", marginBottom: 2, textTransform: 'uppercase' },
  input: {
      fontSize: 16,
      color: TEXT_COLOR,
      paddingVertical: 2, // Tighten up
      height: 24,
      padding: 0
  },

  // ACTIONS
  actionContainer: { width: "100%", gap: 16 },
  bioButton: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      backgroundColor: "#fff",
      padding: 16, borderRadius: 16,
      borderWidth: 1, borderColor: "#E0E7FF"
  },
  bioText: { color: PRIMARY_COLOR, fontWeight: "700", fontSize: 15 },
  
  button: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: PRIMARY_COLOR,
    padding: 18, borderRadius: 16,
    shadowColor: PRIMARY_COLOR, shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: {width: 0, height: 4},
    elevation: 4
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: "white", fontSize: 16, fontWeight: "700" },
  
  linkButton: { alignItems: 'center', marginTop: 8 },
  linkText: { color: "#6B7280", fontSize: 14 },
  linkHighlight: { color: PRIMARY_COLOR, fontWeight: "700" },

  // FLOATING MIC
  floatingMic: {
      position: 'absolute', bottom: 40, right: 30,
      alignItems: 'center', justifyContent: 'center'
  },
  micCircle: {
      width: 56, height: 56, borderRadius: 28,
      backgroundColor: "#EF4444",
      justifyContent: 'center', alignItems: 'center',
      shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 8, elevation: 6
  }
});