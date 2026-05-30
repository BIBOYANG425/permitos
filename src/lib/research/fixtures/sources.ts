import type { SourceFixture } from "../types";

export const sourceFixtures: Record<string, SourceFixture> = {
  scaqmd_rule_201: {
    id: "scaqmd_rule_201",
    family: "air",
    source_name: "SCAQMD Rule 201",
    url: "https://www.aqmd.gov/docs/default-source/rule-book/reg-ii/rule-201.pdf",
    authority_rank: 1,
    fetched_at: "2026-05-30T00:00:00Z",
    content_hash: "sha256:demo-scaqmd-rule-201",
    effective_date: null,
    quote: "A person shall not build, erect, install, alter, or replace any equipment that may emit air contaminants without written authorization.",
    extracted: { permit_trigger: "new or altered equipment that may emit air contaminants" }
  },
  scaqmd_rule_219: {
    id: "scaqmd_rule_219",
    family: "air",
    source_name: "SCAQMD Rule 219",
    url: "https://www.aqmd.gov/docs/default-source/rule-book/reg-ii/rule-219.pdf",
    authority_rank: 1,
    fetched_at: "2026-05-30T00:00:00Z",
    content_hash: "sha256:demo-scaqmd-rule-219",
    effective_date: null,
    quote: "Equipment listed in this rule may be exempt from written permit requirements when the listed conditions are satisfied.",
    extracted: { exemption_check_required: true }
  },
  scaqmd_rule_222: {
    id: "scaqmd_rule_222",
    family: "air",
    source_name: "SCAQMD Rule 222",
    url: "https://www.aqmd.gov/docs/default-source/rule-book/reg-ii/rule-222.pdf",
    authority_rank: 1,
    fetched_at: "2026-05-30T00:00:00Z",
    content_hash: "sha256:demo-scaqmd-rule-222",
    effective_date: null,
    quote: "Owners or operators of specified equipment shall file registration information when the rule applies to that equipment category.",
    extracted: { registration_possible: true }
  },
  industrial_general_permit: {
    id: "industrial_general_permit",
    family: "stormwater",
    source_name: "California Industrial General Permit",
    url: "https://www.waterboards.ca.gov/water_issues/programs/stormwater/industrial.html",
    authority_rank: 1,
    fetched_at: "2026-05-30T00:00:00Z",
    content_hash: "sha256:demo-ca-igp",
    effective_date: null,
    quote: "Industrial facilities described by regulated Standard Industrial Classification codes must obtain coverage under the Industrial General Permit unless an exclusion applies.",
    extracted: { regulated_sic: "3471" }
  },
  construction_general_permit: {
    id: "construction_general_permit",
    family: "stormwater",
    source_name: "California Construction General Permit",
    url: "https://www.waterboards.ca.gov/water_issues/programs/stormwater/construction.html",
    authority_rank: 1,
    fetched_at: "2026-05-30T00:00:00Z",
    content_hash: "sha256:demo-ca-cgp",
    effective_date: null,
    quote: "Construction activity that disturbs one or more acres of soil must obtain coverage under the Construction General Permit.",
    extracted: { acreage_threshold: 1 }
  },
  hmbp_threshold_bad: {
    id: "hmbp_threshold_bad",
    family: "hazmat",
    source_name: "California HMBP Threshold Summary",
    url: "https://calepa.ca.gov/cupa/hazardous-materials-business-plan/",
    authority_rank: 1,
    fetched_at: "2026-05-30T00:00:00Z",
    content_hash: "sha256:demo-hmbp-bad",
    effective_date: null,
    quote: "Businesses must submit information for hazardous materials at or above threshold quantities.",
    extracted: { overbroad_claim: "HMBP applies to all hazardous material storage" }
  },
  hmbp_threshold_repaired: {
    id: "hmbp_threshold_repaired",
    family: "hazmat",
    source_name: "California HMBP Threshold Summary",
    url: "https://calepa.ca.gov/cupa/hazardous-materials-business-plan/",
    authority_rank: 1,
    fetched_at: "2026-05-30T00:00:00Z",
    content_hash: "sha256:demo-hmbp-repaired",
    effective_date: null,
    quote: "A hazardous material must be reported when present in quantities equal to or greater than 55 gallons for liquids, 500 pounds for solids, or 200 cubic feet for compressed gases.",
    extracted: { liquid_gallons_threshold: 55 }
  },
  hazardous_waste_generator: {
    id: "hazardous_waste_generator",
    family: "waste",
    source_name: "EPA Hazardous Waste Generator Categories",
    url: "https://www.epa.gov/hwgenerators/categories-hazardous-waste-generators",
    authority_rank: 1,
    fetched_at: "2026-05-30T00:00:00Z",
    content_hash: "sha256:demo-epa-generator",
    effective_date: null,
    quote: "Generator category depends on the amount of hazardous waste generated in a calendar month.",
    extracted: { generator_quantity_required: true }
  },
  wastewater_pretreatment: {
    id: "wastewater_pretreatment",
    family: "wastewater",
    source_name: "EPA Pretreatment Program Overview",
    url: "https://www.epa.gov/npdes/national-pretreatment-program",
    authority_rank: 1,
    fetched_at: "2026-05-30T00:00:00Z",
    content_hash: "sha256:demo-epa-pretreatment",
    effective_date: null,
    quote: "Industrial users that discharge process wastewater to publicly owned treatment works may be subject to pretreatment requirements.",
    extracted: { process_discharge_required: true }
  }
};
