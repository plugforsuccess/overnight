const { z } = require("zod");

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD");

const createReservationSchema = z.object({
  childId: z.string().uuid(),
  weekStart: dateString,
  nightsPerWeek: z.number().int().refine((n) => [3, 4, 5].includes(n), {
    message: "nightsPerWeek must be 3, 4, or 5",
  }),
  selectedDates: z.array(dateString).min(1),
});

const swapNightSchema = z.object({
  dropDate: dateString,
  addDate: dateString,
});

const waitlistJoinSchema = z.object({
  date: dateString,
  childId: z.string().uuid(),
});

function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: result.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      });
    }
    req.body = result.data;
    next();
  };
}

module.exports = {
  validate,
  createReservationSchema,
  swapNightSchema,
  waitlistJoinSchema,
};
