import React from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";

interface CandidateCardProps {
  name: string;
  onSelect: () => void;
  image?: string; // optional image URL
  isSelected?: boolean;
}

const CandidateCard: React.FC<CandidateCardProps> = ({
  name,
  onSelect,
  image,
  isSelected,
}) => {
  return (
    <TouchableOpacity
      onPress={onSelect}
      style={[
        styles.card,
        isSelected ? styles.selectedCard : undefined,
      ]}
    >
      {image ? (
        <Image source={{ uri: image }} style={styles.image} />
      ) : (
        <View style={styles.placeholderImage}>
          <Text style={styles.initial}>{name[0]}</Text>
        </View>
      )}
      <Text style={styles.name}>{name}</Text>
    </TouchableOpacity>
  );
};

export default CandidateCard;

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#f2f2f2",
    borderRadius: 12,
    padding: 15,
    marginVertical: 8,
    alignItems: "center",
    elevation: 2,
  },
  selectedCard: {
    backgroundColor: "#0057D9",
  },
  image: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginBottom: 10,
  },
  placeholderImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#ccc",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },
  initial: {
    fontSize: 30,
    color: "white",
    fontWeight: "bold",
  },
  name: {
    fontSize: 18,
    fontWeight: "500",
    color: "black",
  },
});
