// Define an enum for the categories
enum USCFCategory {
  GrandMaster = "Grand Master",
  Master = "Master",
  Advanced = "Advanced",
  Intermediate = "Intermediate",
  Beginner = "Beginner",
}

// Define an interface for the rating range
interface RatingRange {
  category: USCFCategory;
  minRating: number;
  maxRating: number;
}

const INIT_BEGINER_ELO = 500;

// Define the rating ranges
const ratingRanges: RatingRange[] = [
  { category: USCFCategory.GrandMaster, minRating: 2000.1, maxRating: Infinity },
  { category: USCFCategory.Master, minRating: 1800, maxRating: 2000 },
  { category: USCFCategory.Advanced, minRating: 1400, maxRating: 1799 },
  { category: USCFCategory.Intermediate, minRating: 600, maxRating: 1399 },
  { category: USCFCategory.Beginner, minRating: 0, maxRating: 599 },
];

// Export the types and data
export { USCFCategory, RatingRange, ratingRanges, INIT_BEGINER_ELO };
