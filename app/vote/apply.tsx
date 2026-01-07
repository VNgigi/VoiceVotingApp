import { Picker } from "@react-native-picker/picker";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { addDoc, collection } from "firebase/firestore";
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
import { db } from "../../firebaseConfig";

export default function CandidateApplication() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [position, setPosition] = useState("");
  const [admissionNumber, setAdmissionNumber] = useState("");
  const [course, setCourse] = useState("");
  const [age, setAge] = useState("");
  const [briefInfo, setBriefInfo] = useState("");
  const [email, setEmail] = useState("");
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const pickImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permissionResult.granted === false) {
      Alert.alert("Permission Required", "Allow access to photos to upload your passport.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
    });
    if (!result.canceled) setPhotoUri(result.assets[0].uri);
  };

  const handleSubmit = async () => {
    // 1. Updated Validation: Check ALL fields including briefInfo, course, and age
    if (
      !name.trim() || 
      !position || 
      !admissionNumber.trim() || 
      !course.trim() || 
      !age.trim() || 
      !briefInfo.trim() || 
      !email.trim() || 
      !photoUri
    ) {
      Alert.alert(
        "Missing Information", 
        "Please fill in ALL fields (including Course, Age, and Manifesto) and upload a photo."
      );
      return;
    }

    setLoading(true);
    try {
      // Save to 'applications' collection
      await addDoc(collection(db, "applications"), {
        name: name.trim(),
        position,
        admissionNumber: admissionNumber.trim(),
        course: course.trim(),
        age: age.trim(),
        briefInfo: briefInfo.trim(),
        email: email.trim(),
        photoUri,
        status: "pending",
        submittedAt: new Date().toISOString()
      });

      Alert.alert("Success", "Application submitted! The Electoral Commission will review it shortly.");
      router.replace("/home");
    } catch (error) {
      console.error(error);
      Alert.alert("Error", "Could not submit application.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === "ios" ? "padding" : "height"} 
      style={styles.container}
    >
      <View style={styles.headerContainer}>
         <Text style={styles.header}>📝 Candidate Application</Text>
         <Text style={styles.subText}>Fill in your details to run for office.</Text>
      </View>
      
      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        <View style={styles.formCard}>
          {/* Photo Upload */}
          <TouchableOpacity onPress={pickImage} style={styles.imagePicker}>
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.previewImage} />
            ) : (
              <View style={styles.placeholderImage}>
                <Text style={styles.cameraIcon}>📷</Text>
                <Text style={styles.imageText}>Upload Passport *</Text>
              </View>
            )}
          </TouchableOpacity>

          <TextInput placeholder="Full Name *" value={name} onChangeText={setName} style={styles.input} />
          
          <View style={styles.pickerContainer}>
            <Picker selectedValue={position} onValueChange={setPosition}>
              <Picker.Item label="Select Position... *" value="" color="#999" />
              <Picker.Item label="President" value="President" />
              <Picker.Item label="Vice President" value="Vice President" />
              <Picker.Item label="Secretary General" value="Secretary General" />
              <Picker.Item label="Treasurer" value="Treasurer" />
              <Picker.Item label="Gender Rep" value="Gender and Disability Representative" />
              <Picker.Item label="Sports & Security" value="Sports, Entertainment and Security Secretary" />
            </Picker>
          </View>

          <View style={styles.rowInputs}>
             <TextInput placeholder="Admission No *" value={admissionNumber} onChangeText={setAdmissionNumber} style={[styles.input, { flex: 1, marginRight: 5 }]} />
             <TextInput placeholder="Age" value={age} onChangeText={setAge} keyboardType="numeric" style={[styles.input, { width: 80 }]} />
          </View>

          <TextInput placeholder="Course / Department" value={course} onChangeText={setCourse} style={styles.input} />
          <TextInput placeholder="Email Address *" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" style={styles.input} />
          
          <TextInput 
            placeholder="Manifesto (Brief Info) *" 
            value={briefInfo} onChangeText={setBriefInfo} 
            multiline numberOfLines={4}
            style={[styles.input, { height: 100, textAlignVertical: 'top' }]} 
          />

          <TouchableOpacity onPress={handleSubmit} style={styles.submitBtn} disabled={loading}>
            <Text style={styles.submitText}>{loading ? "Submitting..." : "Submit Application"}</Text>
          </TouchableOpacity>
        </View>
        <View style={{ height: 50 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F7FA" },
  headerContainer: { padding: 20, paddingBottom: 10, backgroundColor: "#1A4A7A" },
  header: { fontSize: 24, fontWeight: "bold", color: "white" },
  subText: { color: "#E0E0E0", marginTop: 5 },
  scrollContent: { padding: 20 },
  formCard: { backgroundColor: "white", padding: 20, borderRadius: 12, elevation: 3 },
  imagePicker: { alignSelf: 'center', marginBottom: 20 },
  previewImage: { width: 110, height: 110, borderRadius: 55, borderWidth: 3, borderColor: '#1E6BB8' },
  placeholderImage: { width: 110, height: 110, borderRadius: 55, backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#ccc' },
  cameraIcon: { fontSize: 30 },
  imageText: { fontSize: 12, color: '#666', marginTop: 5 },
  input: { borderWidth: 1, borderColor: "#ddd", padding: 12, borderRadius: 8, marginBottom: 15, fontSize: 16, backgroundColor: '#fff' },
  rowInputs: { flexDirection: 'row', justifyContent: 'space-between' },
  pickerContainer: { borderWidth: 1, borderColor: "#ddd", borderRadius: 8, marginBottom: 15, backgroundColor: "#fff" },
  submitBtn: { backgroundColor: "#28a745", padding: 15, borderRadius: 8, alignItems: "center", marginTop: 10 },
  submitText: { color: "white", fontWeight: "bold", fontSize: 18 }
});