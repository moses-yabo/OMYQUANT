export const demoEnabled = () =>
  !process.env.MONGODB_URI &&
  (process.env.DEMO_MODE === "true" ||
    (process.env.NODE_ENV !== "production" &&
      process.env.DEMO_MODE !== "false"));
