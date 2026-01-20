import { Picker } from "@react-native-picker/picker";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import * as Speech from "expo-speech";
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from "expo-speech-recognition";
import { addDoc, collection } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { db, storage } from "../../firebaseConfig";

export default function CandidateApplication() {
  const router = useRouter();
  
  // --- FORM STATE ---
  const [name, setName] = useState("");
  const [position, setPosition] = useState("");
  const [admissionNumber, setAdmissionNumber] = useState("");
  const [course, setCourse] = useState("");
  const [age, setAge] = useState("");
  const [briefInfo, setBriefInfo] = useState("");
  const [email, setEmail] = useState("");
  
  // File States
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [documentUri, setDocumentUri] = useState<string | null>(null);
  const [documentName, setDocumentName] = useState<string | null>(null);
  
  const [loading, setLoading] = useState(false);

  // --- VOICE STATE ---
  const [currentStep, setCurrentStep] = useState(0); // 0 = Intro
  const [listening, setListening] = useState(false);
  const [statusText, setStatusText] = useState("Initializing...");
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // --- 1. SETUP & INTRO ---
  useEffect(() => {
    // Start the wizard after 1 second
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

  // --- 2. THE WIZARD LOGIC ---
  const startWizardStep = (step: number) => {
    stopEverything();
    setCurrentStep(step);
    
    let prompt = "";

    switch(step) {
        case 1: prompt = "Application Wizard started. Step 1. Please say your Full Name."; break;
        case 2: prompt = "Step 2. Say the position you are running for, like President or Treasurer."; break;
        case 3: prompt = "Step 3. Say your Admission Number."; break;
        case 4: prompt = "Step 4. Say your Age."; break;
        case 5: prompt = "Step 5. Say your Course or Department."; break;
        case 6: prompt = "Step 6. Say your Email Address."; break;
        case 7: 
            prompt = "Step 7. Photo Upload. Please tap the camera icon to select a photo. You may need sighted assistance to pick the correct file. Say Next when you are done."; 
            break;
        case 8: 
            prompt = "Step 8. Document Upload. Please tap the button to select your eligibility PDF. Ask for help to ensure it is the right file. Say Next when done."; 
            break;
        case 9: prompt = "Step 9. Say a brief manifesto or info about yourself."; break;
        case 10: prompt = "Application complete. Say Submit to finish, or Cancel to exit."; break;
    }

    Speech.speak(prompt, {
        onDone: () => {
            // For upload steps (7 & 8), we wait for user to say "Next" after they manually tap
            if (step === 7 || step === 8) {
                setStatusText("Waiting for upload... Say 'Next' when done.");
                startListening();
            } else {
                startListening();
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
        if (currentStep !== 7 && currentStep !== 8) {
             setStatusText("Listening for answer...");
        }
    } catch (e) {
        console.error("Mic Error", e);
    }
  };

  useSpeechRecognitionEvent("result", (event) => {
    const text = event.results[0]?.transcript;
    if (text) {
        if (listening && currentStep !== 7 && currentStep !== 8) {
             setStatusText(`Heard: "${text}"`);
        }
        if (event.isFinal) {
            handleVoiceInput(text);
        }
    }
  });

  const handleVoiceInput = (text: string) => {
    const cmd = text.toLowerCase();
    stopEverything();

    // Global Cancel
    if (cmd.includes("cancel") || cmd.includes("exit") || cmd.includes("stop")) {
        router.back();
        return;
    }

    // Step Logic
    switch(currentStep) {
        case 1: // Name
            setName(text);
            Speech.speak(`Saved name ${text}.`, { onDone: () => startWizardStep(2) });
            break;
        case 2: // Position
            // Simple fuzzy match for positions
            const validPositions = ["President", "Vice President", "Secretary General", "Treasurer", "Gender", "Sports", "Entertainment"];
            const match = validPositions.find(p => cmd.includes(p.toLowerCase()));
            if (match) {
                // Map short names to full names if needed
                const fullPos = match === "Gender" ? "Gender and Disability Representative" : 
                                match === "Sports" || match === "Entertainment" ? "Sports, Entertainment and Security Secretary" : match;
                setPosition(fullPos);
                Speech.speak(`Selected ${match}.`, { onDone: () => startWizardStep(3) });
            } else {
                Speech.speak("Position not recognized. Please say it again.", { onDone: () => {startListening();} });
            }
            break;
        case 3: // Admin No
            setAdmissionNumber(text.replace(/ /g, "").toUpperCase()); // Remove spaces for admin no
            Speech.speak("Admission number saved.", { onDone: () => startWizardStep(4) });
            break;
        case 4: // Age
            const ageNum = text.match(/\d+/); // Extract number
            if (ageNum) {
                setAge(ageNum[0]);
                Speech.speak(`Age ${ageNum[0]} saved.`, { onDone: () => startWizardStep(5) });
            } else {
                Speech.speak("Please say a number for your age.", { onDone: () => {startListening();} });
            }
            break;
        case 5: // Course
            setCourse(text);
            Speech.speak("Course saved.", { onDone: () => startWizardStep(6) });
            break;
        case 6: // Email
            const formattedEmail = text.replace(/at/g, "@").replace(/dot/g, ".").replace(/ /g, "").toLowerCase();
            setEmail(formattedEmail);
            Speech.speak("Email saved.", { onDone: () => startWizardStep(7) });
            break;
        case 7: // Photo (Manual Wait)
            if (cmd.includes("next") || cmd.includes("done")) {
                if (!photoUri) {
                    Speech.speak("No photo selected. Please tap the camera icon first.", { onDone: () => {startListening(); } });
                } else {
                    startWizardStep(8);
                }
            } else {
                Speech.speak("Tap the camera icon, then say Next.", { onDone: () => {startListening(); } });
            }
            break;
        case 8: // Doc (Manual Wait)
            if (cmd.includes("next") || cmd.includes("done")) {
                if (!documentUri) {
                    Speech.speak("No document selected. Please tap the button first.", { onDone: () => {startListening(); } });
                } else {
                    startWizardStep(9);
                }
            } else {
                 Speech.speak("Select the document, then say Next.", { onDone: () => {startListening(); } });
            }
            break;
        case 9: // Manifesto
            setBriefInfo(text);
            Speech.speak("Manifesto saved.", { onDone: () => startWizardStep(10) });
            break;
        case 10: // Submit
            if (cmd.includes("submit") || cmd.includes("yes") || cmd.includes("confirm")) {
                handleSubmit();
            } else {
                Speech.speak("Say Submit to finish.", { onDone: () => {startListening(); } });
            }
            break;
    }
  };


  // --- HELPER: Upload to Storage ---
  const uploadFile = async (uri: string, folder: string, fileName: string) => {
    const response = await fetch(uri);
    const blob = await response.blob();
    const storageRef = ref(storage, `${folder}/${Date.now()}_${fileName}`);
    await uploadBytes(storageRef, blob);
    return await getDownloadURL(storageRef);
  };

  // --- PICKERS ---
  const pickImage = async () => {
    Speech.stop(); // Stop speaking so they can focus
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
    });
    if (!result.canceled) {
        setPhotoUri(result.assets[0].uri);
        Speech.speak("Photo selected. Say Next to continue.");
    }
  };

  const pickDocument = async () => {
    Speech.stop();
    const result = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf", "image/*"],
    });
    if (!result.canceled) {
      setDocumentUri(result.assets[0].uri);
      setDocumentName(result.assets[0].name);
      Speech.speak("Document selected. Say Next to continue.");
    }
  };

  // --- SUBMIT LOGIC ---
  const handleSubmit = async () => {
    stopEverything();

    if (!name || !position || !admissionNumber || !course || !age || !briefInfo || !photoUri || !documentUri) {
      Speech.speak("Missing details. Please check the form.");
      Alert.alert("Missing Fields", "Please fill in all details and upload documents.");
      return;
    }

    setLoading(true);
    Speech.speak("Submitting application...");

    try {
      const photoUrl = await uploadFile(photoUri, "passports", "photo.jpg");
      const documentUrl = await uploadFile(documentUri, "eligibility_docs", documentName || "doc.pdf");

      await addDoc(collection(db, "applications"), {
        name: name.trim(),
        position,
        admissionNumber: admissionNumber.trim(),
        course: course.trim(),
        age: age.trim(),
        briefInfo: briefInfo.trim(),
        email: email.trim(),
        photoUrl,
        documentUrl,
        status: "pending",
        submittedAt: new Date().toISOString()
      });

      Speech.speak("Application submitted successfully. Returning home.", {
          onDone: () => router.replace("/home")
      });
    } catch (error) {
      console.error(error);
      Speech.speak("Error submitting. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.container}>
      <View style={styles.headerContainer}>
         <Text style={styles.header}>📝 Candidate Application</Text>
         <Text style={styles.subText}>Step {currentStep}/10</Text>
      </View>
      
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.formCard}>
          
          {/* 1. PHOTO UPLOAD */}
          <View style={[styles.fieldContainer, currentStep === 7 && styles.activeField]}>
              <TouchableOpacity onPress={pickImage} style={styles.imagePicker}>
                {photoUri ? (
                  <Image source={{ uri: photoUri }} style={styles.previewImage} />
                ) : (
                  <View style={styles.placeholderImage}>
                    <Text style={{fontSize: 24}}>📷</Text>
                    <Text style={styles.imageText}>Upload Photo</Text>
                  </View>
                )}
              </TouchableOpacity>
              {currentStep === 7 && <Text style={styles.helperText}>Tap above. Ask for help if needed.</Text>}
          </View>

          {/* 2. BASIC INFO */}
          <View style={[styles.fieldContainer, currentStep === 1 && styles.activeField]}>
            <TextInput placeholder="Full Name *" value={name} onChangeText={setName} style={styles.input} />
          </View>
          
          <View style={[styles.fieldContainer, styles.pickerContainer, currentStep === 2 && styles.activeField]}>
            <Picker selectedValue={position} onValueChange={setPosition}>
              <Picker.Item label="Select Position... *" value="" color="#999" />
              <Picker.Item label="President" value="President" />
              <Picker.Item label="Vice President" value="Vice President" />
              <Picker.Item label="Secretary General" value="Secretary General" />
              <Picker.Item label="Treasurer" value="Treasurer" />
              <Picker.Item label="Gender and Disability Rep" value="Gender and Disability Representative" />
              <Picker.Item label="Sports & Ent. Secretary" value="Sports, Entertainment and Security Secretary" />
            </Picker>
          </View>

          <View style={styles.rowInputs}>
             <View style={[styles.fieldContainer, {flex: 1, marginRight: 10}, currentStep === 3 && styles.activeField]}>
                <TextInput 
                    placeholder="Admin No *" 
                    value={admissionNumber} onChangeText={setAdmissionNumber} 
                    style={styles.input} 
                />
             </View>
             <View style={[styles.fieldContainer, {width: 80}, currentStep === 4 && styles.activeField]}>
                <TextInput 
                    placeholder="Age *" 
                    value={age} onChangeText={setAge} keyboardType="numeric" 
                    style={styles.input} 
                />
             </View>
          </View>

          <View style={[styles.fieldContainer, currentStep === 5 && styles.activeField]}>
            <TextInput placeholder="Course / Department *" value={course} onChangeText={setCourse} style={styles.input} />
          </View>

          <View style={[styles.fieldContainer, currentStep === 6 && styles.activeField]}>
            <TextInput placeholder="Email Address *" value={email} onChangeText={setEmail} keyboardType="email-address" style={styles.input} />
          </View>

          {/* 4. DOCUMENT UPLOAD */}
          <View style={[styles.fieldContainer, currentStep === 8 && styles.activeField]}>
            <Text style={styles.label}>Eligibility Document (PDF/Image) *</Text>
            <TouchableOpacity onPress={pickDocument} style={styles.docPicker}>
                <Text style={styles.docPickerText}>
                {documentName ? `📄 ${documentName}` : "📎 Select Document"}
                </Text>
            </TouchableOpacity>
            {currentStep === 8 && <Text style={styles.helperText}>Tap above to select PDF.</Text>}
          </View>

          {/* 5. BRIEF INFO */}
          <View style={[styles.fieldContainer, currentStep === 9 && styles.activeField]}>
            <TextInput 
                placeholder="Brief Info / Manifesto *" 
                value={briefInfo} onChangeText={setBriefInfo} multiline numberOfLines={4}
                style={[styles.input, { height: 100, textAlignVertical: 'top' }]} 
            />
          </View>

          {/* SUBMIT BUTTON */}
          <TouchableOpacity onPress={handleSubmit} style={styles.submitBtn} disabled={loading}>
            <Text style={styles.submitText}>
              {loading ? "Submitting..." : "Submit Application"}
            </Text>
          </TouchableOpacity>

        </View>
        <View style={{height: 100}} />
      </ScrollView>

      {/* --- FLOATING STATUS BAR --- */}
      <View style={styles.statusFooter}>
            <Text style={styles.statusText}>{statusText}</Text>
            {listening && (
                <Animated.View style={[styles.micIndicator, { transform: [{ scale: pulseAnim }] }]}>
                    <Text style={{fontSize: 20}}>🎤</Text>
                </Animated.View>
            )}
            
            {/* Reset Button if user gets stuck */}
            {!listening && (
                <TouchableOpacity onPress={() => startWizardStep(currentStep)} style={{marginLeft: 'auto'}}>
                    <Text style={{color: '#007AFF'}}>🔄 Re-ask</Text>
                </TouchableOpacity>
            )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F7FA" },
  headerContainer: { padding: 20, paddingTop: 50, backgroundColor: "#1A4A7A" },
  header: { fontSize: 24, fontWeight: "bold", color: "white" },
  subText: { color: "#E0E0E0", marginTop: 5 },
  scrollContent: { padding: 20 },
  formCard: { backgroundColor: "white", padding: 20, borderRadius: 12, elevation: 3 },
  
  // Highlight Active Field
  fieldContainer: { marginBottom: 15, borderRadius: 8 },
  activeField: { borderWidth: 2, borderColor: "#28a745", backgroundColor: "#e8f5e9", padding: 5 },
  helperText: { color: "#28a745", fontSize: 12, fontWeight: "bold", textAlign: "center", marginTop: 5 },

  imagePicker: { alignSelf: 'center' },
  previewImage: { width: 100, height: 100, borderRadius: 50, borderWidth: 3, borderColor: '#1E6BB8' },
  placeholderImage: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#ccc' },
  imageText: { fontSize: 10, color: '#666', marginTop: 5 },

  input: { borderWidth: 1, borderColor: "#ddd", padding: 12, borderRadius: 8, fontSize: 16, backgroundColor: '#fff', width: '100%' },
  rowInputs: { flexDirection: 'row', justifyContent: 'space-between' },
  pickerContainer: { borderWidth: 1, borderColor: "#ddd", borderRadius: 8, backgroundColor: "#fff" },
  
  label: { fontSize: 14, fontWeight: 'bold', color: '#444', marginBottom: 8 },
  docPicker: { 
    borderWidth: 1, 
    borderColor: "#1E6BB8", 
    borderStyle: 'dashed', 
    padding: 15, 
    borderRadius: 8, 
    alignItems: 'center',
    backgroundColor: '#F0F7FF'
  },
  docPickerText: { color: '#1E6BB8', fontWeight: '600' },
  
  submitBtn: { backgroundColor: "#28a745", padding: 15, borderRadius: 8, alignItems: "center", marginTop: 10 },
  submitText: { color: "white", fontWeight: "bold", fontSize: 18 },

  // Footer
  statusFooter: {
      position: 'absolute', bottom: 0, left: 0, right: 0,
      backgroundColor: '#fff', borderTopWidth: 1, borderColor: '#eee',
      padding: 15, flexDirection: 'row', alignItems: 'center',
      elevation: 10
  },
  statusText: { fontSize: 14, fontWeight: '600', color: '#555', marginRight: 10, flex: 1 },
  micIndicator: {
      width: 40, height: 40, borderRadius: 20, backgroundColor: '#E3F2FD',
      justifyContent: 'center', alignItems: 'center'
  }
});