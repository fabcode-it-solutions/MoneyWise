export default async (req: any, res: any) => {
  try {
    // Check environment variables first to avoid throwing during import
    const missing = [];
    if (!process.env.MONGODB_URI) missing.push("MONGODB_URI");
    if (!process.env.JWT_SECRET) missing.push("JWT_SECRET");
    if (!process.env.CSRF_SECRET) missing.push("CSRF_SECRET");
    
    if (missing.length > 0) {
      return res.status(500).json({
        error: "Missing Configuration",
        message: `Missing environment variables: ${missing.join(", ")}`,
        hint: "Ensure these are set in the Vercel dashboard."
      });
    }

    // Dynamic import to catch loading errors
    // We use .js extension because Vercel/Node ESM loader expects it for TS files in many cases
    const { default: app } = await import('../server/src/app.js');
    
    return await app(req, res);
  } catch (err: any) {
    console.error("Vercel Function Failure:", err);
    res.status(500).json({
      error: "Internal server error",
      hint: "Check Vercel function logs for details.",
    });
  }
};
