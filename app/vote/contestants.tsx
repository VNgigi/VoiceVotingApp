import { Ionicons } from "@expo/vector-icons";
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

// --- THEME ---
const PRIMARY_COLOR = "#4F46E5"; // Indigo 600
const BG_COLOR = "#F9FAFB"; // Slate 50
const TEXT_COLOR = "#1F2937"; // Gray 800
const CARD_BG = "#FFFFFF";

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
        setStatusText("Listening...");
    } catch (e) {
        console.error("Mic Error", e);
    }
  };

  useSpeechRecognitionEvent("result", (event) => {
    const text = event.results[0]?.transcript;
    if (text) {
        if(listening) setStatusText(`"${text}"`);
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
    if (cmd.includes("read all") || cmd.includes("read everything") || cmd.includes("all") || cmd.includes("all candidates")) {
        readAllContestants(sections);
        return;
    }

    // C. Specific Position Matching
    const matches = sections.filter(s => {
        const title = s.title.toLowerCase();
        if (cmd.includes(title)) return true;
        const words = title.split(" ");
        return words.some(word => word.length > 3 && cmd.includes(word));
    });

    if (matches.length > 0) {
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
        <ActivityIndicator size="large" color={PRIMARY_COLOR} />
        <Text style={styles.loadingText}>Loading Candidates...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={BG_COLOR} />
      
      {/* --- HEADER --- */}
      <View style={styles.header}>
        <View>
            <Text style={styles.headerTitle}>2025 Contestants</Text>
            <Text style={styles.headerSubtitle}>Meet your future leaders</Text>
        </View>

        <TouchableOpacity 
            style={[styles.playButton, isReading && styles.stopButton]} 
            onPress={isReading ? stopEverything : () => readAllContestants(sections)}
        >
            <Ionicons name={isReading ? "stop" : "play"} size={16} color={isReading ? "#EF4444" : "#FFF"} />
            <Text style={[styles.playButtonText, isReading && { color: "#EF4444" }]}>
                {isReading ? "Stop" : "Read All"}
            </Text>
        </TouchableOpacity>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
        
        renderSectionHeader={({ section: { title } }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{title}</Text>
          </View>
        )}
        
        renderItem={({ item }) => (
          <View style={styles.card}>
             {/* Left: Avatar */}
             <Image 
               source={{ 
                 uri: item.photoUri && !item.photoUri.startsWith('blob') 
                   ? item.photoUri 
                   : `https://ui-avatars.com/api/?name=${item.name}&background=random&size=128` 
               }} 
               style={styles.avatar} 
             />
             
             {/* Right: Details */}
             <View style={styles.infoContainer}>
               <Text style={styles.name}>{item.name}</Text>
               
               {item.briefInfo && (
                  <View style={styles.badge}>
                     <Text style={styles.badgeText} numberOfLines={1}>{item.briefInfo}</Text>
                  </View>
               )}
               
               {item.course && (
                   <Text style={styles.details} numberOfLines={1}>{item.course}</Text>
               )}
             </View>

             <Ionicons name="chevron-forward" size={20} color="#E5E7EB" />
          </View>
        )}
      />

      {/* --- FLOATING CONTROLS --- */}
      {(listening || isReading) && (
        <View style={styles.floatingControls}>
           <View style={styles.statusPill}>
               <View style={[styles.statusDot, listening && styles.statusDotActive]} />
               <Text style={styles.statusText}>{statusText}</Text>
           </View>
           
           {listening && (
               <Animated.View style={[styles.micIndicator, { transform: [{ scale: pulseAnim }] }]}>
                  <Ionicons name="mic" size={20} color="#FFF" />
               </Animated.View>
           )}
        </View>
      )}

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG_COLOR },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: BG_COLOR },
  loadingText: { marginTop: 12, color: "#6B7280", fontWeight: "500" },
  
  // HEADER
  header: { 
    paddingVertical: 16, paddingHorizontal: 24, 
    backgroundColor: "#FFF", 
    borderBottomWidth: 1, borderBottomColor: "#F3F4F6", 
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
  },
  headerTitle: { fontSize: 22, fontWeight: "800", color: TEXT_COLOR, letterSpacing: -0.5 },
  headerSubtitle: { fontSize: 13, color: "#6B7280", marginTop: 2 },
  
  // BUTTONS
  playButton: { 
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: PRIMARY_COLOR, 
      paddingVertical: 8, paddingHorizontal: 16, 
      borderRadius: 20,
      shadowColor: PRIMARY_COLOR, shadowOpacity: 0.3, shadowRadius: 5, elevation: 3
  },
  stopButton: { backgroundColor: "#FEF2F2", shadowOpacity: 0 },
  playButtonText: { fontWeight: "700", fontSize: 12, color: "#FFF" },

  // LIST
  listContent: { padding: 24, paddingBottom: 100 },
  
  // SECTION
  sectionHeader: { marginTop: 24, marginBottom: 12 },
  sectionTitle: { fontSize: 13, fontWeight: "700", color: "#6B7280", textTransform: "uppercase", letterSpacing: 0.8 },
  
  // CARD
  card: { 
    flexDirection: "row", 
    backgroundColor: CARD_BG, 
    borderRadius: 20, 
    padding: 16, 
    marginBottom: 12, 
    alignItems: "center", 
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 8, 
    elevation: 2,
    borderWidth: 1, borderColor: "#F3F4F6"
  },
  avatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: "#E5E7EB", borderWidth: 1, borderColor: "#F9FAFB" },
  infoContainer: { flex: 1, marginLeft: 16, marginRight: 8, justifyContent: "center" },
  name: { fontSize: 16, fontWeight: "700", color: TEXT_COLOR, marginBottom: 4 },
  
  badge: { alignSelf: 'flex-start', backgroundColor: "#EEF2FF", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, marginBottom: 4 },
  badgeText: { fontSize: 12, fontWeight: "600", color: PRIMARY_COLOR },
  
  details: { fontSize: 12, color: "#9CA3AF" },

  // VOICE UI
  floatingControls: {
      position: 'absolute', bottom: 30, left: 24, right: 24,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'
  },
  statusPill: {
      flex: 1, flexDirection: 'row', alignItems: 'center',
      backgroundColor: "rgba(255,255,255,0.95)", 
      paddingHorizontal: 16, paddingVertical: 12,
      borderRadius: 30, marginRight: 16,
      shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 10, elevation: 5,
      borderWidth: 1, borderColor: "#E5E7EB"
  },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#D1D5DB", marginRight: 10 },
  statusDotActive: { backgroundColor: "#EF4444" },
  statusText: { fontSize: 13, color: "#4B5563", fontWeight: "600" },

  micIndicator: {
      width: 44, height: 44, borderRadius: 22, 
      backgroundColor: PRIMARY_COLOR,
      justifyContent: 'center', alignItems: 'center',
      shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 8, elevation: 6
  }
});