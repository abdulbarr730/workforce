import { Jimp } from "jimp";
import path from "path";

async function resize() {
  const iconPath = path.join(process.cwd(), "apps/desktop-agent/build/icon.png");
  try {
    const image = await Jimp.read(iconPath);
    console.log(`Original size: ${image.bitmap.width}x${image.bitmap.height}`);
    
    // Resize to 512x512
    image.resize({ w: 512, h: 512 });
    
    await image.write(iconPath);
    console.log("Successfully resized icon to 512x512");
  } catch (err) {
    console.error("Error resizing icon:", err);
  }
}

resize();
