import { useRouter } from "expo-router";
import * as Speech from "expo-speech";
import { getAuth } from "firebase/auth";
import { useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

export default function Home() {
  const auth = getAuth();
  const user = auth.currentUser;
  const [displayName, setDisplayName] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (user) {
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
    const instructions = "You are on the home screen. You have four options.";
    const option1 = "Option one: Start Voting. Tap the blue button.";
    const option2 = "Option two: View Contestants. Tap the green button.";
    const option3 = "Option three: View Results. Tap the orange button.";
    // New Voice Instruction
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

  return (
    <View style={styles.container}>
      <Text style={styles.welcome}>Welcome, {displayName || "Voter"}!</Text>
      <Text style={styles.instructions}>
        Please choose an option below:
      </Text>

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

      {/* Option 4: Apply (NEW) */}
      <TouchableOpacity
        style={[styles.button, styles.applyButton]}
        onPress={() => handleNavigation("../vote/apply")}
        accessibilityLabel="Apply to be a candidate"
      >
        <Text style={styles.buttonText}>📝 Apply to Run</Text>
      </TouchableOpacity>
      
      <TouchableOpacity 
        style={styles.replayButton} 
        onPress={() => speakGuide(displayName || "Voter")}
      >
        <Text style={styles.replayText}>🔊 Replay Instructions</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: "#f8f9fa",
  },
  welcome: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 12,
    color: "#333",
    textAlign: "center",
  },
  instructions: {
    fontSize: 16,
    textAlign: "center",
    color: "#444",
    marginBottom: 20,
  },
  button: {
    backgroundColor: "#007AFF", // Blue
    padding: 16,
    borderRadius: 10,
    marginVertical: 8,
    width: "90%", // Made slightly wider for better tap targets
    alignItems: "center",
    elevation: 2, 
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
    fontWeight: "600",
    fontSize: 16,
  },
  replayButton: {
    marginTop: 20,
    padding: 10,
  },
  replayText: {
    color: "#666",
    textDecorationLine: "underline",
  }
});