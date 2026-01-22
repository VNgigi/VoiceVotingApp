import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Speech from "expo-speech";
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from "expo-speech-recognition";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { auth, db } from "../firebaseConfig";

// --- THEME ---
const PRIMARY_COLOR = "#4F46E5"; // Indigo 600
const BG_COLOR = "#F9FAFB"; // Slate 50
const TEXT_COLOR = "#1F2937"; // Gray 800
const INPUT_BG = "#FFFFFF"; 
const ACTIVE_BG = "#EEF2FF"; // Indigo 50

export default function Signup() {
  const router = useRouter();

  // --- FORM STATE ---
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [regNumber, setRegNumber] = useState("");
  const [department, setDepartment] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // --- VOICE STATE ---
  const [step, setStep] = useState(0); // 0=Intro, 1=Name, 2=RegNo, 3=Dept, 4=Email, 5=Password(Manual)
  const [listening, setListening] = useState(false);
  const [statusText, setStatusText] = useState("Initializing...");
  const [tempInput, setTempInput] = useState(""); 
  const [isConfirming, setIsConfirming] = useState(false); 
  
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // --- 1. START WIZARD ---
  useEffect(() => {
    const timer = setTimeout(() => {
        startWizardStep(1);
    }, 1000);

    return () => {
        clearTimeout(timer);
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

  const stopEverything = () => {
    Speech.stop();
    ExpoSpeechRecognitionModule.stop();
    setListening(false);
  };

  // --- 2. WIZARD LOGIC ---
  const startWizardStep = (stepNum: number) => {
    stopEverything();
    setStep(stepNum);
    setIsConfirming(false);
    setTempInput("");

    let prompt = "";
    switch(stepNum) {
        case 1: prompt = "Welcome. Step 1. Please say your Full Name."; break;
        case 2: prompt = "Step 2. Please say your Registration Number."; break;
        case 3: prompt = "Step 3. Which Department are you in?"; break;
        case 4: prompt = "Step 4. Please say your Email Address."; break;
        case 5: prompt = "Step 5. For security, please type your password manually."; break;
    }

    Speech.speak(prompt, {
        onDone: () => {
            if (stepNum !== 5) {
                setStatusText("Listening...");
                startListening();
            } else {
                setStatusText("Waiting for password input...");
            }
        }
    });
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
        if(listening) setStatusText(`"${text}"`);
        if (event.isFinal) {
            handleVoiceInput(text);
        }
    }
  });

  const handleVoiceInput = (text: string) => {
    const cmd = text.toLowerCase();
    stopEverything();

    if (cmd.includes("cancel") || cmd.includes("stop")) {
        router.back();
        return;
    }

    // A. IF CONFIRMING
    if (isConfirming) {
        if (cmd.includes("yes") || cmd.includes("correct") || cmd.includes("yeah")) {
            saveDataAndNext(step, tempInput);
        } else {
            Speech.speak("Okay, let's try that again.", {
                onDone: () => startWizardStep(step)
            });
        }
        return;
    }

    // B. IF CAPTURING INPUT
    let cleanedText = text;
    if (step === 4) {
        cleanedText = text.replace(/ /g, "").replace(/at/g, "@").replace(/dot/g, ".").toLowerCase();
    }
    if (step === 2) {
        cleanedText = text.replace(/ /g, "").toUpperCase();
    }

    setTempInput(cleanedText);
    setIsConfirming(true);
    
    Speech.speak(`I heard ${cleanedText}. Is this correct? Say Yes or No.`, {
        onDone: () => {startListening();}
    });
  };

  const saveDataAndNext = (currentStep: number, data: string) => {
      if (currentStep === 1) setFullName(data);
      if (currentStep === 2) setRegNumber(data);
      if (currentStep === 3) setDepartment(data);
      if (currentStep === 4) setEmail(data);

      const nextStep = currentStep + 1;
      startWizardStep(nextStep);
  };

  // --- 4. SIGNUP LOGIC ---
  const handleSignup = async () => {
    if (!fullName || !email || !password || !regNumber || !department) {
      Speech.speak("Please fill in all fields.");
      Alert.alert("Missing Fields", "Please fill in all fields.");
      return;
    }

    setLoading(true);
    stopEverything();
    Speech.speak("Creating your account...");

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      await updateProfile(user, { displayName: fullName });

      await setDoc(doc(db, "users", user.uid), {
        fullName,
        email,
        regNumber,
        department,
        role: "student",
        createdAt: new Date().toISOString(),
      });

      Speech.speak("Account created successfully. Logging you in.", {
          onDone: () => router.replace("/home")
      });
      
    } catch (error: any) {
      const errorMessage = error.message || "Something went wrong";
      Speech.speak("There was an error creating your account.");
      Alert.alert("Signup Error", errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Progress Bar Calc
  const progress = (step / 5) * 100;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      
      {/* --- HEADER --- */}
      <View style={styles.header}>
         <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={TEXT_COLOR} />
         </TouchableOpacity>
         <Text style={styles.headerTitle}>Create Account</Text>
         <View style={{width: 24}} /> 
      </View>

      {/* --- PROGRESS BAR --- */}
      <View style={styles.progressTrack}>
         <Animated.View style={[styles.progressBar, { width: `${progress}%` }]} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.formContainer}>
            <Text style={styles.sectionTitle}>Student Details</Text>

            {/* NAME */}
            <View style={[styles.inputWrapper, step === 1 && styles.activeWrapper]}>
                <Ionicons name="person-outline" size={20} color="#6B7280" style={styles.icon} />
                <View style={{flex: 1}}>
                    <Text style={styles.label}>Full Name</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="Mary Njoki"
                        value={step === 1 && isConfirming ? tempInput : fullName}
                        onChangeText={setFullName}
                    />
                </View>
            </View>

            {/* REG NO */}
            <View style={[styles.inputWrapper, step === 2 && styles.activeWrapper]}>
                <Ionicons name="card-outline" size={20} color="#6B7280" style={styles.icon} />
                <View style={{flex: 1}}>
                    <Text style={styles.label}>Registration Number</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="C025-01-0001/2022"
                        value={step === 2 && isConfirming ? tempInput : regNumber}
                        onChangeText={setRegNumber}
                        autoCapitalize="characters"
                    />
                </View>
            </View>

            {/* DEPT */}
            <View style={[styles.inputWrapper, step === 3 && styles.activeWrapper]}>
                <Ionicons name="business-outline" size={20} color="#6B7280" style={styles.icon} />
                <View style={{flex: 1}}>
                    <Text style={styles.label}>Department</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="Computer Science"
                        value={step === 3 && isConfirming ? tempInput : department}
                        onChangeText={setDepartment}
                    />
                </View>
            </View>

            {/* EMAIL */}
            <View style={[styles.inputWrapper, step === 4 && styles.activeWrapper]}>
                <Ionicons name="mail-outline" size={20} color="#6B7280" style={styles.icon} />
                <View style={{flex: 1}}>
                    <Text style={styles.label}>Email Address</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="student@example.com"
                        keyboardType="email-address"
                        autoCapitalize="none"
                        value={step === 4 && isConfirming ? tempInput : email}
                        onChangeText={setEmail}
                    />
                </View>
            </View>

            {/* PASSWORD */}
            <View style={[styles.inputWrapper, step === 5 && styles.activeWrapper]}>
                <Ionicons name="lock-closed-outline" size={20} color="#6B7280" style={styles.icon} />
                <View style={{flex: 1}}>
                    <Text style={styles.label}>Password</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="••••••••"
                        secureTextEntry
                        value={password}
                        onChangeText={setPassword}
                    />
                </View>
            </View>

            {/* ACTION BUTTONS */}
            <TouchableOpacity
                style={[styles.button, loading && {opacity: 0.7}]}
                onPress={handleSignup}
                disabled={loading}
            >
                {loading ? (
                    <ActivityIndicator color="#fff" />
                ) : (
                    <>
                         <Text style={styles.buttonText}>Create Account</Text>
                         <Ionicons name="arrow-forward" size={20} color="#fff" />
                    </>
                )}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => router.push("/login")} style={styles.linkContainer}>
                <Text style={styles.linkText}>
                    Already have an account? <Text style={styles.linkHighlight}>Log in</Text>
                </Text>
            </TouchableOpacity>
          </View>
          <View style={{height: 100}} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* --- FLOATING STATUS --- */}
      <View style={styles.floatingContainer}>
         <View style={styles.statusPill}>
             <View style={[styles.statusDot, { opacity: listening ? 1 : 0 }]} />
             <Text style={styles.footerText} numberOfLines={1}>{statusText}</Text>
         </View>
         
         <TouchableOpacity 
            onPress={() => startWizardStep(step)}
            style={styles.micButton}
            activeOpacity={0.9}
         >
             <Animated.View style={{ transform: [{ scale: listening ? pulseAnim : 1 }] }}>
                 <Ionicons name={listening ? "mic" : "refresh"} size={24} color="#fff" />
             </Animated.View>
         </TouchableOpacity>
      </View>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG_COLOR },
  
  // HEADER
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16,
    backgroundColor: "#fff",
  },
  headerTitle: { fontSize: 18, fontWeight: "700", color: TEXT_COLOR },
  backBtn: { padding: 4 },
  
  // PROGRESS
  progressTrack: { height: 4, backgroundColor: "#E5E7EB", width: '100%' },
  progressBar: { height: '100%', backgroundColor: PRIMARY_COLOR },

  scrollContent: { padding: 24 },
  formContainer: { width: "100%", gap: 16 },
  sectionTitle: { fontSize: 20, fontWeight: "800", color: TEXT_COLOR, marginBottom: 8 },

  // INPUT WRAPPER
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: INPUT_BG,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1, borderColor: "#E5E7EB",
    shadowColor: "#000", shadowOpacity: 0.02, shadowRadius: 5, elevation: 1
  },
  activeWrapper: {
    borderColor: PRIMARY_COLOR,
    backgroundColor: ACTIVE_BG,
    shadowColor: PRIMARY_COLOR, shadowOpacity: 0.1, shadowRadius: 8
  },
  icon: { marginRight: 12 },
  label: { fontSize: 11, color: "#6B7280", fontWeight: "600", marginBottom: 2, textTransform: 'uppercase' },
  input: {
      fontSize: 16,
      color: TEXT_COLOR,
      padding: 0,
      height: 24,
  },

  // BUTTONS
  button: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: PRIMARY_COLOR,
    padding: 18, borderRadius: 16,
    marginTop: 16,
    shadowColor: PRIMARY_COLOR, shadowOpacity: 0.3, shadowRadius: 10, elevation: 4
  },
  buttonText: { color: "white", fontSize: 16, fontWeight: "700" },
  
  linkContainer: { alignItems: 'center', marginTop: 16 },
  linkText: { color: "#6B7280", fontSize: 14 },
  linkHighlight: { color: PRIMARY_COLOR, fontWeight: "700" },
  
  // FLOATING STATUS
  floatingContainer: {
      position: 'absolute', bottom: 30, left: 24, right: 24,
      flexDirection: 'row', alignItems: 'center', gap: 12
  },
  statusPill: {
      flex: 1, flexDirection: 'row', alignItems: 'center',
      backgroundColor: "rgba(31, 41, 55, 0.95)",
      paddingHorizontal: 16, paddingVertical: 14,
      borderRadius: 30,
      shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 10, elevation: 5
  },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#EF4444", marginRight: 10 },
  footerText: { fontSize: 14, color: "#fff", fontWeight: "600" },
  
  micButton: {
      width: 52, height: 52, borderRadius: 26, 
      backgroundColor: PRIMARY_COLOR,
      justifyContent: 'center', alignItems: 'center',
      shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 8, elevation: 6
  }
});