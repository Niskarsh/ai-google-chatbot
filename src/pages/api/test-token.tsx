// pages/api/protected-backend.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { getToken } from "next-auth/jwt";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Fetch the token using the secret (same secret as in your NextAuth config)
  const token = await getToken({ req, secret: process.env.NEXT_PUBLIC_SECRET });

  if (!token) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  // Now you can use token.accessToken on the backend.
  // For example, calling a Google API using the access token.
  res.status(200).json({ message: "Backend access granted", accessToken: token.accessToken });
}
