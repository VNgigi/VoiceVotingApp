import * as Speech from 'expo-speech';
import { collection, getDocs, query } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  SafeAreaView,
  SectionList,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { db } from "../../firebaseConfig";

interface Contestant {
  id: string;
  name: string;
  position: string;
  photoUri?: string;
  briefInfo?: string;
  course?: string;
  [key: string]: any; 
}

interface SectionData {
  title: string;
  data: Contestant[];
}

export default function Contestants() {
  const [sections, setSections] = useState<SectionData[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  // to track if the auto-read is currently active
  const [isReading, setIsReading] = useState(false);

  useEffect(() => {
    const fetchContestants = async () => {
      try {
        const q = query(collection(db, "contestants"));
        const querySnapshot = await getDocs(q);
        const contestantsList: Contestant[] = [];
        
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          contestantsList.push({ 
            id: doc.id, 
            name: data.name || "Unknown",
            position: data.position || "Other",
            photoUri: data.photoUri,
            briefInfo: data.briefInfo,
            course: data.course,
            ...data 
          });
        });

        const groupedData = groupContestantsByPosition(contestantsList);
        setSections(groupedData);
        
    
        startAutoRead(groupedData);

      } catch (error) {
        console.error("Error fetching contestants: ", error);
      } finally {
        setLoading(false);
      }
    };

    fetchContestants();

    // Stop speaking if the user leaves this screen
    return () => {
      Speech.stop();
    };
  }, []);

  const groupContestantsByPosition = (data: Contestant[]): SectionData[] => {
    const positionOrder = [
      "President", "Vice President", "Secretary General", 
      "Treasurer", "Gender and Disability Representative", 
      "Sports, Entertainment and Security Secretary"
    ];

    const groups = data.reduce((acc: Record<string, Contestant[]>, item: Contestant) => {
      const pos = item.position || "Other"; 
      if (!acc[pos]) acc[pos] = [];
      acc[pos].push(item);
      return acc;
    }, {});

    const result: SectionData[] = positionOrder
      .filter(pos => groups[pos])
      .map(pos => ({ title: pos, data: groups[pos] }));

    Object.keys(groups).forEach(key => {
        if (positionOrder.indexOf(key) === -1) {
            result.push({ title: key, data: groups[key] });
        }
    });

    return result;
  };

  //AUTO-READ LOGIC
  const startAutoRead = (dataToRead: SectionData[]) => {
    // Stop any current speech
    Speech.stop();
    setIsReading(true);



    Speech.speak("Here are the 2025 Contestants.", { rate: 0.9 });

    dataToRead.forEach((section) => {
      // Read the Position Title
      Speech.speak(`For the position of ${section.title}`, { 
        rate: 0.9 
      });

      // Read each candidate in this section
      section.data.forEach((candidate) => {
        const text = `${candidate.name}. ${candidate.briefInfo ? candidate.briefInfo : ""}`;
        Speech.speak(text, { 
          pitch: 1.0, 
          rate: 0.9,
        });
      });
      
      Speech.speak(" moving to the next position ", { rate: 1 }); 
    });
  };

  const stopReading = () => {
    Speech.stop();
    setIsReading(false);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading Candidates...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F5F7FA" />
      
      <View style={styles.header}>
        <View>
            <Text style={styles.headerTitle}>2025 Contestants</Text>
            <Text style={styles.headerSubtitle}>Meet your future leaders</Text>
        </View>

        {/* Toggle Button to Stop/Restart Audio */}
        <TouchableOpacity 
            style={[styles.audioButton, isReading ? styles.audioButtonStop : styles.audioButtonPlay]} 
            onPress={isReading ? stopReading : () => startAutoRead(sections)}
        >
            <Text style={styles.audioButtonText}>
                {isReading ? "Stop Audio" : "Read All"}
            </Text>
        </TouchableOpacity>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section: { title } }) => (
          <View style={styles.sectionHeader}>
            <View style={styles.sectionLine} />
            <Text style={styles.sectionTitle}>{title}</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Image 
              source={{ 
                uri: item.photoUri && !item.photoUri.startsWith('blob') 
                  ? item.photoUri 
                  : `https://ui-avatars.com/api/?name=${item.name}&background=random&size=128` 
              }} 
              style={styles.avatar} 
            />
            <View style={styles.infoContainer}>
              <Text style={styles.name}>{item.name}</Text>
              {item.briefInfo ? (
                <Text style={styles.briefInfo} numberOfLines={2}>
                  {item.briefInfo}
                </Text>
              ) : null}
              {item.course ? <Text style={styles.details}>{item.course}</Text> : null}
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F7FA" },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 10, color: "#666" },
  header: { 
    paddingVertical: 20, 
    paddingHorizontal: 16, 
    backgroundColor: "#fff", 
    borderBottomWidth: 1, 
    borderBottomColor: "#E1E4E8", 
    flexDirection: "row", 
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerTitle: { fontSize: 24, fontWeight: "800", color: "#1A202C" },
  headerSubtitle: { fontSize: 14, color: "#718096", marginTop: 4 },
  
  
  audioButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  audioButtonStop: {
    backgroundColor: "#FED7D7",
  },
  audioButtonPlay: {
    backgroundColor: "#C6F6D5",
  },
  audioButtonText: {
    fontWeight: "700",
    fontSize: 12,
    color: "#2D3748"
  },

  listContent: { padding: 16, paddingBottom: 40 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginTop: 24, marginBottom: 12 },
  sectionLine: { width: 4, height: 20, backgroundColor: "#3182CE", marginRight: 8, borderRadius: 2 },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: "#4A5568", textTransform: "uppercase", letterSpacing: 0.5 },
  card: { flexDirection: "row", backgroundColor: "#fff", borderRadius: 16, padding: 12, marginBottom: 12, alignItems: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 3 },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: "#EDF2F7" },
  infoContainer: { flex: 1, marginLeft: 16, justifyContent: "center" },
  name: { fontSize: 18, fontWeight: "700", color: "#2D3748", marginBottom: 2 },
  briefInfo: { fontSize: 14, fontWeight: "600", color: "#3182CE", marginBottom: 2 },
  details: { fontSize: 13, color: "#A0AEC0" },
});