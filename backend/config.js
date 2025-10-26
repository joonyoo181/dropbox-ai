import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory name in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Clear any global API keys before loading local .env
// This ensures we ONLY use the backend/.env file
delete process.env.GEMINI_API_KEY;
delete process.env.OPENAI_API_KEY;
delete process.env.AI_PROVIDER;

// Load .env file from backend directory
dotenv.config({ path: path.join(__dirname, '.env') });

// Export a flag to confirm config was loaded
export const configLoaded = true;
