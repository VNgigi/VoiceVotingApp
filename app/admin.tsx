import { Audio } from "expo-av"; // 1. Import Audio
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc
} from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { db } from "./../firebaseConfig"; // Check your path

// --- TYPES ---
interface Candidate {
  id: string;
  name: string;
  position: string;
  admissionNumber: string;
  photoUrl?: string;
  documentUrl?: string;
  briefInfo?: string;
  [key: string]: any;
}

interface Incident {
  id: string;
  category: string;
  description: string;
  audioUrl?: string; // Voice note URL
  timestamp: any;
}

export default function Admin() {
  const [activeTab, setActiveTab] = useState("candidates"); 
  
  // Data State
  const [contestants, setContestants] = useState<Candidate[]>([]);
  const [applications, setApplications] = useState<Candidate[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]); // New State
  
  const [resultsPublished, setResultsPublished] = useState(false);
  const [sound, setSound] = useState<Audio.Sound | null>(null);

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

    // 3. Fetch Incident Reports (New)
    const qIncidents = query(collection(db, "incidents"), orderBy("timestamp", "desc"));
    const unsubIncidents = onSnapshot(qIncidents, (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Incident));
        setIncidents(data);
    });

    // 4. Fetch Settings
    const unsubSettings = onSnapshot(doc(db, "settings", "election"), (doc) => {
      if (doc.exists()) setResultsPublished(doc.data().resultsPublished);
    });

    return () => { 
        unsubContestants(); 
        unsubApplications(); 
        unsubIncidents();
        unsubSettings(); 
        if (sound) sound.unloadAsync();
    };
  }, []);

  // --- ACTIONS ---

  const handleApprove = async (app: Candidate) => {
    try {
      const { id, ...candidateData } = app; 
      await addDoc(collection(db, "contestants"), { ...candidateData, votes: 0, approvedAt: new Date().toISOString() });
      await deleteDoc(doc(db, "applications", app.id));
      Alert.alert("Approved", `${app.name} added to ballot.`);
    } catch (e) { Alert.alert("Error", "Could not approve."); }
  };

  const handleReject = async (id: string) => {
    Alert.alert("Confirm Reject", "Delete this application?", [
      { text: "Cancel" },
      { text: "Delete", style: "destructive", onPress: async () => await deleteDoc(doc(db, "applications", id)) }
    ]);
  };

  const handleDeleteCandidate = async (id: string) => {
    Alert.alert("Remove Candidate", "Remove from live ballot?", [
        { text: "Cancel" },
        { text: "Remove", style: "destructive", onPress: async () => await deleteDoc(doc(db, "contestants", id)) }
    ]);
  };

  // --- REPORT ACTIONS ---
  const playAudio = async (url: string) => {
      try {
          if (sound) await sound.unloadAsync(); // Stop previous
          const { sound: newSound } = await Audio.Sound.createAsync({ uri: url });
          setSound(newSound);
          await newSound.playAsync();
      } catch (e) {
          Alert.alert("Playback Error", "Could not play audio.");
      }
  };

  const resolveIncident = async (id: string) => {
      Alert.alert("Resolve Incident", "Mark as resolved and delete from list?", [
          { text: "Cancel" },
          { text: "Resolve", onPress: async () => await deleteDoc(doc(db, "incidents", id)) }
      ]);
  };

  const toggleResults = async () => {
    await setDoc(doc(db, "settings", "election"), { resultsPublished: !resultsPublished }, { merge: true });
  };

  const openDocument = (url?: string) => {
    if (url) Linking.openURL(url).catch(() => Alert.alert("Error", "Bad URL"));
    else Alert.alert("No File", "No document attached.");
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerContainer}>
         <Text style={styles.header}>👮 Admin Dashboard</Text>
      </View>

      {/* TABS */}
      <View style={styles.tabContainer}>
        <TouchableOpacity style={[styles.tab, activeTab === "candidates" && styles.activeTab]} onPress={() => setActiveTab("candidates")}>
          <Text style={[styles.tabText, activeTab === "candidates" && styles.activeTabText]}>Ballot ({contestants.length})</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={[styles.tab, activeTab === "applications" && styles.activeTab]} onPress={() => setActiveTab("applications")}>
          <Text style={[styles.tabText, activeTab === "applications" && styles.activeTabText]}>Pending ({applications.length})</Text>
        </TouchableOpacity>

        {/* NEW TAB: REPORTS */}
        <TouchableOpacity style={[styles.tab, activeTab === "reports" && styles.activeTab]} onPress={() => setActiveTab("reports")}>
          <Text style={[styles.tabText, activeTab === "reports" && styles.activeTabText]}>Reports ({incidents.length})</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        {/* VIEW 1: APPLICATIONS */}
        {activeTab === "applications" && (
          <View>
            {applications.map((app) => (
                <View key={app.id} style={styles.card}>
                  <View style={styles.cardHeader}>
                    {app.photoUrl ? <Image source={{ uri: app.photoUrl }} style={styles.avatar} /> : <View style={styles.avatar} />}
                    <View style={{flex: 1, marginLeft: 12}}>
                      <Text style={styles.name}>{app.name}</Text>
                      <Text style={styles.position}>{app.position}</Text>
                    </View>
                  </View>
                  <TouchableOpacity style={styles.docButton} onPress={() => openDocument(app.documentUrl)}>
                    <Text style={styles.docButtonText}>📄 View Docs</Text>
                  </TouchableOpacity>
                  <View style={styles.btnRow}>
                    <TouchableOpacity onPress={() => handleReject(app.id)} style={[styles.btn, styles.rejectBtn]}>
                      <Text style={{color:'red', fontWeight:'bold'}}>Reject</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleApprove(app)} style={[styles.btn, styles.approveBtn]}>
                      <Text style={styles.btnText}>Approve</Text>
                    </TouchableOpacity>
                  </View>
                </View>
            ))}
            {applications.length === 0 && <Text style={styles.emptyText}>No pending applications.</Text>}
          </View>
        )}

        {/* VIEW 2: BALLOT */}
        {activeTab === "candidates" && (
          <View>
            {contestants.map((c) => (
              <View key={c.id} style={styles.row}>
                <View>
                    <Text style={styles.rowName}>{c.name}</Text>
                    <Text style={styles.rowPos}>{c.position}</Text>
                </View>
                <TouchableOpacity onPress={() => handleDeleteCandidate(c.id)}>
                  <Text style={styles.deleteText}>Remove</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* VIEW 3: INCIDENT REPORTS (NEW) */}
        {activeTab === "reports" && (
            <View>
                {incidents.map((inc) => (
                    <View key={inc.id} style={styles.reportCard}>
                        <View style={styles.reportHeader}>
                            <Text style={styles.reportCategory}>⚠️ {inc.category}</Text>
                            <Text style={styles.reportTime}>
                                {inc.timestamp?.toDate ? new Date(inc.timestamp.toDate()).toLocaleDateString() : "Just now"}
                            </Text>
                        </View>
                        
                        <Text style={styles.reportDesc}>{inc.description}</Text>
                        
                        {/* Audio Player */}
                        {inc.audioUrl && (
                            <TouchableOpacity style={styles.audioBtn} onPress={() => playAudio(inc.audioUrl!)}>
                                <Text style={styles.audioText}>▶ Play Voice Evidence</Text>
                            </TouchableOpacity>
                        )}

                        <TouchableOpacity style={styles.resolveBtn} onPress={() => resolveIncident(inc.id)}>
                            <Text style={styles.resolveText}>Mark Resolved</Text>
                        </TouchableOpacity>
                    </View>
                ))}
                {incidents.length === 0 && <Text style={styles.emptyText}>No incidents reported. Good job! 🛡️</Text>}
            </View>
        )}

      </ScrollView>

      {/* PUBLISH BUTTON */}
      <TouchableOpacity 
        style={[styles.publishBtn, { backgroundColor: resultsPublished ? "#d9534f" : "#1E6BB8" }]}
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
  headerContainer: { padding: 20, paddingTop: 60, backgroundColor: "#fff" },
  header: { fontSize: 24, fontWeight: "bold", color: "#1A4A7A" },
  
  tabContainer: { flexDirection: 'row', backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#eee' },
  tab: { flex: 1, padding: 15, alignItems: 'center', borderBottomWidth: 3, borderBottomColor: 'transparent' },
  activeTab: { borderBottomColor: '#1E6BB8' },
  tabText: { color: '#666', fontWeight: 'bold', fontSize: 12 },
  activeTabText: { color: '#1E6BB8' },
  
  scrollContent: { padding: 15, paddingBottom: 100 },
  emptyText: { textAlign: 'center', marginTop: 40, color: '#999' },

  // Cards
  card: { backgroundColor: 'white', padding: 15, borderRadius: 12, marginBottom: 15, elevation: 2 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  avatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#EDF2F7' },
  name: { fontSize: 18, fontWeight: 'bold', color: '#2D3748' },
  position: { color: '#1E6BB8', fontWeight: '700', fontSize: 14 },
  
  docButton: { backgroundColor: '#F0F7FF', padding: 10, borderRadius: 8, alignItems: 'center', marginBottom: 10, borderStyle:'dashed', borderWidth:1, borderColor:'#1E6BB8' },
  docButtonText: { color: '#1E6BB8', fontWeight: 'bold' },

  btnRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  btn: { paddingVertical: 8, paddingHorizontal: 15, borderRadius: 8 },
  approveBtn: { backgroundColor: '#28a745' },
  rejectBtn: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ccc' },
  btnText: { color: 'white', fontWeight: 'bold' },

  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'white', padding: 15, borderRadius: 10, marginBottom: 10 },
  rowName: { fontSize: 16, fontWeight: 'bold' },
  rowPos: { fontSize: 13, color: '#666' },
  deleteText: { color: '#d9534f', fontWeight: 'bold' },

  // REPORT STYLES (NEW)
  reportCard: { backgroundColor: '#FFF5F5', padding: 15, borderRadius: 10, marginBottom: 15, borderLeftWidth: 5, borderLeftColor: '#C0392B', elevation: 2 },
  reportHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  reportCategory: { fontWeight: 'bold', color: '#C0392B', fontSize: 16 },
  reportTime: { color: '#888', fontSize: 12 },
  reportDesc: { fontSize: 14, color: '#333', marginBottom: 15, lineHeight: 20 },
  
  audioBtn: { backgroundColor: '#2C3E50', flexDirection: 'row', padding: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginBottom: 15 },
  audioText: { color: 'white', fontWeight: 'bold' },
  
  resolveBtn: { alignSelf: 'flex-end', padding: 5 },
  resolveText: { color: '#888', textDecorationLine: 'underline', fontSize: 12 },

  publishBtn: { position: "absolute", bottom: 30, left: 20, right: 20, padding: 18, borderRadius: 15, alignItems: "center", elevation: 8 },
  publishText: { color: "white", fontSize: 16, fontWeight: "bold" }
});