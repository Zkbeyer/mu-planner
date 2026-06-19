export interface Course {
  id: string;
  subject: string;
  number: string;
  title: string;
  description: string;
  credits: number;
  prerequisites: string[];
}

export interface GradeRecord {
  courseId: string;
  term: string;
  professor: string;
  avgGPA: number;
  pctA: number;
  pctB: number;
  pctC: number;
  pctD: number;
  pctF: number;
  pctW: number;
}

export interface DegreeRequiredCourse {
  courseId: string;
  title: string;
  credits: number;
  category?: string;
  orCourses?: { courseId: string; title: string; credits: number }[];
}

export interface ElectivePool {
  name: string;
  minCredits: number;
  courses: { courseId: string; title: string; credits: number }[];
}

export interface SampleSemester {
  semester: string;
  courses: { courseId: string; title: string; credits: number }[];
}

export interface GeneralRequirement {
  description: string;
  credits: number;
}

export interface DegreeTrack {
  id: string;
  name: string;
  requiredCourses: DegreeRequiredCourse[];
  electivePools: ElectivePool[];
}

export interface ConcentrationArea {
  name: string;
  /** ID of the standalone degree for this concentration, if one exists. */
  degreeId?: string | null;
}

export interface Degree {
  id: string;
  name: string;
  college: string;
  totalCredits: number;
  requiredCourses: DegreeRequiredCourse[];
  electivePools: ElectivePool[];
  samplePlan: SampleSemester[];
  generalRequirements?: GeneralRequirement[];
  tracks?: DegreeTrack[];
  concentrationAreas?: ConcentrationArea[];
  concentrationCount?: number;
  stub?: boolean;
}

export interface RMPComment {
  date: string;
  rating: number;
  difficulty: number;
  wouldTakeAgain: boolean;
  text: string;
  courseName?: string | null;
}

export interface Professor {
  name: string;
  rmpSearched?: boolean;
  department: string | null;
  rmpId: string | null;
  avgRating: number | null;
  avgDifficulty: number | null;
  wouldTakeAgainPct: number | null;
  tags: string[];
  rmpUrl: string | null;
  comments: RMPComment[];
}

export interface ProfessorsMap {
  [name: string]: Professor;
}

export interface PlannerCourse {
  courseId: string;
  title: string;
  credits: number;
  avgGPA?: number;
}

export interface PlannerSemester {
  id: string;
  label: string;
  courses: PlannerCourse[];
}

export interface CollegeRequirement {
  description: string;
  credits: number;
  note?: string;
  category?: string;
}

export type CollegeRequirementsMap = Record<string, CollegeRequirement[]>;
