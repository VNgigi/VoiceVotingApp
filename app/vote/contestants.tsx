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
  View
} from "react-native";
// Ensure this path is correct for your project structure
import { db } from "../../firebaseConfig";

// 1. Define what a "Contestant" looks like
interface Contestant {
  id: string;
  name: string;
  position: string;
  photoUri?: string;
  briefInfo?: string;
  course?: string;
  // We allow other fields just in case, but the above are the main ones
  [key: string]: any; 
}

// 2. Define what a "Section" looks like for the SectionList
interface SectionData {
  title: string;
  data: Contestant[];
}

export default function Contestants() {
  // 3. Tell useState exactly what kind of data it will hold
  const [sections, setSections] = useState<SectionData[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const fetchContestants = async () => {
      try {
        const q = query(collection(db, "contestants"));
        const querySnapshot = await getDocs(q);
        
        // 4. Initialize the array with the correct type
        const contestantsList: Contestant[] = [];
        
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          // We safely cast the data to our Contestant type
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
      } catch (error) {
        console.error("Error fetching contestants: ", error);
      } finally {
        setLoading(false);
      }
    };

    fetchContestants();
  }, []);

  // 5. Add types to the function parameters
  const groupContestantsByPosition = (data: Contestant[]): SectionData[] => {
    const positionOrder = [
      "President",
      "Vice President",
      "Secretary General",
      "Treasurer",
      "Gender and Disability Representative",
      "Sports, Entertainment and Security Secretary"
    ];

    // Initialize accumulator with a type
    const groups = data.reduce((acc: Record<string, Contestant[]>, item: Contestant) => {
      const pos = item.position || "Other"; 
      if (!acc[pos]) {
        acc[pos] = [];
      }
      acc[pos].push(item);
      return acc;
    }, {});

    const result: SectionData[] = positionOrder
      .filter(pos => groups[pos])
      .map(pos => ({
        title: pos,
        data: groups[pos]
      }));

    Object.keys(groups).forEach(key => {
        // Use simpler string matching instead of .includes to avoid TS issues with loose strings
        if (positionOrder.indexOf(key) === -1) {
            result.push({ title: key, data: groups[key] });
        }
    });

    return result;
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
        <Text style={styles.headerTitle}>2025 Contestants</Text>
        <Text style={styles.headerSubtitle}>Meet your future leaders</Text>
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
                <Text style={styles.briefInfo} numberOfLines={1}>
                  {item.briefInfo}
                </Text>
              ) : null}

              {item.course ? (
                <Text style={styles.details}>{item.course}</Text>
              ) : null}
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F7FA",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 10,
    color: "#666",
  },
  header: {
    paddingVertical: 20,
    paddingHorizontal: 16,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E1E4E8",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#1A202C",
  },
  headerSubtitle: {
    fontSize: 14,
    color: "#718096",
    marginTop: 4,
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 12,
  },
  sectionLine: {
    width: 4,
    height: 20,
    backgroundColor: "#3182CE",
    marginRight: 8,
    borderRadius: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#4A5568",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  card: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#EDF2F7",
  },
  infoContainer: {
    flex: 1,
    marginLeft: 16,
    justifyContent: "center",
  },
  name: {
    fontSize: 18,
    fontWeight: "700",
    color: "#2D3748",
    marginBottom: 2,
  },
  briefInfo: {
    fontSize: 14,
    fontWeight: "600",
    color: "#3182CE",
    marginBottom: 2,
  },
  details: {
    fontSize: 13,
    color: "#A0AEC0",
  },
});