import Voice from "@react-native-voice/voice";
import { router } from "expo-router";
import * as Speech from "expo-speech";
import { doc, increment, setDoc } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { db } from "../firebaseConfig";

// 🔹 All positions and candidates here
const ELECTION_POSITIONS = [
  {
    position: "President",
    candidates: ["Jane Wangechi", "Mary Kioko", "James Kiptoo", "Peter Mwangi", "Kamau Jonathan", "Alice Johnson"],
  },
  {
    position: "Vice President",
    candidates: ["Mike Jones", "Mary Kioko", "James Kiptoo"],
  },
  {
    position: "Secretary General",
    candidates: ["Peter", "Naomi", "Kibet"],
  },
   {
    position: "Treasurer",
    candidates: ["Peter", "Naomi", "Kibet"],
  },
   {
    position: "Gender and disability representative",
    candidates: ["Peter", "Naomi", "Kibet"],
  },
   {
    position: "Sports, entertainment and security secretary",
    candidates: ["Peter", "Naomi", "Kibet"],
  },
];

export default function VotingScreen() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [listening, setListening] = useState(false);
  const [recognizedVote, setRecognizedVote] = useState<string>("");
  const [selectedCandidate, setSelectedCandidate] = useState<string>("");

  const { position, candidates } = ELECTION_POSITIONS[currentIndex];

  // --- Start voice and intro ---
  useEffect(() => {
    Speech.speak(`You are voting for ${position}. Say or tap a candidate name.`);

    Voice.onSpeechResults = (e: any) => {
      const text = e.value?.[0] || "";
      setRecognizedVote(text);
      checkVote(text);
    };

    return () => {
      Voice.destroy().then(Voice.removeAllListeners);
    };
  }, [currentIndex]);

  const startListening = async () => {
    try {
      setListening(true);
      setRecognizedVote("");
      await Voice.start("en-US");
    } catch (e) {
      console.error("Voice start error:", e);
      setListening(false);
    }
  };

  const checkVote = (text: string) => {
    const match = candidates.find(
      (c) => c.toLowerCase() === text.toLowerCase()
    );

    if (match) {
      setSelectedCandidate(match);
      Speech.speak(`You voted for ${match}. Say or tap confirm to continue.`);
    } else {
      Speech.speak("Candidate not recognized. Please try again.");
    }
  };

  const submitVote = async (candidate: string) => {
    try {
      const voteRef = doc(db, "votes", position);
      await setDoc(voteRef, { [candidate]: increment(1) }, { merge: true });

      Speech.speak(`Your vote for ${candidate} has been recorded.`);

      Alert.alert("Vote Recorded", `You voted for ${candidate}`, [
        {
          text: "OK",
          onPress: () => {
            // ✅ Move to next position
            if (currentIndex < ELECTION_POSITIONS.length - 1) {
              Speech.speak(`Proceeding to the next position.`);
              setSelectedCandidate("");
              setRecognizedVote("");
              setTimeout(() => {
                setCurrentIndex((prev) => prev + 1);
              }, 1000);
            } else {
              // ✅ All done
              Speech.speak("You have completed voting. Thank you.");
              Alert.alert(
                "Voting Complete",
                "Thank you for your participation!"
              );
              setTimeout(() => {
                router.push("/results");
              }, 1500);
            }
          },
        },
      ]);
    } catch (error) {
      console.error("Error recording vote:", error);
      Alert.alert("Error", "Could not record vote.");
    }
  };

  const cancelVote = () => {
    Speech.speak("Vote cancelled. Please choose again.");
    setSelectedCandidate("");
    setRecognizedVote("");
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>{position}</Text>

      {candidates.map((c, i) => (
        <TouchableOpacity
          key={i}
          style={[
            styles.candidateButton,
            selectedCandidate === c && { backgroundColor: "#2ECC40" },
          ]}
          onPress={() => checkVote(c)}
        >
          <Text style={styles.candidateText}>{c}</Text>
        </TouchableOpacity>
      ))}

      <TouchableOpacity style={styles.voiceButton} onPress={startListening}>
        <Text style={styles.buttonText}>
          {listening ? "Listening..." : "🎤 Vote by Voice"}
        </Text>
      </TouchableOpacity>

      {recognizedVote ? (
        <Text style={styles.recognized}>Heard: {recognizedVote}</Text>
      ) : null}

      {selectedCandidate ? (
        <View style={styles.confirmContainer}>
          <Text style={styles.confirmText}>
            Confirm vote for {selectedCandidate}?
          </Text>

          <View style={styles.confirmButtons}>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: "#2ECC40" }]}
              onPress={() => submitVote(selectedCandidate)}
            >
              <Text style={styles.actionText}>✅ Confirm</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: "#FF4136" }]}
              onPress={cancelVote}
            >
              <Text style={styles.actionText}>❌ Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </View>
  );
}

// --- Styling ---
const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    justifyContent: "center",
    backgroundColor: "#001F3F",
  },
  heading: {
    fontSize: 26,
    fontWeight: "bold",
    textAlign: "center",
    color: "#fff",
    marginBottom: 20,
  },
  candidateButton: {
    backgroundColor: "#0074D9",
    padding: 15,
    borderRadius: 10,
    marginVertical: 8,
  },
  candidateText: {
    color: "#fff",
    fontSize: 18,
    textAlign: "center",
  },
  voiceButton: {
    backgroundColor: "#FF851B",
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 20,
  },
  buttonText: { color: "#fff", fontSize: 18 },
  recognized: {
    marginTop: 10,
    textAlign: "center",
    fontSize: 16,
    color: "#aaa",
  },
  confirmContainer: {
    marginTop: 25,
    backgroundColor: "#012A4A",
    borderRadius: 10,
    padding: 20,
  },
  confirmText: {
    color: "#fff",
    fontSize: 18,
    textAlign: "center",
    marginBottom: 15,
  },
  confirmButtons: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  actionButton: {
    flex: 1,
    marginHorizontal: 10,
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  actionText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
