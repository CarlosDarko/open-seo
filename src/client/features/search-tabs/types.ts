import type {
  KeywordMode,
  ResultLimit,
} from "@/client/features/keywords/keywordResearchTypes";
import type { ResearchScope } from "@/shared/researchScope";
import type { TermMatch } from "@/custom/keywords/termFilters";

export type BacklinksSearchTabInput = {
  type: "backlinks";
  target: string;
  scope: ResearchScope;
};

export type DomainSearchTabInput = {
  type: "domain";
  domain: string;
  scope: ResearchScope;
  locationCode?: number;
};

export type KeywordSearchTabInput = {
  type: "keyword";
  keyword: string;
  locationCode?: number;
  resultLimit: ResultLimit;
  mode: KeywordMode;
  clickstream: boolean;
  includeTerms: string[];
  excludeTerms: string[];
  includeMatch: TermMatch;
  excludeMatch: TermMatch;
};

export type SearchTabInput =
  | BacklinksSearchTabInput
  | DomainSearchTabInput
  | KeywordSearchTabInput;

export type SearchTab = {
  id: string;
  label: string;
  input: SearchTabInput;
  createdAt: number;
  viewedAt: number | null;
};
