import { write } from "bun";

const [inputFile, outputFile] = Bun.argv.slice(2);
if (!inputFile || !outputFile) {
  console.error("Usage: bun run compress.js <input-file> <output-file>");
  process.exit(1);
}

try {
  const img = Bun.file(inputFile).image();
  
  // Resize to max 600px width if it is larger, maintaining aspect ratio
  if (img.width && img.width > 600) {
    await img.resize(600, null).webp({ quality: 80 }).write(outputFile);
  } else {
    await img.webp({ quality: 80 }).write(outputFile);
  }
  
  console.log("✅ Image compression successful");
  process.exit(0);
} catch (e) {
  console.error("❌ Compression failed:", e.message);
  process.exit(1);
}
