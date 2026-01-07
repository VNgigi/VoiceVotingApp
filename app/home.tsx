import { useRouter } from "expo-router";
import * as Speech from "expo-speech";
import { getAuth, signOut } from "firebase/auth";
import { useEffect, useState } from "react";
import {
  Alert,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";

export default function Home() {
  const auth = getAuth();
  const user = auth.currentUser;
  const [displayName, setDisplayName] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (user) {
      // Use the name, or fall back to the part of the email before the '@'
      const name = user.displayName || user.email?.split("@")[0] || "Voter";
      setDisplayName(name);
      speakGuide(name);
    }
    
    return () => {
      Speech.stop();
    };
  }, [user]);

  const speakGuide = (name: string) => {
    Speech.stop();

    const welcomeMsg = `Welcome, ${name}.`;
    const instructions = "You are on the home screen. There is a logout button at the top right.";
    const option1 = "Option one: Start Voting. Tap the blue button.";
    const option2 = "Option two: View Contestants. Tap the green button.";
    const option3 = "Option three: View Results. Tap the orange button.";
    const option4 = "Option four: Apply to be a candidate. Tap the purple button at the bottom."; 
    
    Speech.speak(welcomeMsg);
    Speech.speak(instructions);
    Speech.speak(option1);
    Speech.speak(option2);
    Speech.speak(option3);
    Speech.speak(option4);
  };

  const handleNavigation = (path: string) => {
    Speech.stop(); 
    // @ts-ignore
    router.push(path);
  };

  const handleLogout = async () => {
    try {
      Speech.stop();
      await signOut(auth);
      // Redirect to login page (assuming it's at the root '/')
      router.replace("/");
    } catch (error: any) {
      Alert.alert("Logout Error", error.message);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Configure StatusBar for better visibility */}
      <StatusBar barStyle="dark-content" backgroundColor="#f8f9fa" />

      {/* --- NEW: Profile Header Section --- */}
      <View style={styles.header}>
        <View>
          <Text style={styles.profileLabel}>Signed in as:</Text>
          <Text style={styles.profileName}>{displayName || "Voter"}</Text>
        </View>
        
        <TouchableOpacity 
          style={styles.logoutButton} 
          onPress={handleLogout}
          accessibilityLabel="Logout"
        >
          <Text style={styles.logoutText}>🚪 Logout</Text>
        </TouchableOpacity>
      </View>

      {/* Main Menu Content */}
      <View style={styles.content}>
        <Text style={styles.title}>Main Menu</Text>
        <Text style={styles.instructions}>Please choose an option below:</Text>

        {/* Option 1: Vote */}
        <TouchableOpacity 
          style={styles.button} 
          onPress={() => handleNavigation("../vote/voting_page")}
          accessibilityLabel="Start Voting"
        >
          <Text style={styles.buttonText}>🗳️ Start Voting</Text>
        </TouchableOpacity>

        {/* Option 2: Contestants */}
        <TouchableOpacity
          style={[styles.button, styles.secondaryButton]}
          onPress={() => handleNavigation("../vote/contestants")}
          accessibilityLabel="View Contestants"
        >
          <Text style={styles.buttonText}>👥 View Contestants</Text>
        </TouchableOpacity>

        {/* Option 3: Results */}
        <TouchableOpacity
          style={[styles.button, styles.resultsButton]}
          onPress={() => handleNavigation("../results")}
          accessibilityLabel="View Results"
        >
          <Text style={styles.buttonText}>📊 View Results</Text>
        </TouchableOpacity>

        {/* Option 4: Apply */}
        <TouchableOpacity
          style={[styles.button, styles.applyButton]}
          onPress={() => handleNavigation("../vote/apply")}
          accessibilityLabel="Apply to be a candidate"
        >
          <Text style={styles.buttonText}>📝 Apply to Run as a Candidate</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.replayButton} 
          onPress={() => speakGuide(displayName || "Voter")}
        >
          <Text style={styles.replayText}>🔊 Replay Instructions</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8f9fa",
  },
  // --- Header Styles ---
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 40, // Padding for status bar area
    paddingBottom: 20,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    elevation: 3, // Shadow for Android
    shadowColor: "#000", // Shadow for iOS
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  profileLabel: {
    fontSize: 12,
    color: "#666",
  },
  profileName: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
  },
  logoutButton: {
    backgroundColor: "#FFEBEE", // Light red background
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#FFCDD2",
  },
  logoutText: {
    color: "#D32F2F", // Red text
    fontWeight: "600",
    fontSize: 14,
  },

  // --- Main Content Styles ---
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 8,
    color: "#1A1A1A",
  },
  instructions: {
    fontSize: 16,
    textAlign: "center",
    color: "#666",
    marginBottom: 24,
  },
  button: {
    backgroundColor: "#007AFF", // Blue
    padding: 18,
    borderRadius: 12,
    marginVertical: 8,
    width: "100%", 
    alignItems: "center",
    elevation: 2, 
    // Shadow for iOS
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  secondaryButton: {
    backgroundColor: "#34C759", // Green
  },
  resultsButton: {
    backgroundColor: "#FF9500", // Orange
  },
  applyButton: {
    backgroundColor: "#9b59b6", // Purple
  },
  buttonText: {
    color: "white",
    fontWeight: "700",
    fontSize: 18,
  },
  replayButton: {
    marginTop: 30,
    padding: 10,
  },
  replayText: {
    color: "#666",
    textDecorationLine: "underline",
    fontSize: 15,
  }
});