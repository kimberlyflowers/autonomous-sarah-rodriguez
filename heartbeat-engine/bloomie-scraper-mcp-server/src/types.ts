import { PlanTier } from "./constants.js";

/** Context passed to every tool call — identifies the calling user */
export interface ScraperContext {
  orgId: string;
  planTier: PlanTier;
}

/** A scraped business listing */
export interface BusinessListing {
  name: string;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  category: string | null;
  website: string | null;
  rating: string | null;
  reviewCount: number | null;
  source: string;
}

/** An Apollo.io contact */
export interface ApolloContact {
  name: string;
  title: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
  linkedin: string | null;
  location: string | null;
  industry: string | null;
  companySize: string | null;
  source: string;
}

/** A LinkedIn profile */
export interface LinkedInProfile {
  name: string;
  headline: string | null;
  company: string | null;
  title: string | null;
  location: string | null;
  profileUrl: string | null;
  email: string | null;
  connections: number | null;
  source: string;
}

/** A scraped Facebook group member */
export interface GroupMember {
  name: string;
  profileUrl: string | null;
  workplace: string | null;
  location: string | null;
  source: string;
}

/** A custom URL scrape result row */
export interface CustomUrlRow {
  [key: string]: string;
}

/** Standard scrape response wrapper */
export interface ScrapeResponse<T> {
  query: string;
  location: string;
  source: string;
  total: number;
  count: number;
  offset: number;
  has_more: boolean;
  next_offset?: number;
  results: T[];
  errors: string[];
  warnings: string[];
}
