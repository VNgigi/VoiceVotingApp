import { useRouter } from "expo-router";
import * as Speech from "expo-speech";
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from "expo-speech-recognition";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
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
import { auth, db } from "../firebaseConfig";

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
  const [tempInput, setTempInput] = useState(""); // Stores text while waiting for "Yes/No" confirmation
  const [isConfirming, setIsConfirming] = useState(false); // Are we waiting for Yes/No?
  
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
        case 1: prompt = "Welcome to signup page. You may require sighted assistance to initially sign you up, especially for your password. Step 1. Please say your Full Name."; break;
        case 2: prompt = "Step 2. Please say your Registration Number."; break;
        case 3: prompt = "Step 3. Which Department are you in?"; break;
        case 4: prompt = "Step 4. Please say your Email Address."; break;
        case 5: prompt = "Step 5. For security, please type your password manually. Then press Sign Up."; break;
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
        if(listening) setStatusText(`Heard: "${text}"`);
        if (event.isFinal) {
            handleVoiceInput(text);
        }
    }
  });

  const handleVoiceInput = (text: string) => {
    const cmd = text.toLowerCase();
    stopEverything();

    // Global Cancel
    if (cmd.includes("cancel") || cmd.includes("stop")) {
        router.back();
        return;
    }

    // A. IF CONFIRMING ("Did you say X?")
    if (isConfirming) {
        if (cmd.includes("yes") || cmd.includes("correct") || cmd.includes("yeah")) {
            // SAVE DATA AND MOVE NEXT
            saveDataAndNext(step, tempInput);
        } else {
            // RETRY
            Speech.speak("Okay, let's try that again.", {
                onDone: () => startWizardStep(step)
            });
        }
        return;
    }

    // B. IF CAPTURING INPUT
    let cleanedText = text;
    
    // Special cleanup for Email
    if (step === 4) {
        cleanedText = text.replace(/ /g, "").replace(/at/g, "@").replace(/dot/g, ".").toLowerCase();
    }
    // Special cleanup for Reg No (Upper case, remove spaces)
    if (step === 2) {
        cleanedText = text.replace(/ /g, "").toUpperCase();
    }

    // Ask for confirmation
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

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.innerContainer}>
          <Text style={styles.title}>Create an Account</Text>
          <Text style={styles.statusText}>{statusText}</Text>

          {/* NAME */}
          <View style={[styles.fieldContainer, step === 1 && styles.activeField]}>
            <TextInput
                style={styles.input}
                placeholder="Full Name"
                value={step === 1 && isConfirming ? tempInput : fullName}
                onChangeText={setFullName}
            />
          </View>

          {/* REG NO */}
          <View style={[styles.fieldContainer, step === 2 && styles.activeField]}>
            <TextInput
                style={styles.input}
                placeholder="Registration Number"
                value={step === 2 && isConfirming ? tempInput : regNumber}
                onChangeText={setRegNumber}
                autoCapitalize="characters"
            />
          </View>

          {/* DEPT */}
          <View style={[styles.fieldContainer, step === 3 && styles.activeField]}>
            <TextInput
                style={styles.input}
                placeholder="Department"
                value={step === 3 && isConfirming ? tempInput : department}
                onChangeText={setDepartment}
            />
          </View>

          {/* EMAIL */}
          <View style={[styles.fieldContainer, step === 4 && styles.activeField]}>
            <TextInput
                style={styles.input}
                placeholder="Email Address"
                keyboardType="email-address"
                autoCapitalize="none"
                value={step === 4 && isConfirming ? tempInput : email}
                onChangeText={setEmail}
            />
          </View>

          {/* PASSWORD */}
          <View style={[styles.fieldContainer, step === 5 && styles.activeField]}>
            <TextInput
                style={styles.input}
                placeholder="Password (Type manually)"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
            />
          </View>

          <TouchableOpacity
            style={styles.button}
            onPress={handleSignup}
            disabled={loading}
          >
            <Text style={styles.buttonText}>
              {loading ? "Creating Account..." : "Sign Up"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.push("/login")} style={styles.linkContainer}>
            <Text style={styles.linkText}>Already have an account? Log in</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* FLOATING MIC */}
      {listening && (
        <View style={styles.footer}>
            <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                <Text style={{fontSize: 30}}>🎤</Text>
            </Animated.View>
        </View>
      )}

    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8f9fa" },
  scrollContainer: { flexGrow: 1, justifyContent: "center" },
  innerContainer: { alignItems: "center", padding: 20, width: "100%" },
  title: { fontSize: 26, fontWeight: "bold", marginBottom: 20, color: "#333" },
  statusText: { fontSize: 14, fontStyle: "italic", color: "#666", marginBottom: 15 },
  
  fieldContainer: { width: "100%", maxWidth: 350, marginBottom: 15 },
  activeField: { borderColor: "#007AFF", borderWidth: 2, borderRadius: 12, padding: 2, backgroundColor: "#E3F2FD" },

  input: {
    width: "100%",
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ccc",
    color: "#333",
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
  buttonText: { color: "white", fontSize: 16, fontWeight: "600" },
  linkContainer: { marginTop: 15, padding: 10 },
  linkText: { color: "#007AFF", fontSize: 15 },
  
  footer: {
      position: 'absolute', bottom: 30, alignSelf: 'center',
      backgroundColor: 'white', padding: 15, borderRadius: 30,
      elevation: 5, shadowColor: '#000', shadowOpacity: 0.2
  }
});