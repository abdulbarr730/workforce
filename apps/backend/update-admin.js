const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const MONGODB_URI = "mongodb+srv://abdullatif2454:Abdul123@cluster0.3x17z.mongodb.net/workforce?retryWrites=true&w=majority&appName=Cluster0"; 

async function updatePassword() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("Connected to MongoDB.");

    const db = mongoose.connection.db;
    
    const hashedPassword = await bcrypt.hash("Limitless#24", 10);
    
    const result = await db.collection('users').updateOne(
      { email: "admin@prosyncedu.com" },
      { $set: { password: hashedPassword } }
    );
    
    if (result.matchedCount > 0) {
      console.log("Admin password updated successfully.");
    } else {
      console.log("Admin user not found.");
    }
  } catch (error) {
    console.error("Error:", error);
  } finally {
    mongoose.disconnect();
  }
}

updatePassword();
