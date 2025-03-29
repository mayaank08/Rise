"use client";
import axios from "axios";
import { useParams } from "next/navigation";
import React, { useEffect, useState } from "react";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import FlashcardItem from "./_components/FlashcardItem";
import { Button } from "@/components/ui/button";

function Flashcards() {
  const { courseId } = useParams();
  const [flashCards, setFlashCards] = useState([]);
  const [isFlipped, setIsFlipped] = useState(false);
  const [api, setApi] = useState(null);

  useEffect(() => {
    GetFlashCards();
  }, []);

  // Listen for carousel "select" event to know when the user navigates to a new flashcard
  useEffect(() => {
    if (!api) return;
    api.on("select", (index) => {
      setIsFlipped(false); // Reset flip state on new card
    });
  }, [api]);

  const GetFlashCards = async () => {
    try {
      const result = await axios.post("/api/study-type", {
        courseId: courseId,
        studyType: "Flashcard",
      });
      console.log(result?.data);
      setFlashCards(result?.data?.content || []);
    } catch (error) {
      console.error("Error fetching flashcards:", error);
    }
  };

  const handleClick = () => {
    setIsFlipped((prev) => !prev);
  };

  return (
    <div>
      <h2 className="font-bold text-2xl">Flashcards</h2>
      <p>Flashcards: The Ultimate Tool to Lock in Concepts</p>
      <div className="mt-10">
        <Carousel setApi={setApi}>
          <CarouselContent>
            {flashCards.map((flashcard, index) => (
              <CarouselItem
                key={index}
                className="flex items-center justify-center"
              >
                <FlashcardItem
                  handleClick={handleClick}
                  isFlipped={isFlipped}
                  flashcard={flashcard}
                />
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious />
          <CarouselNext />
        </Carousel>
      </div>
      <div className="flex justify-center mt-4">
        <Button
          className="flex items-center gap-2"
          onClick={() => window.history.back()}
        >
          Go to Course Page
        </Button>
      </div>
    </div>
  );
}
//working on how to make the flaashcard directly back to the previous course page
export default Flashcards;