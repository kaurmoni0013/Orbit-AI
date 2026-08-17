import { GoogleGenAI } from "@google/genai";
import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

const ai = new GoogleGenAI({});

const interaction = await ai.interactions.create({
  model: "gemini-3.7-flash",
  input: "Explain how AI works in a few words",
});
console.log(interaction.output_text);