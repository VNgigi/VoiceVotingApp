import { useRouter } from "expo-router";
import * as Speech from 'expo-speech';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from "expo-speech-recognition";
import { collection, getDocs, query } from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
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
  const router = useRouter();
  
  // --- STATE ---
  const [sections, setSections] = useState<SectionData[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isReading, setIsReading] = useState(false);
  const [listening, setListening] = useState(false);
  const [statusText, setStatusText] = useState("Loading...");
  
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // --- 1. FETCH DATA ---
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
        
        // --- CHANGED: Don't read all immediately. Ask user what they want. ---
        startIntroSequence();

      } catch (error) {
        console.error("Error fetching contestants: ", error);
        setStatusText("Error loading data.");
      } finally {
        setLoading(false);
      }
    };

    fetchContestants();

    return () => {
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

  // --- 2. READING LOGIC ---

  const startIntroSequence = () => {
    stopEverything();
    Speech.speak("Contestants loaded. Say Read All, or name a position.", {
        onDone: () => { startListening(); }
    });
  };

  const readAllContestants = (dataToRead: SectionData[]) => {
    stopEverything(); 
    setIsReading(true);
    setStatusText("Reading All...");

    Speech.speak("Here are all the 2025 Contestants.", { rate: 0.9 });

    dataToRead.forEach((section) => {
      Speech.speak(`Position: ${section.title}`, { rate: 0.9 });
      section.data.forEach((candidate) => {
        const text = `${candidate.name}. ${candidate.briefInfo || ""}`;
        Speech.speak(text, { pitch: 1.0, rate: 0.9 });
      });
      Speech.speak(" Next position. ", { rate: 1.1 }); 
    });

    Speech.speak("End of list. Say Go Back.", {
        onDone: () => {
            setIsReading(false);
            startListening();
        }
    });
  };

  const readSpecificSection = (sectionTitle: string) => {
    const section = sections.find(s => s.title === sectionTitle);
    
    if (section) {
        stopEverything();
        setIsReading(true);
        setStatusText(`Reading ${section.title}...`);
        
        Speech.speak(`Contestants for ${section.title}.`);
        
        section.data.forEach((candidate) => {
            const text = `${candidate.name}. ${candidate.briefInfo || ""}`;
            Speech.speak(text, { rate: 0.9 });
        });

        Speech.speak("End of position. Say another position, or Go Back.", {
            onDone: () => {
                setIsReading(false);
                startListening();
            }
        });
    } else {
        Speech.speak("I couldn't find that position.", {
            onDone: () => { startListening(); }
        });
    }
  };

  const stopEverything = () => {
    Speech.stop();
    ExpoSpeechRecognitionModule.stop();
    setIsReading(false);
    setListening(false);
  };

  // --- 3. VOICE LISTENER ---
  const startListening = async () => {
    const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!result.granted) {
        Alert.alert("Permission needed", "Please enable microphone access.");
        return;
    }

    try {
        ExpoSpeechRecognitionModule.start({
            lang: "en-US",
            interimResults: true,
            maxAlternatives: 1,
        });
        setListening(true);
        setStatusText("Listening... (Say 'President' or 'Read All')");
    } catch (e) {
        console.error("Mic Error", e);
    }
  };

  useSpeechRecognitionEvent("result", (event) => {
    const text = event.results[0]?.transcript;
    if (text) {
        if(listening) setStatusText(`Heard: "${text}"`);
        if (event.isFinal) {
            handleVoiceCommand(text);
        }
    }
  });

  useSpeechRecognitionEvent("end", () => setListening(false));

  // --- 4. COMMAND LOGIC ---
  const handleVoiceCommand = (text: string) => {
    const cmd = text.toLowerCase();
    stopEverything();

    // A. Navigation
    if (cmd.includes("back") || cmd.includes("return") || cmd.includes("home")) {
        Speech.speak("Going back.", {
            onDone: () => { router.back(); }
        });
        return;
    } 
    
    // B. Read All
    if (cmd.includes("read all") || cmd.includes("read everything")) {
        readAllContestants(sections);
        return;
    }

    // C. Specific Position Matching
    const matches = sections.filter(s => {
        const title = s.title.toLowerCase();
        // Exact match check
        if (cmd.includes(title)) return true;
        
        // Keyword match check (e.g. "Security" matches "Security Secretary")
        const words = title.split(" ");
        return words.some(word => word.length > 3 && cmd.includes(word));
    });

    if (matches.length > 0) {
        // Sort by length (Longest match first to prefer specific titles)
        matches.sort((a, b) => b.title.length - a.title.length);
        readSpecificSection(matches[0].title);
    } else {
        Speech.speak("I didn't catch that. Say Read All, Go Back, or name a position.", {
            onDone: () => { startListening(); }
        });
    }
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

        {/* Toggle Button */}
        <TouchableOpacity 
            style={[styles.audioButton, isReading ? styles.audioButtonStop : styles.audioButtonPlay]} 
            onPress={isReading ? stopEverything : () => readAllContestants(sections)}
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

      {/* --- STATUS FOOTER --- */}
      {(listening || isReading) && (
          <View style={styles.statusFooter}>
             <Text style={styles.statusText}>{statusText}</Text>
             {listening && (
                 <Animated.View style={[styles.micIndicator, { transform: [{ scale: pulseAnim }] }]}>
                    <Text style={{fontSize: 20}}>🎤</Text>
                 </Animated.View>
             )}
          </View>
      )}

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F7FA" },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 10, color: "#666" },
  header: { 
    paddingVertical: 20, paddingHorizontal: 16, backgroundColor: "#fff", 
    borderBottomWidth: 1, borderBottomColor: "#E1E4E8", 
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
  },
  headerTitle: { fontSize: 24, fontWeight: "800", color: "#1A202C" },
  headerSubtitle: { fontSize: 14, color: "#718096", marginTop: 4 },
  
  audioButton: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20 },
  audioButtonStop: { backgroundColor: "#FED7D7" },
  audioButtonPlay: { backgroundColor: "#C6F6D5" },
  audioButtonText: { fontWeight: "700", fontSize: 12, color: "#2D3748" },

  listContent: { padding: 16, paddingBottom: 100 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginTop: 24, marginBottom: 12 },
  sectionLine: { width: 4, height: 20, backgroundColor: "#3182CE", marginRight: 8, borderRadius: 2 },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: "#4A5568", textTransform: "uppercase", letterSpacing: 0.5 },
  card: { flexDirection: "row", backgroundColor: "#fff", borderRadius: 16, padding: 12, marginBottom: 12, alignItems: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 3 },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: "#EDF2F7" },
  infoContainer: { flex: 1, marginLeft: 16, justifyContent: "center" },
  name: { fontSize: 18, fontWeight: "700", color: "#2D3748", marginBottom: 2 },
  briefInfo: { fontSize: 14, fontWeight: "600", color: "#3182CE", marginBottom: 2 },
  details: { fontSize: 13, color: "#A0AEC0" },

  // New Styles for Voice UI
  statusFooter: {
      position: 'absolute', bottom: 0, left: 0, right: 0,
      backgroundColor: '#fff', borderTopWidth: 1, borderColor: '#eee',
      padding: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      elevation: 10
  },
  statusText: { fontSize: 16, fontWeight: '600', color: '#555', marginRight: 10 },
  micIndicator: {
      width: 40, height: 40, borderRadius: 20, backgroundColor: '#E3F2FD',
      justifyContent: 'center', alignItems: 'center'
  }
});