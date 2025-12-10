import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc
} from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { db } from "../firebaseConfig";

interface Candidate {
  id: string;
  name: string;
  position: string;
  admissionNumber: string;
  course: string;
  email: string;
  photoUri?: string;
  status?: string; // For applications
  [key: string]: any;
}

export default function Admin() {
  const [activeTab, setActiveTab] = useState("candidates"); // 'candidates' or 'applications'
  const [contestants, setContestants] = useState<Candidate[]>([]);
  const [applications, setApplications] = useState<Candidate[]>([]);
  const [resultsPublished, setResultsPublished] = useState(false);

  useEffect(() => {
    // 1. Fetch Approved Candidates
    const unsubContestants = onSnapshot(collection(db, "contestants"), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Candidate));
      setContestants(data.sort((a, b) => a.position.localeCompare(b.position)));
    });

    // 2. Fetch Pending Applications
    const unsubApplications = onSnapshot(collection(db, "applications"), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Candidate));
      setApplications(data);
    });

    // 3. Fetch Settings
    const unsubSettings = onSnapshot(doc(db, "settings", "election"), (doc) => {
      if (doc.exists()) setResultsPublished(doc.data().resultsPublished);
    });

    return () => { unsubContestants(); unsubApplications(); unsubSettings(); };
  }, []);

  // --- APPROVE LOGIC ---
  const handleApprove = async (app: Candidate) => {
    try {
      // 1. Add to Contestants
      const { id, status, submittedAt, ...candidateData } = app; // Remove application-specific fields
      await addDoc(collection(db, "contestants"), { ...candidateData, votes: 0 });
      
      // 2. Delete from Applications
      await deleteDoc(doc(db, "applications", app.id));
      
      Alert.alert("Approved", `${app.name} is now a candidate.`);
    } catch (e) {
      Alert.alert("Error", "Could not approve candidate.");
    }
  };

  const handleReject = async (id: string) => {
    Alert.alert("Reject Application", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      { 
        text: "Reject & Delete", 
        style: "destructive", 
        onPress: async () => await deleteDoc(doc(db, "applications", id)) 
      }
    ]);
  };

  const handleDeleteCandidate = async (id: string) => {
    Alert.alert("Delete Candidate", "This action cannot be undone.", [
      { text: "Cancel" },
      { text: "Delete", style: "destructive", onPress: async () => await deleteDoc(doc(db, "contestants", id)) }
    ]);
  };

  const toggleResults = async () => {
    await setDoc(doc(db, "settings", "election"), { resultsPublished: !resultsPublished }, { merge: true });
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerContainer}>
         <Text style={styles.header}>👮 Admin Dashboard</Text>
      </View>

      {/* TABS */}
      <View style={styles.tabContainer}>
        <TouchableOpacity 
          style={[styles.tab, activeTab === "candidates" && styles.activeTab]} 
          onPress={() => setActiveTab("candidates")}
        >
          <Text style={[styles.tabText, activeTab === "candidates" && styles.activeTabText]}>
            Active Candidates
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === "applications" && styles.activeTab]} 
          onPress={() => setActiveTab("applications")}
        >
          <Text style={[styles.tabText, activeTab === "applications" && styles.activeTabText]}>
            Review Pending ({applications.length})
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        {/* VIEW 1: PENDING APPLICATIONS */}
        {activeTab === "applications" && (
          <View>
            {applications.length === 0 ? (
               <Text style={styles.emptyText}>No pending applications.</Text>
            ) : (
              applications.map((app) => (
                <View key={app.id} style={styles.card}>
                  <View style={styles.cardHeader}>
                    {app.photoUri && <Image source={{ uri: app.photoUri }} style={styles.avatar} />}
                    <View style={{flex: 1, marginLeft: 10}}>
                      <Text style={styles.name}>{app.name}</Text>
                      <Text style={styles.position}>Running for: {app.position}</Text>
                      <Text style={styles.detail}>{app.admissionNumber}</Text>
                    </View>
                  </View>
                  <View style={styles.btnRow}>
                    <TouchableOpacity onPress={() => handleReject(app.id)} style={[styles.btn, styles.rejectBtn]}>
                      <Text style={styles.btnText}>Reject Application</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleApprove(app)} style={[styles.btn, styles.approveBtn]}>
                      <Text style={styles.btnText}>Approve ✅</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* VIEW 2: ACTIVE CANDIDATES */}
        {activeTab === "candidates" && (
          <View>
            {contestants.map((c) => (
              <View key={c.id} style={styles.row}>
                <View>
                  <Text style={styles.rowName}>{c.name}</Text>
                  <Text style={styles.rowPos}>{c.position}</Text>
                </View>
                <TouchableOpacity onPress={() => handleDeleteCandidate(c.id)}>
                  <Text style={styles.deleteText}>Delete</Text>
                </TouchableOpacity>
              </View>
            ))}
            <View style={{ height: 100 }} />
          </View>
        )}

      </ScrollView>

      {/* PUBLISH BUTTON */}
      <TouchableOpacity 
        style={[styles.publishBtn, { backgroundColor: resultsPublished ? "#d9534f" : "#2553afff" }]}
        onPress={toggleResults}
      >
        <Text style={styles.publishText}>
          {resultsPublished ? "🚫 Unpublish Results" : "📢 Publish Results"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F7FA" },
  headerContainer: { padding: 20, paddingTop: 50, backgroundColor: "#fff" },
  header: { fontSize: 24, fontWeight: "bold", color: "#1A4A7A" },
  
  tabContainer: { flexDirection: 'row', backgroundColor: 'white', marginBottom: 10 },
  tab: { flex: 1, padding: 15, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  activeTab: { borderBottomColor: '#1E6BB8' },
  tabText: { color: '#666', fontWeight: 'bold' },
  activeTabText: { color: '#1E6BB8' },
  
  scrollContent: { padding: 15 },
  emptyText: { textAlign: 'center', marginTop: 20, color: '#999', fontStyle: 'italic' },

  // Card Styles
  card: { backgroundColor: 'white', padding: 15, borderRadius: 10, marginBottom: 15, elevation: 2 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  avatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#eee' },
  name: { fontSize: 18, fontWeight: 'bold' },
  position: { color: '#1E6BB8', fontWeight: '600' },
  detail: { color: '#888', fontSize: 12 },
  
  btnRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  btn: { paddingVertical: 8, paddingHorizontal: 15, borderRadius: 6 },
  approveBtn: { backgroundColor: '#28a745' },
  rejectBtn: { backgroundColor: '#dc3545' },
  btnText: { color: 'white', fontWeight: 'bold' },

  // Row Styles
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'white', padding: 15, borderRadius: 8, marginBottom: 8 },
  rowName: { fontSize: 16, fontWeight: 'bold' },
  rowPos: { fontSize: 14, color: '#666' },
  deleteText: { color: 'red', fontWeight: 'bold' },

  publishBtn: { position: "absolute", bottom: 20, left: 20, right: 20, padding: 15, borderRadius: 12, alignItems: "center", elevation: 5 },
  publishText: { color: "white", fontSize: 18, fontWeight: "bold" }
});