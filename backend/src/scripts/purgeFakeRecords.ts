import mongoose from "mongoose";

async function purgeFakeRecords() {
  await mongoose.connect("mongodb://localhost:27017/netravaani");
  
  // Delete all fake users
  const userResult = await mongoose.connection.collection("users").deleteMany({
    $or: [
      { email: "nurse@netravaani.local" },
      { email: "admin@netravaani.local" },
      { username: "nurse" },
      { username: "admin" },
      { email: "testpatient@example.com" },
      { name: /ward/i },
      { name: /hospital admin/i },
    ],
  });
  console.log(`Deleted fake users: ${userResult.deletedCount}`);

  // Delete all fake patients
  const patientResult = await mongoose.connection.collection("patients").deleteMany({
    $or: [
      { patientCode: "PT-101001" },
      { displayName: /eleanor/i },
    ],
  });
  console.log(`Deleted fake patients: ${patientResult.deletedCount}`);

  // Display remaining records
  const remainingUsers = await mongoose.connection.collection("users").find({}).toArray();
  console.log("REMAINING USERS:");
  remainingUsers.forEach((u) => console.log(`- ${u._id} | ${u.name} | ${u.email} | ${u.role}`));

  const remainingPatients = await mongoose.connection.collection("patients").find({}).toArray();
  console.log("REMAINING PATIENTS:");
  remainingPatients.forEach((p) => console.log(`- ${p._id} | ${p.displayName} | ${p.patientCode}`));

  await mongoose.disconnect();
}

purgeFakeRecords().catch(console.error);
