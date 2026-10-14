import mongoose, { Schema, Document } from "mongoose";
import bcrypt from "bcryptjs";

export interface IUser extends Document {
  name: string;
  email: string;
  username?: string;
  password?: string;
  passwordHash?: string;
  role: string;
  referralCode?: string;
  profilePicture?: string;
  isVerified: boolean;
  verificationToken?: string | null;
  verificationTokenExpires?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const UserSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    username: {
      type: String,
      trim: true,
      lowercase: true,
      sparse: true,
    },
    password: {
      type: String,
      select: false,
    },
    passwordHash: {
      type: String,
      select: false,
    },
    role: {
      type: String,
      default: "nurse",
    },
    referralCode: {
      type: String,
      sparse: true,
    },
    profilePicture: {
      type: String,
      default: "",
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    verificationToken: {
      type: String,
      select: false,
      default: null,
    },
    verificationTokenExpires: {
      type: Date,
      select: false,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Hash password prior to saving
UserSchema.pre("save", async function (next) {
  if (this.isModified("password") && this.password) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    this.passwordHash = this.password;
  }
  next();
});

UserSchema.methods.comparePassword = async function (
  candidatePassword: string
): Promise<boolean> {
  const hash = this.password || this.passwordHash;
  if (!hash) return false;
  return bcrypt.compare(candidatePassword, hash);
};

export const User = mongoose.model<IUser>("User", UserSchema);
export default User;
