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
  Linking // 1. Added Linking to open URLs
  ,
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
  photoUrl?: string; // Standardized to URL
  documentUrl?: string; // Added for eligibility docs
  briefInfo?: string;
  status?: string;
  [key: string]: any;
}

export default function Admin() {
  const [activeTab, setActiveTab] = useState("candidates"); 
  const [contestants, setContestants] = useState<Candidate[]>([]);
  const [applications, setApplications] = useState<Candidate[]>([]);
  const [resultsPublished, setResultsPublished] = useState(false);

  useEffect(() => {
    // Fetch Approved Candidates
    const unsubContestants = onSnapshot(collection(db, "contestants"), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Candidate));
      setContestants(data.sort((a, b) => a.position.localeCompare(b.position)));
    });

    // Fetch Pending Applications
    const unsubApplications = onSnapshot(collection(db, "applications"), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Candidate));
      setApplications(data);
    });

    // Fetch Settings
    const unsubSettings = onSnapshot(doc(db, "settings", "election"), (doc) => {
      if (doc.exists()) setResultsPublished(doc.data().resultsPublished);
    });

    return () => { unsubContestants(); unsubApplications(); unsubSettings(); };
  }, []);

  // --- APPROVE LOGIC ---
  const handleApprove = async (app: Candidate) => {
    try {
      const { id, status, submittedAt, ...candidateData } = app; 
      
      // Add to Contestants collection with 0 votes
      await addDoc(collection(db, "contestants"), { 
        ...candidateData, 
        votes: 0,
        approvedAt: new Date().toISOString() 
      });
      
      // Remove from pending applications
      await deleteDoc(doc(db, "applications", app.id));
      
      Alert.alert("Approved", `${app.name} has been added to the election list.`);
    } catch (e) {
      Alert.alert("Error", "Could not approve candidate.");
    }
  };

  const handleReject = async (id: string) => {
    Alert.alert("Reject Application", "This will permanently delete the application. Continue?", [
      { text: "Cancel", style: "cancel" },
      { 
        text: "Reject & Delete", 
        style: "destructive", 
        onPress: async () => await deleteDoc(doc(db, "applications", id)) 
      }
    ]);
  };

  const handleDeleteCandidate = async (id: string) => {
    Alert.alert("Delete Candidate", "This will remove them from the live ballot.", [
      { text: "Cancel" },
      { text: "Delete", style: "destructive", onPress: async () => await deleteDoc(doc(db, "contestants", id)) }
    ]);
  };

  const toggleResults = async () => {
    await setDoc(doc(db, "settings", "election"), { resultsPublished: !resultsPublished }, { merge: true });
  };

  const openDocument = (url?: string) => {
    if (url) {
      Linking.openURL(url).catch(() => Alert.alert("Error", "Could not open the document URL."));
    } else {
      Alert.alert("Missing File", "No document URL found for this applicant.");
    }
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
            Ballot ({contestants.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === "applications" && styles.activeTab]} 
          onPress={() => setActiveTab("applications")}
        >
          <Text style={[styles.tabText, activeTab === "applications" && styles.activeTabText]}>
            Pending ({applications.length})
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        {/* VIEW 1: PENDING APPLICATIONS */}
        {activeTab === "applications" && (
          <View>
            {applications.length === 0 ? (
               <Text style={styles.emptyText}>No pending applications to review.</Text>
            ) : (
              applications.map((app) => (
                <View key={app.id} style={styles.card}>
                  <View style={styles.cardHeader}>
                    {app.photoUrl ? (
                      <Image source={{ uri: app.photoUrl }} style={styles.avatar} />
                    ) : (
                      <View style={[styles.avatar, { justifyContent: 'center', alignItems: 'center' }]}>
                        <Text style={{fontSize: 20}}>👤</Text>
                      </View>
                    )}
                    <View style={{flex: 1, marginLeft: 12}}>
                      <Text style={styles.name}>{app.name}</Text>
                      <Text style={styles.position}>{app.position}</Text>
                      <Text style={styles.detail}>ID: {app.admissionNumber}</Text>
                    </View>
                  </View>

                  {/* 2. Document View Link */}
                  <TouchableOpacity 
                    style={styles.docButton} 
                    onPress={() => openDocument(app.documentUrl)}
                  >
                    <Text style={styles.docButtonText}>📄 View Eligibility Document</Text>
                  </TouchableOpacity>

                  {app.briefInfo && (
                    <View style={styles.manifestoBox}>
                      <Text style={styles.manifestoTitle}>Manifesto Snippet:</Text>
                      <Text style={styles.manifestoText} numberOfLines={3}>{app.briefInfo}</Text>
                    </View>
                  )}

                  <View style={styles.btnRow}>
                    <TouchableOpacity onPress={() => handleReject(app.id)} style={[styles.btn, styles.rejectBtn]}>
                      <Text style={styles.btnText}>Reject</Text>
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

        {/* VIEW 2: ACTIVE BALLOT */}
        {activeTab === "candidates" && (
          <View>
            {contestants.map((c) => (
              <View key={c.id} style={styles.row}>
                <View style={{flexDirection: 'row', alignItems: 'center'}}>
                  {c.photoUrl && <Image source={{ uri: c.photoUrl }} style={styles.smallAvatar} />}
                  <View style={{marginLeft: 10}}>
                    <Text style={styles.rowName}>{c.name}</Text>
                    <Text style={styles.rowPos}>{c.position}</Text>
                  </View>
                </View>
                <TouchableOpacity onPress={() => handleDeleteCandidate(c.id)}>
                  <Text style={styles.deleteText}>Remove</Text>
                </TouchableOpacity>
              </View>
            ))}
            <View style={{ height: 100 }} />
          </View>
        )}
      </ScrollView>

      {/* PUBLISH BUTTON */}
      <TouchableOpacity 
        style={[styles.publishBtn, { backgroundColor: resultsPublished ? "#d9534f" : "#1E6BB8" }]}
        onPress={toggleResults}
      >
        <Text style={styles.publishText}>
          {resultsPublished ? "🚫 Unpublish Election Results" : "📢 Publish Election Results"}
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
  tabText: { color: '#666', fontWeight: 'bold' },
  activeTabText: { color: '#1E6BB8' },
  
  scrollContent: { padding: 15 },
  emptyText: { textAlign: 'center', marginTop: 40, color: '#999', fontSize: 16 },

  card: { backgroundColor: 'white', padding: 15, borderRadius: 12, marginBottom: 15, elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  avatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#EDF2F7' },
  smallAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#EDF2F7' },
  name: { fontSize: 18, fontWeight: 'bold', color: '#2D3748' },
  position: { color: '#1E6BB8', fontWeight: '700', fontSize: 14 },
  detail: { color: '#718096', fontSize: 12, marginTop: 2 },
  
  // 3. Document Link Styles
  docButton: { 
    backgroundColor: '#F0F7FF', 
    padding: 12, 
    borderRadius: 8, 
    borderWidth: 1, 
    borderColor: '#1E6BB8', 
    borderStyle: 'dashed',
    alignItems: 'center',
    marginBottom: 15
  },
  docButtonText: { color: '#1E6BB8', fontWeight: 'bold' },

  manifestoBox: { backgroundColor: '#F7FAFC', padding: 10, borderRadius: 6, marginBottom: 15 },
  manifestoTitle: { fontSize: 12, fontWeight: 'bold', color: '#4A5568', marginBottom: 4 },
  manifestoText: { fontSize: 13, color: '#718096', fontStyle: 'italic' },

  btnRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  btn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8 },
  approveBtn: { backgroundColor: '#28a745' },
  rejectBtn: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#dc3545' },
  btnText: { color: 'white', fontWeight: 'bold' },
  rejectBtnText: { color: '#dc3545' }, // Not used currently but good for design

  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'white', padding: 15, borderRadius: 10, marginBottom: 10, elevation: 1 },
  rowName: { fontSize: 16, fontWeight: 'bold' },
  rowPos: { fontSize: 13, color: '#1E6BB8' },
  deleteText: { color: '#d9534f', fontWeight: 'bold' },

  publishBtn: { position: "absolute", bottom: 30, left: 20, right: 20, padding: 18, borderRadius: 15, alignItems: "center", elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 4 },
  publishText: { color: "white", fontSize: 16, fontWeight: "bold" }
});