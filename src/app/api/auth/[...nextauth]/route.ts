import { handlers } from "@/auth";

export const runtime = "nodejs"; // Credentials provider uses prisma + bcrypt

export const { GET, POST } = handlers;
