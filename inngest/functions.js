import {
  generateNotesAiModel,
  GenerateQuizAiModel,
  GenerateFlashcardAiModel,
} from "@/configs/AiModel";
import { inngest } from "./client";
import { db } from "@/configs/db";
import {
  CHAPTER_NOTES_TABLE,
  STUDY_MATERIAL_TABLE,
  STUDY_TYPE_CONTENT_TABLE,
  USER_TABLE,
} from "@/configs/schema";
import { eq } from "drizzle-orm";

/* 
🚀 How This Works (Inngest Flow) 🚀

1️⃣ The frontend calls `CheckIsNewUser()`, sending a POST request to `/api/create-user`.
2️⃣ The `/api/create-user` API receives the request and triggers an **Inngest event** named `"user.create"`.
3️⃣ Inngest listens for this event and automatically calls the `CreateNewUser` function.
4️⃣ `CreateNewUser` checks if the user already exists in the database.
   - If the user **does not exist**, they are added to the database.
   - If the user **already exists**, nothing changes.
5️⃣ The process happens in the background, so the frontend is not blocked while the user is being checked.

✅ **Key Point:**  
The connection happens because the event name (`"user.create"`) in `inngest.send()` matches the event listener in `CreateNewUser`.  
*/

export const CreateNewUser = inngest.createFunction(
  { id: "create-user", retries: 1 },
  { event: "user.create" },
  async ({ event, step }) => {
    const { user } = event.data;

    // Add validation for user object
    if (!user) {
      throw new Error("User data is required");
    }

    const userEmail = user?.primaryEmailAddress?.emailAddress;
    const userName = user?.fullName;

    if (!userEmail) {
      throw new Error("User email is required");
    }

    const result = await step.run(
      "Checking if the user exists in the database...",
      async () => {
        // Check if user already exists
        const result = await db
          .select({
            id: USER_TABLE.id,
            name: USER_TABLE.name,
            email: USER_TABLE.email,
            is_member: USER_TABLE.is_member,
          })
          .from(USER_TABLE)
          .where(eq(USER_TABLE.email, userEmail));

        console.log(result);
        if (result?.length === 0) {
          // If not, add to DB
          const userResp = await db
            .insert(USER_TABLE)
            .values({
              name: userName || "Anonymous User",
              email: userEmail,
              is_member: false,
            })
            .returning();
          return userResp;
        }
        return result;
      }
    );
    return result?.length === 0
      ? "New user successfully created."
      : "User already exists in the database.";
  }
);

export const GenerateNotes = inngest.createFunction(
  { id: "generate-course", retries: 1 }, // Define function ID and retry attempts
  { event: "notes.generate" }, // Define the event that triggers this function
  async ({ event, step }) => {
    const { course } = event.data; // Extract course information from the event data

    // Step 1: Generate Notes for Each Chapter using AI
    const notesResult = await step.run("Generate Chapter Notes", async () => {
      const Chapters = course?.courseLayout?.chapters; // Get the chapters from the course layout
      let index = 0;

      // Loop through each chapter to generate notes using AI
      for (const chapter of Chapters) {
        // Construct the AI prompt dynamically based on the course and chapter content
        const PROMPT =
          "Generate " +
          course?.courseType +
          " material detail content for each chapter. " +
          "Make sure to give notes for each topic from the chapters, " +
          "include code examples if applicable inside <precode> tags, " +
          "highlight key points, and style each tag appropriately. " +
          "Provide the response in HTML format (Do not include <html>, <head>, <body>, or <title> tags). " +
          "The chapter content is: " +
          JSON.stringify(chapter);

        // Call the AI model to generate notes
        const result = await generateNotesAiModel.sendMessage(PROMPT);
        const aiResp = result.response.text(); // Extract AI-generated text response

        console.log(PROMPT); // Log the prompt for debugging

        // Store the generated notes in the database
        await db.insert(CHAPTER_NOTES_TABLE).values({
          chapterId: index, // Assign an index to the chapter
          courseId: course?.courseId, // Link notes to the corresponding course
          notes: aiResp, // Store the AI-generated notes
        });

        index = index + 1; // Increment index for the next chapter
      }
      return Chapters; // Return processed chapters
    });

    // Step 2: Update Course Status to 'Ready' after generating notes
    const updateCourseStatusResult = await step.run(
      "Update Course Status to Ready",
      async () => {
        const result = await db
          .update(STUDY_MATERIAL_TABLE)
          .set({ status: "Ready" }) // Mark the course as ready
          .where(eq(STUDY_MATERIAL_TABLE.courseId, course?.courseId)); // Match the course ID

        return "Success"; // Indicate successful status update
      }
    );
  }
);

// Generate Study Type Content
export const GenerateStudyTypeContent = inngest.createFunction(
  { id: "Generate Study Type Content", retries: 1 },
  { event: "studyType.content" }, // Event trigger

  async ({ event, step }) => {
    const { studyType, prompt, courseId, recordId } = event.data;
    let AiResult = null; // Initialize AI result

    // Generate Study Type Content safely
    try {
      if (studyType === "Flashcard") {
        AiResult = await step.run(
          "Generating Flashcards using AI",
          async () => {
            const result = await GenerateFlashcardAiModel.sendMessage(prompt);
            return JSON.parse(result.response.text());
          }
        );
      } else if (studyType === "Quiz") {
        AiResult = await step.run("Generating Quiz using AI", async () => {
          const result = await GenerateQuizAiModel.sendMessage(prompt);
          return JSON.parse(result.response.text());
        });
      } else if (studyType === "Notes/Chapters") {
        AiResult = await step.run("Generating Notes using AI", async () => {
          const result = await generateNotesAiModel.sendMessage(prompt);
          const text = result.response.text();
          // Remove markdown code block markers if present
          const cleanText = text.replace(/```json\n?|\n?```/g, "").trim();
          try {
            const parsed = JSON.parse(cleanText);
            if (!parsed || typeof parsed !== "object") {
              throw new Error("Invalid JSON structure");
            }
            return parsed;
          } catch (parseError) {
            console.error("Failed to parse AI response:", parseError);
            throw new Error("Failed to parse AI response into valid JSON");
          }
        });
      } else {
        throw new Error(`Unsupported studyType: ${studyType}`);
      }
    } catch (error) {
      console.error(`AI generation failed for ${studyType}`, error);
      await step.run("Update DB - Failed Generation", async () => {
        await db
          .update(STUDY_TYPE_CONTENT_TABLE)
          .set({
            content: null,
            status: "Failed",
            error: error.message,
          })
          .where(eq(STUDY_TYPE_CONTENT_TABLE.id, recordId));
      });
      return; // Terminate function after logging error
    }

    // Save the valid result
    await step.run("Save Result to DB", async () => {
      await db
        .update(STUDY_TYPE_CONTENT_TABLE)
        .set({
          content: AiResult,
          status: "Ready",
          error: null,
        })
        .where(eq(STUDY_TYPE_CONTENT_TABLE.id, recordId));
    });
  }
);
