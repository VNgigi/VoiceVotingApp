import { Picker } from "@react-native-picker/picker";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { addDoc, collection } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import React, { useState } from "react";
import {
  Alert,
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
  
  // --- STATE VARIABLES ---
  const [name, setName] = useState("");
  const [position, setPosition] = useState("");
  const [admissionNumber, setAdmissionNumber] = useState(""); // Added
  const [course, setCourse] = useState(""); // Added
  const [age, setAge] = useState(""); // Added
  const [briefInfo, setBriefInfo] = useState(""); // Added
  const [email, setEmail] = useState("");
  
  // File States
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [documentUri, setDocumentUri] = useState<string | null>(null);
  const [documentName, setDocumentName] = useState<string | null>(null);
  
  const [loading, setLoading] = useState(false);

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
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
    });
    if (!result.canceled) setPhotoUri(result.assets[0].uri);
  };

  const pickDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf", "image/*"],
    });
    if (!result.canceled) {
      setDocumentUri(result.assets[0].uri);
      setDocumentName(result.assets[0].name);
    }
  };

  // --- SUBMIT LOGIC ---
  const handleSubmit = async () => {
    if (!name || !position || !admissionNumber || !course || !age || !briefInfo || !photoUri || !documentUri) {
      Alert.alert("Missing Fields", "Please fill in all details and upload documents.");
      return;
    }

    setLoading(true);
    try {
      // 1. Upload Files
      const photoUrl = await uploadFile(photoUri, "passports", "photo.jpg");
      const documentUrl = await uploadFile(documentUri, "eligibility_docs", documentName || "doc.pdf");

      // 2. Save Data to Firestore
      await addDoc(collection(db, "applications"), {
        name: name.trim(),
        position,
        admissionNumber: admissionNumber.trim(), // Saved
        course: course.trim(), // Saved
        age: age.trim(), // Saved
        briefInfo: briefInfo.trim(), // Saved
        email: email.trim(),
        photoUrl,
        documentUrl,
        status: "pending",
        submittedAt: new Date().toISOString()
      });

      Alert.alert("Success", "Application submitted successfully!");
      router.replace("/home");
    } catch (error) {
      console.error(error);
      Alert.alert("Error", "Submission failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.container}>
      <View style={styles.headerContainer}>
         <Text style={styles.header}>📝 Candidate Application</Text>
         <Text style={styles.subText}>Fill in all details to run for office.</Text>
      </View>
      
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.formCard}>
          
          {/* 1. PHOTO UPLOAD */}
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

          {/* 2. BASIC INFO */}
          <TextInput placeholder="Full Name *" value={name} onChangeText={setName} style={styles.input} />
          
          <View style={styles.pickerContainer}>
            <Picker selectedValue={position} onValueChange={setPosition}>
              <Picker.Item label="Select Position... *" value="" color="#999" />
              <Picker.Item label="President" value="President" />
              <Picker.Item label="Vice President" value="Vice President" />
              <Picker.Item label="Secretary General" value="Secretary General" />
              <Picker.Item label="Treasurer" value="Treasurer" />
              <Picker.Item label="Gender and Disability Representative" value="Gender and Disability Representative" />
              <Picker.Item label="Sports, Entertainment and Security Secretary" value="Sports, Entertainment and Security Secretary" />
            </Picker>
          </View>

          {/* 3. NEW FIELDS (Row for Admin No & Age) */}
          <View style={styles.rowInputs}>
             <TextInput 
               placeholder="Admin No *" 
               value={admissionNumber} 
               onChangeText={setAdmissionNumber} 
               style={[styles.input, { flex: 1, marginRight: 10 }]} 
             />
             <TextInput 
               placeholder="Age *" 
               value={age} 
               onChangeText={setAge} 
               keyboardType="numeric" 
               style={[styles.input, { width: 80 }]} 
             />
          </View>

          <TextInput 
            placeholder="Course / Department *" 
            value={course} 
            onChangeText={setCourse} 
            style={styles.input} 
          />

          <TextInput 
            placeholder="Email Address *" 
            value={email} 
            onChangeText={setEmail} 
            keyboardType="email-address" 
            autoCapitalize="none" 
            style={styles.input} 
          />

          {/* 4. DOCUMENT UPLOAD */}
          <Text style={styles.label}>Eligibility Document (PDF/Image) *</Text>
          <TouchableOpacity onPress={pickDocument} style={styles.docPicker}>
            <Text style={styles.docPickerText}>
              {documentName ? `📄 ${documentName}` : "📎 Select Document"}
            </Text>
          </TouchableOpacity>

          {/* 5. BRIEF INFO / MANIFESTO */}
          <TextInput 
            placeholder="Brief Info / Manifesto *" 
            value={briefInfo} 
            onChangeText={setBriefInfo} 
            multiline 
            numberOfLines={4}
            style={[styles.input, { height: 100, textAlignVertical: 'top' }]} 
          />

          {/* SUBMIT BUTTON */}
          <TouchableOpacity onPress={handleSubmit} style={styles.submitBtn} disabled={loading}>
            <Text style={styles.submitText}>
              {loading ? "Submitting..." : "Submit Application"}
            </Text>
          </TouchableOpacity>

        </View>
        <View style={{height: 50}} />
      </ScrollView>
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
  
  imagePicker: { alignSelf: 'center', marginBottom: 20 },
  previewImage: { width: 100, height: 100, borderRadius: 50, borderWidth: 3, borderColor: '#1E6BB8' },
  placeholderImage: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#ccc' },
  imageText: { fontSize: 10, color: '#666', marginTop: 5 },

  input: { borderWidth: 1, borderColor: "#ddd", padding: 12, borderRadius: 8, marginBottom: 15, fontSize: 16, backgroundColor: '#fff' },
  rowInputs: { flexDirection: 'row', justifyContent: 'space-between' },
  pickerContainer: { borderWidth: 1, borderColor: "#ddd", borderRadius: 8, marginBottom: 15, backgroundColor: "#fff" },
  
  label: { fontSize: 14, fontWeight: 'bold', color: '#444', marginBottom: 8 },
  docPicker: { 
    borderWidth: 1, 
    borderColor: "#1E6BB8", 
    borderStyle: 'dashed', 
    padding: 15, 
    borderRadius: 8, 
    marginBottom: 15, 
    alignItems: 'center',
    backgroundColor: '#F0F7FF'
  },
  docPickerText: { color: '#1E6BB8', fontWeight: '600' },
  
  submitBtn: { backgroundColor: "#28a745", padding: 15, borderRadius: 8, alignItems: "center", marginTop: 10 },
  submitText: { color: "white", fontWeight: "bold", fontSize: 18 }
});