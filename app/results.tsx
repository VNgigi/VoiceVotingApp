import * as Speech from "expo-speech";
import { collection, getDocs } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View
} from "react-native";
import { db } from "../firebaseConfig";

interface CandidateResult {
  name: string;
  votes: number;
}

interface PositionResult {
  position: string;
  candidates: CandidateResult[];
}

export default function Results() {
  const [results, setResults] = useState<PositionResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Run only once on mount
  useEffect(() => {
    fetchResults();
    
    // Cleanup: Stop talking if user leaves the screen
    return () => {
      Speech.stop();
    };
  }, []);

  const fetchResults = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, "votes"));
      const fetchedData: PositionResult[] = [];

      querySnapshot.forEach((doc) => {
        const position = doc.id;
        const data = doc.data();

        // Convert Firestore object to array
        const candidatesArray: CandidateResult[] = Object.entries(data).map(
          ([name, voteCount]) => ({
            name,
            votes: Number(voteCount)
          })
        );

        // Sort: Highest votes first
        candidatesArray.sort((a, b) => b.votes - a.votes);

        fetchedData.push({
          position,
          candidates: candidatesArray,
        });
      });

      setResults(fetchedData);
      
      // --- AUTO-READ LOGIC ---
      // We pass the data directly to ensure it reads the latest version immediately
      readResultsAloud(fetchedData);

    } catch (error) {
      console.error("Error fetching results:", error);
      Speech.speak("I could not fetch the results. Please check your internet.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    // Stop speaking previous results if user refreshes
    Speech.stop(); 
    fetchResults();
  };

  const readResultsAloud = (data: PositionResult[]) => {
    Speech.stop(); // Clear queue

    if (data.length === 0) {
      Speech.speak("No votes have been cast yet.");
      return;
    }

    Speech.speak("Here are the current election results.");

    data.forEach((item) => {
      const winner = item.candidates[0]; // First one is winner due to sort
      
      // Pause slightly by speaking strictly
      if (winner) {
        Speech.speak(`For ${item.position}, the leader is ${winner.name}, with ${winner.votes} votes.`);
      } else {
        Speech.speak(`For ${item.position}, there are no votes.`);
      }
    });

    Speech.speak("End of results.");
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#1E6BB8" />
        <Text style={styles.loadingText}>Tallying Votes...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>🗳️ Live Election Results</Text>
      
      <FlatList
        data={results}
        keyExtractor={(item) => item.position}
        // This ensures the list pushes up content if it's long
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.positionTitle}>{item.position}</Text>
            
            {item.candidates.length > 0 ? (
              item.candidates.map((candidate, index) => (
                <View key={index} style={styles.row}>
                  <Text style={[
                    styles.candidateName, 
                    index === 0 && styles.winnerText // Highlight winner in green
                  ]}>
                    {index + 1}. {candidate.name} {index === 0 ? "🏆" : ""}
                  </Text>
                  <Text style={styles.voteCount}>{candidate.votes} votes</Text>
                </View>
              ))
            ) : (
              <Text style={styles.noVotes}>No votes cast yet.</Text>
            )}
          </View>
        )}
        ListFooterComponent={
          <Text style={styles.footer}>Pull down to refresh results</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, // Crucial for scrolling
    backgroundColor: "#F4F7FB",
    paddingTop: 50,
    paddingHorizontal: 20,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F4F7FB",
  },
  header: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#1A4A7A",
    textAlign: "center",
    marginBottom: 20,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: "#666",
  },
  card: {
    backgroundColor: "white",
    padding: 20,
    borderRadius: 15,
    marginBottom: 15,
    elevation: 3, 
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  positionTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#1E6BB8",
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    paddingBottom: 5,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  candidateName: {
    fontSize: 16,
    color: "#333",
    fontWeight: "500",
  },
  winnerText: {
    fontWeight: "bold",
    color: "#2E8B57", // SeaGreen for winner
  },
  voteCount: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#1A4A7A",
  },
  noVotes: {
    fontStyle: "italic",
    color: "#999",
    marginTop: 5,
  },
  footer: {
    textAlign: "center",
    color: "#888",
    marginVertical: 20,
    paddingBottom: 20,
  },
});