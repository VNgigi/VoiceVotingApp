import { Ionicons } from "@expo/vector-icons";
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
  Dimensions,
  Image,
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
import { db, storage } from "../../firebaseConfig";

// --- THEME ---
const PRIMARY_COLOR = "#4F46E5"; // Indigo 600
const BG_COLOR = "#F9FAFB"; // Slate 50
const TEXT_COLOR = "#1F2937"; // Gray 800
const INPUT_BG = "#F3F4F6"; // Gray 100
const ACTIVE_BG = "#EEF2FF"; // Indigo 50

const { width } = Dimensions.get("window");

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
        case 1: prompt = "Application started. Step 1. Please say your Full Name."; break;
        case 2: prompt = "Step 2. Say the position you are running for."; break;
        case 3: prompt = "Step 3. Say your Admission Number."; break;
        case 4: prompt = "Step 4. Say your Age."; break;
        case 5: prompt = "Step 5. Say your Course or Department."; break;
        case 6: prompt = "Step 6. Say your Email Address."; break;
        case 7: 
            prompt = "Step 7. Photo Upload. Tap the camera icon to select a photo. Say Next when done."; 
            break;
        case 8: 
            prompt = "Step 8. Document Upload. Tap the button to select your eligibility PDF. Say Next when done."; 
            break;
        case 9: prompt = "Step 9. Say a brief manifesto about yourself."; break;
        case 10: prompt = "Application complete. Say Submit to finish, or Cancel to exit."; break;
    }

    Speech.speak(prompt, {
        onDone: () => {
            if (step === 7 || step === 8) {
                setStatusText("Waiting for upload... Say 'Next'");
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
             setStatusText("Listening...");
        }
    } catch (e) {
        console.error("Mic Error", e);
    }
  };

  useSpeechRecognitionEvent("result", (event) => {
    const text = event.results[0]?.transcript;
    if (text) {
        if (listening && currentStep !== 7 && currentStep !== 8) {
             setStatusText(`"${text}"`);
        }
        if (event.isFinal) {
            handleVoiceInput(text);
        }
    }
  });

  const handleVoiceInput = (text: string) => {
    const cmd = text.toLowerCase();
    stopEverything();

    if (cmd.includes("cancel") || cmd.includes("exit") || cmd.includes("stop")) {
        router.back();
        return;
    }

    switch(currentStep) {
        case 1: // Name
            setName(text);
            Speech.speak(`Saved name ${text}.`, { onDone: () => startWizardStep(2) });
            break;
        case 2: // Position
            const validPositions = ["President", "Vice President", "Secretary General", "Treasurer", "Gender", "Sports", "Entertainment"];
            const match = validPositions.find(p => cmd.includes(p.toLowerCase()));
            if (match) {
                const fullPos = match === "Gender" ? "Gender and Disability Representative" : 
                                match === "Sports" || match === "Entertainment" ? "Sports, Entertainment and Security Secretary" : match;
                setPosition(fullPos);
                Speech.speak(`Selected ${match}.`, { onDone: () => startWizardStep(3) });
            } else {
                Speech.speak("Position not recognized. Please say it again.", { onDone: () => {startListening();} });
            }
            break;
        case 3: // Admin No
            setAdmissionNumber(text.replace(/ /g, "").toUpperCase()); 
            Speech.speak("Admission number saved.", { onDone: () => startWizardStep(4) });
            break;
        case 4: // Age
            const ageNum = text.match(/\d+/); 
            if (ageNum) {
                setAge(ageNum[0]);
                Speech.speak(`Age ${ageNum[0]} saved.`, { onDone: () => startWizardStep(5) });
            } else {
                Speech.speak("Please say a number.", { onDone: () => {startListening();} });
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
        case 7: // Photo
            if (cmd.includes("next") || cmd.includes("done")) {
                if (!photoUri) {
                    Speech.speak("No photo selected.", { onDone: () => {startListening(); } });
                } else {
                    startWizardStep(8);
                }
            } else {
                Speech.speak("Tap the camera icon, then say Next.", { onDone: () => {startListening(); } });
            }
            break;
        case 8: // Doc
            if (cmd.includes("next") || cmd.includes("done")) {
                if (!documentUri) {
                    Speech.speak("No document selected.", { onDone: () => {startListening(); } });
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
    Speech.stop(); 
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
    });
    if (!result.canceled) {
        setPhotoUri(result.assets[0].uri);
        Speech.speak("Photo selected. Say Next.");
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
      Speech.speak("Document selected. Say Next.");
    }
  };

  // --- SUBMIT LOGIC ---
  const handleSubmit = async () => {
    stopEverything();

    if (!name || !position || !admissionNumber || !course || !age || !briefInfo || !photoUri || !documentUri) {
      Speech.speak("Missing details. Please check the form.");
      Alert.alert("Missing Fields", "Please fill in all details.");
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

  // Progress Calculation
  const progress = (currentStep / 10) * 100;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      
      {/* --- HEADER --- */}
      <View style={styles.header}>
         <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={TEXT_COLOR} />
         </TouchableOpacity>
         <Text style={styles.headerTitle}>New Application</Text>
         <View style={{width: 24}} /> 
      </View>

      {/* --- PROGRESS BAR --- */}
      <View style={styles.progressContainer}>
         <View style={[styles.progressBar, { width: `${progress}%` }]} />
      </View>
      
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>Candidate Details</Text>
        
        {/* --- 1. PHOTO UPLOAD (Hero) --- */}
        <View style={styles.photoContainer}>
            <TouchableOpacity onPress={pickImage} style={[styles.imagePicker, currentStep === 7 && styles.activeBorder]}>
                {photoUri ? (
                    <Image source={{ uri: photoUri }} style={styles.previewImage} />
                ) : (
                    <View style={styles.placeholderImage}>
                        <Ionicons name="camera" size={32} color="#9CA3AF" />
                    </View>
                )}
                <View style={styles.editBadge}>
                    <Ionicons name="pencil" size={12} color="#fff" />
                </View>
            </TouchableOpacity>
            <Text style={styles.photoLabel}>Upload Passport Photo</Text>
        </View>


        {/* --- FORM FIELDS --- */}
        <View style={styles.formGrid}>
            
            {/* NAME */}
            <View style={[styles.inputWrapper, currentStep === 1 && styles.activeWrapper]}>
                <Ionicons name="person-outline" size={20} color="#6B7280" style={styles.icon} />
                <View style={{flex: 1}}>
                    <Text style={styles.label}>Full Name</Text>
                    <TextInput 
                        placeholder="John Doe" 
                        value={name} onChangeText={setName} 
                        style={styles.input} 
                    />
                </View>
            </View>

            {/* POSITION (Picker) */}
            <View style={[styles.inputWrapper, currentStep === 2 && styles.activeWrapper]}>
                <Ionicons name="ribbon-outline" size={20} color="#6B7280" style={styles.icon} />
                <View style={{flex: 1}}>
                    <Text style={styles.label}>Position</Text>
                    <View style={styles.pickerBox}>
                        <Picker selectedValue={position} onValueChange={setPosition} style={{marginTop: -10, marginBottom: -10}}>
                            <Picker.Item label="Select Position..." value="" color="#9CA3AF" />
                            <Picker.Item label="President" value="President" />
                            <Picker.Item label="Vice President" value="Vice President" />
                            <Picker.Item label="Secretary General" value="Secretary General" />
                            <Picker.Item label="Treasurer" value="Treasurer" />
                            <Picker.Item label="Gender & Disability Rep" value="Gender and Disability Representative" />
                            <Picker.Item label="Sports & Ent. Secretary" value="Sports, Entertainment and Security Secretary" />
                        </Picker>
                    </View>
                </View>
            </View>

            {/* ROW: ADMIN & AGE */}
            <View style={styles.row}>
                <View style={[styles.inputWrapper, {flex: 1}, currentStep === 3 && styles.activeWrapper]}>
                    <Ionicons name="id-card-outline" size={20} color="#6B7280" style={styles.icon} />
                    <View style={{flex: 1}}>
                        <Text style={styles.label}>Admin No.</Text>
                        <TextInput placeholder="12345" value={admissionNumber} onChangeText={setAdmissionNumber} style={styles.input} />
                    </View>
                </View>
                
                <View style={[styles.inputWrapper, {width: 100}, currentStep === 4 && styles.activeWrapper]}>
                    <View style={{flex: 1, paddingLeft: 12}}>
                        <Text style={styles.label}>Age</Text>
                        <TextInput placeholder="20" value={age} onChangeText={setAge} keyboardType="numeric" style={styles.input} />
                    </View>
                </View>
            </View>

            {/* COURSE */}
            <View style={[styles.inputWrapper, currentStep === 5 && styles.activeWrapper]}>
                <Ionicons name="school-outline" size={20} color="#6B7280" style={styles.icon} />
                <View style={{flex: 1}}>
                    <Text style={styles.label}>Course / Department</Text>
                    <TextInput placeholder="Computer Science" value={course} onChangeText={setCourse} style={styles.input} />
                </View>
            </View>

            {/* EMAIL */}
            <View style={[styles.inputWrapper, currentStep === 6 && styles.activeWrapper]}>
                <Ionicons name="mail-outline" size={20} color="#6B7280" style={styles.icon} />
                <View style={{flex: 1}}>
                    <Text style={styles.label}>Email Address</Text>
                    <TextInput placeholder="email@student.com" value={email} onChangeText={setEmail} keyboardType="email-address" style={styles.input} />
                </View>
            </View>

            {/* DOCUMENT UPLOAD */}
            <View style={[styles.uploadBox, currentStep === 8 && styles.activeWrapper]}>
                 <Text style={styles.uploadTitle}>Eligibility Document</Text>
                 <TouchableOpacity onPress={pickDocument} style={styles.uploadBtn}>
                    <Ionicons name={documentName ? "document-text" : "cloud-upload-outline"} size={24} color={PRIMARY_COLOR} />
                    <Text style={styles.uploadText} numberOfLines={1}>
                        {documentName ? documentName : "Click to upload PDF"}
                    </Text>
                 </TouchableOpacity>
            </View>

            {/* MANIFESTO */}
            <View style={[styles.inputWrapper, {alignItems: 'flex-start', paddingTop: 12}, currentStep === 9 && styles.activeWrapper]}>
                <Ionicons name="megaphone-outline" size={20} color="#6B7280" style={[styles.icon, {marginTop: 4}]} />
                <View style={{flex: 1}}>
                    <Text style={styles.label}>Manifesto / Brief Info</Text>
                    <TextInput 
                        placeholder="Tell us why we should vote for you..." 
                        value={briefInfo} onChangeText={setBriefInfo} 
                        multiline numberOfLines={4}
                        style={[styles.input, { height: 80, textAlignVertical: 'top' }]} 
                    />
                </View>
            </View>

            {/* SUBMIT */}
            <TouchableOpacity 
                onPress={handleSubmit} 
                style={[styles.submitBtn, loading && {opacity: 0.7}]} 
                disabled={loading}
            >
                <Text style={styles.submitText}>
                    {loading ? "Submitting..." : "Submit Application"}
                </Text>
                {!loading && <Ionicons name="checkmark-circle" size={20} color="#fff" />}
            </TouchableOpacity>

        </View>
        <View style={{height: 120}} /> 
      </ScrollView>

      {/* --- FLOATING STATUS BAR --- */}
      <View style={styles.floatingContainer}>
         <View style={styles.statusPill}>
             {listening && <View style={styles.statusDot} />}
             <Text style={styles.statusText} numberOfLines={1}>{statusText}</Text>
         </View>
         
         <TouchableOpacity 
            onPress={() => startWizardStep(currentStep)}
            style={styles.micButton}
         >
             {listening ? (
                 <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                     <Ionicons name="mic" size={24} color="#fff" />
                 </Animated.View>
             ) : (
                <Ionicons name="refresh" size={24} color="#fff" />
             )}
         </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG_COLOR },
  
  // HEADER
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16,
    backgroundColor: "#fff",
  },
  backBtn: { marginRight: 16 },
  headerTitle: { fontSize: 20, fontWeight: "700", color: TEXT_COLOR },
  
  // PROGRESS
  progressContainer: { width: '100%', height: 4, backgroundColor: "#E5E7EB" },
  progressBar: { height: '100%', backgroundColor: PRIMARY_COLOR },

  scrollContent: { padding: 24 },
  sectionTitle: { fontSize: 18, fontWeight: "700", color: TEXT_COLOR, marginBottom: 20 },

  // PHOTO UPLOAD
  photoContainer: { alignItems: 'center', marginBottom: 32 },
  imagePicker: { position: 'relative' },
  previewImage: { width: 100, height: 100, borderRadius: 50, borderWidth: 3, borderColor: '#fff' },
  placeholderImage: { width: 100, height: 100, borderRadius: 50, backgroundColor: INPUT_BG, justifyContent: 'center', alignItems: 'center' },
  editBadge: { position: 'absolute', bottom: 0, right: 0, backgroundColor: PRIMARY_COLOR, padding: 6, borderRadius: 20, borderWidth: 2, borderColor: '#fff' },
  photoLabel: { marginTop: 12, fontSize: 14, color: PRIMARY_COLOR, fontWeight: "600" },
  activeBorder: { borderWidth: 2, borderColor: PRIMARY_COLOR, borderRadius: 55, padding: 2 },

  // FORM GRID
  formGrid: { gap: 16 },
  row: { flexDirection: 'row', gap: 12 },
  
  // INPUT WRAPPER
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 12,
    borderWidth: 1, borderColor: "transparent",
    shadowColor: "#000", shadowOpacity: 0.03, shadowRadius: 6, elevation: 1
  },
  activeWrapper: {
    borderColor: PRIMARY_COLOR,
    backgroundColor: ACTIVE_BG,
    shadowColor: PRIMARY_COLOR, shadowOpacity: 0.1, shadowRadius: 8
  },
  icon: { marginRight: 12 },
  label: { fontSize: 11, color: "#6B7280", fontWeight: "600", marginBottom: 2, textTransform: 'uppercase' },
  input: { fontSize: 16, color: TEXT_COLOR, padding: 0, height: 24 },
  pickerBox: { marginLeft: -8 },

  // DOCUMENT UPLOAD
  uploadBox: { 
      backgroundColor: "#fff", borderRadius: 16, padding: 16, 
      borderWidth: 1, borderColor: "#E5E7EB", borderStyle: 'dashed' 
  },
  uploadTitle: { fontSize: 12, color: "#6B7280", fontWeight: "600", marginBottom: 8, textTransform: 'uppercase' },
  uploadBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, backgroundColor: ACTIVE_BG, borderRadius: 8 },
  uploadText: { color: PRIMARY_COLOR, fontWeight: "600", fontSize: 14, flex: 1 },

  // SUBMIT
  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: PRIMARY_COLOR,
    padding: 18, borderRadius: 16,
    marginTop: 16,
    shadowColor: PRIMARY_COLOR, shadowOpacity: 0.3, shadowRadius: 10, elevation: 4
  },
  submitText: { color: "white", fontWeight: "700", fontSize: 16 },

  // FLOATING STATUS
  floatingContainer: {
      position: 'absolute', bottom: 30, left: 24, right: 24,
      flexDirection: 'row', alignItems: 'center', gap: 12
  },
  statusPill: {
      flex: 1, flexDirection: 'row', alignItems: 'center',
      backgroundColor: "rgba(31, 41, 55, 0.9)", // Dark gray backdrop
      paddingHorizontal: 16, paddingVertical: 14,
      borderRadius: 30,
      shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 10, elevation: 5
  },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#EF4444", marginRight: 10 },
  statusText: { fontSize: 14, color: "#fff", fontWeight: "600" },
  
  micButton: {
      width: 52, height: 52, borderRadius: 26, 
      backgroundColor: PRIMARY_COLOR,
      justifyContent: 'center', alignItems: 'center',
      shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 8, elevation: 6
  }
});