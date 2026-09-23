import { generatePrunaVideoAndWait } from "../src/lib/runware-pruna-video";
import { config } from "dotenv";

// Load environment variables from .env or .env.local
config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  console.log("Starting Runware Pruna Video Generation Test...");
  const testImageUrl = "https://picsum.photos/640/640"; // Dummy test image

  try {
    const videoUrl = await generatePrunaVideoAndWait(testImageUrl, {
      durationSeconds: 3,
      pollIntervalMs: 3000,
      timeoutMs: 60000, // 1 min timeout for fast fail during tests
    });

    console.log("✅ Success! Video generated:");
    console.log("URL:", videoUrl);
  } catch (error) {
    console.error("❌ Failed to generate video:");
    console.error(error);
  }
}

main();
