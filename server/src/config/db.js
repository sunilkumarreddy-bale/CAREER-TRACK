import mongoose from 'mongoose';

// User input reaches queries only after zod validation coerces it to primitives,
// so query-operator injection ($ne, $gt, …) is not possible.
mongoose.set('strictQuery', true);

export async function connectDB(uri) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000, autoIndex: true });
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  return mongoose.connection;
}

export async function disconnectDB() {
  await mongoose.disconnect();
}
