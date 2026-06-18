/**
 * Acme Health - Full Medical Records Tool
 * 
 * Retrieves comprehensive medical records after MFA verification.
 * Contains detailed medical history, lab results, visits, immunizations, etc.
 */

import { createTool } from './registry.js';
import type { ToolResult, ToolContext } from '../types/index.js';
import { sessionCache, CacheKeys } from '../services/cache.js';

// =============================================================================
// COMPREHENSIVE MEDICAL RECORDS - SARAH JOHNSON (MEM-001)
// =============================================================================

interface LabResult {
  testName: string;
  value: string;
  unit: string;
  referenceRange: string;
  status: 'normal' | 'high' | 'low' | 'critical';
  date: string;
}

interface Immunization {
  vaccine: string;
  date: string;
  provider: string;
  lotNumber: string;
  nextDue?: string;
}

interface Visit {
  date: string;
  type: 'office' | 'telehealth' | 'urgent_care' | 'emergency' | 'lab';
  provider: string;
  reason: string;
  diagnosis?: string[];
  notes?: string;
  followUp?: string;
}

interface Procedure {
  name: string;
  date: string;
  provider: string;
  facility: string;
  notes?: string;
}

interface FamilyHistory {
  relation: string;
  condition: string;
  ageOfOnset?: string;
  notes?: string;
}

interface FullMedicalRecord {
  memberId: string;
  lastUpdated: string;
  
  // Vital Signs History
  vitalSigns: {
    date: string;
    bloodPressure: string;
    heartRate: number;
    temperature: number;
    weight: string;
    height: string;
    bmi: number;
    oxygenSaturation: number;
  }[];
  
  // Lab Results
  labResults: LabResult[];
  
  // Immunizations
  immunizations: Immunization[];
  
  // Visit History
  visits: Visit[];
  
  // Procedures
  procedures: Procedure[];
  
  // Family History
  familyHistory: FamilyHistory[];
  
  // Social History
  socialHistory: {
    smokingStatus: string;
    alcoholUse: string;
    exerciseFrequency: string;
    occupation: string;
    livingSituation: string;
  };
  
  // Care Plan
  carePlan: {
    goals: string[];
    recommendations: string[];
    nextAppointments: { date: string; type: string; provider: string }[];
  };
}

// Sarah Johnson's Complete Medical Record
const SARAH_JOHNSON_RECORD: FullMedicalRecord = {
  memberId: 'MEM-001',
  lastUpdated: '2026-01-20',
  
  vitalSigns: [
    {
      date: '2026-01-15',
      bloodPressure: '128/82',
      heartRate: 76,
      temperature: 98.4,
      weight: '165 lbs',
      height: '5\'6"',
      bmi: 26.6,
      oxygenSaturation: 98,
    },
    {
      date: '2025-12-15',
      bloodPressure: '132/85',
      heartRate: 78,
      temperature: 98.6,
      weight: '167 lbs',
      height: '5\'6"',
      bmi: 27.0,
      oxygenSaturation: 97,
    },
    {
      date: '2025-10-10',
      bloodPressure: '135/88',
      heartRate: 80,
      temperature: 98.5,
      weight: '170 lbs',
      height: '5\'6"',
      bmi: 27.4,
      oxygenSaturation: 98,
    },
  ],
  
  labResults: [
    // Recent A1C
    {
      testName: 'Hemoglobin A1C',
      value: '6.8',
      unit: '%',
      referenceRange: '< 5.7% (normal), 5.7-6.4% (prediabetes), ≥ 6.5% (diabetes)',
      status: 'high',
      date: '2025-12-15',
    },
    // Fasting Glucose
    {
      testName: 'Fasting Glucose',
      value: '132',
      unit: 'mg/dL',
      referenceRange: '70-100 mg/dL',
      status: 'high',
      date: '2025-12-15',
    },
    // Lipid Panel
    {
      testName: 'Total Cholesterol',
      value: '195',
      unit: 'mg/dL',
      referenceRange: '< 200 mg/dL',
      status: 'normal',
      date: '2025-12-15',
    },
    {
      testName: 'LDL Cholesterol',
      value: '118',
      unit: 'mg/dL',
      referenceRange: '< 100 mg/dL optimal',
      status: 'high',
      date: '2025-12-15',
    },
    {
      testName: 'HDL Cholesterol',
      value: '52',
      unit: 'mg/dL',
      referenceRange: '> 50 mg/dL for women',
      status: 'normal',
      date: '2025-12-15',
    },
    {
      testName: 'Triglycerides',
      value: '145',
      unit: 'mg/dL',
      referenceRange: '< 150 mg/dL',
      status: 'normal',
      date: '2025-12-15',
    },
    // Kidney Function
    {
      testName: 'Creatinine',
      value: '0.9',
      unit: 'mg/dL',
      referenceRange: '0.6-1.2 mg/dL',
      status: 'normal',
      date: '2025-12-15',
    },
    {
      testName: 'eGFR',
      value: '92',
      unit: 'mL/min/1.73m²',
      referenceRange: '> 90 mL/min/1.73m²',
      status: 'normal',
      date: '2025-12-15',
    },
    {
      testName: 'Urine Albumin/Creatinine Ratio',
      value: '22',
      unit: 'mg/g',
      referenceRange: '< 30 mg/g',
      status: 'normal',
      date: '2025-12-15',
    },
    // Thyroid
    {
      testName: 'TSH',
      value: '2.1',
      unit: 'mIU/L',
      referenceRange: '0.4-4.0 mIU/L',
      status: 'normal',
      date: '2025-12-15',
    },
    // CBC
    {
      testName: 'WBC',
      value: '6.8',
      unit: 'K/uL',
      referenceRange: '4.5-11.0 K/uL',
      status: 'normal',
      date: '2025-12-15',
    },
    {
      testName: 'Hemoglobin',
      value: '13.2',
      unit: 'g/dL',
      referenceRange: '12.0-16.0 g/dL',
      status: 'normal',
      date: '2025-12-15',
    },
    // Vitamin D
    {
      testName: 'Vitamin D, 25-Hydroxy',
      value: '28',
      unit: 'ng/mL',
      referenceRange: '30-100 ng/mL',
      status: 'low',
      date: '2025-12-15',
    },
  ],
  
  immunizations: [
    {
      vaccine: 'Influenza (Flu Shot)',
      date: '2025-10-15',
      provider: 'Dr. Patricia Williams',
      lotNumber: 'FLU2025-A123',
      nextDue: '2026-10-01',
    },
    {
      vaccine: 'COVID-19 Booster (Updated)',
      date: '2025-09-20',
      provider: "Acme Health Pharmacy",
      lotNumber: 'COV2025-B456',
      nextDue: '2026-09-01',
    },
    {
      vaccine: 'Tdap (Tetanus, Diphtheria, Pertussis)',
      date: '2022-06-10',
      provider: 'Dr. Patricia Williams',
      lotNumber: 'TDAP-C789',
      nextDue: '2032-06-10',
    },
    {
      vaccine: 'Hepatitis B - Series Complete',
      date: '2020-03-15',
      provider: 'Dr. Patricia Williams',
      lotNumber: 'HEPB-D012',
    },
    {
      vaccine: 'MMR (Measles, Mumps, Rubella)',
      date: '1989-08-20',
      provider: 'Pediatric Associates',
      lotNumber: 'Historical',
    },
  ],
  
  visits: [
    {
      date: '2026-01-15',
      type: 'office',
      provider: 'Dr. Patricia Williams',
      reason: 'Diabetes management follow-up',
      diagnosis: ['E11.9 - Type 2 diabetes mellitus', 'I10 - Essential hypertension'],
      notes: 'A1C improved from 7.1% to 6.8%. Continue current medication regimen. Patient doing well with diet modifications. Blood pressure well controlled on Lisinopril.',
      followUp: '3 months',
    },
    {
      date: '2025-12-15',
      type: 'office',
      provider: 'Dr. Patricia Williams',
      reason: 'Quarterly diabetes checkup',
      diagnosis: ['E11.9 - Type 2 diabetes mellitus'],
      notes: 'Labs ordered for comprehensive metabolic panel and A1C. Discussed importance of regular exercise and dietary compliance.',
      followUp: '1 month for lab review',
    },
    {
      date: '2025-10-10',
      type: 'telehealth',
      provider: 'Dr. Patricia Williams',
      reason: 'Medication review',
      notes: 'Patient reports good tolerance of Jardiance. No hypoglycemic episodes. Increased water intake as recommended.',
    },
    {
      date: '2025-08-22',
      type: 'office',
      provider: 'Dr. Patricia Williams',
      reason: 'Annual wellness visit',
      diagnosis: ['Z00.00 - Encounter for general adult medical examination'],
      notes: 'Comprehensive physical exam completed. All age-appropriate screenings up to date. Mammogram scheduled.',
      followUp: '1 year for annual wellness',
    },
    {
      date: '2025-06-15',
      type: 'lab',
      provider: "Acme Health Lab Services",
      reason: 'Routine diabetes monitoring labs',
      notes: 'Fasting labs drawn. Results reviewed by Dr. Williams.',
    },
    {
      date: '2025-03-10',
      type: 'office',
      provider: 'Dr. Sarah Mitchell (Ophthalmology)',
      reason: 'Diabetic eye exam',
      diagnosis: ['Z01.00 - Eye examination'],
      notes: 'No diabetic retinopathy detected. Mild dry eye noted. Recommend artificial tears as needed.',
      followUp: '1 year',
    },
  ],
  
  procedures: [
    {
      name: 'Mammogram - Screening',
      date: '2025-09-05',
      provider: 'Dr. Lisa Thompson',
      facility: "Acme Health Imaging Center - Chesterfield",
      notes: 'BI-RADS Category 1 - Negative. No significant findings.',
    },
    {
      name: 'Bone Density Scan (DEXA)',
      date: '2024-08-15',
      provider: 'Dr. Robert Klein',
      facility: "Acme Health Imaging Center - Chesterfield",
      notes: 'T-score: -0.8 (normal range). No osteopenia or osteoporosis.',
    },
    {
      name: 'Pap Smear',
      date: '2024-08-22',
      provider: 'Dr. Patricia Williams',
      facility: "Acme Health Women's Health",
      notes: 'Normal results. HPV negative. Next screening in 3 years.',
    },
  ],
  
  familyHistory: [
    {
      relation: 'Mother',
      condition: 'Type 2 Diabetes',
      ageOfOnset: '52',
      notes: 'Currently managed with oral medications',
    },
    {
      relation: 'Father',
      condition: 'Hypertension',
      ageOfOnset: '45',
      notes: 'On blood pressure medication',
    },
    {
      relation: 'Father',
      condition: 'Coronary Artery Disease',
      ageOfOnset: '62',
      notes: 'Had stent placement at age 65',
    },
    {
      relation: 'Maternal Grandmother',
      condition: 'Type 2 Diabetes',
      ageOfOnset: '60',
      notes: 'Insulin-dependent later in life',
    },
    {
      relation: 'Paternal Grandfather',
      condition: 'Stroke',
      ageOfOnset: '72',
    },
  ],
  
  socialHistory: {
    smokingStatus: 'Never smoker',
    alcoholUse: 'Occasional - 1-2 drinks per week socially',
    exerciseFrequency: '3-4 times per week - walking, yoga',
    occupation: 'Marketing Manager - primarily desk work',
    livingSituation: 'Lives with spouse and 2 children in single-family home',
  },
  
  carePlan: {
    goals: [
      'Maintain A1C below 7.0%',
      'Keep blood pressure under 130/80 mmHg',
      'Lose 10-15 pounds through diet and exercise',
      'Complete annual diabetic eye and foot exams',
      'Monitor kidney function every 6 months',
    ],
    recommendations: [
      'Continue current medication regimen: Lisinopril, Metformin ER, Jardiance',
      'Follow diabetic diet - limit carbohydrates to 45-60g per meal',
      'Exercise minimum 150 minutes per week (moderate intensity)',
      'Check blood sugar fasting and 2 hours after meals',
      'Start Vitamin D 2000 IU daily supplement',
      'Annual flu shot and stay current on COVID-19 boosters',
    ],
    nextAppointments: [
      {
        date: '2026-01-30',
        type: 'Lab Work',
        provider: "Acme Health Lab Services",
      },
      {
        date: '2026-02-15',
        type: 'Diabetes Follow-up',
        provider: 'Dr. Patricia Williams',
      },
      {
        date: '2026-03-10',
        type: 'Diabetic Eye Exam',
        provider: 'Dr. Sarah Mitchell',
      },
    ],
  },
};

// =============================================================================
// ROBERT MARTINEZ (MEM-002) - Cardiovascular Disease & High Cholesterol
// =============================================================================
const ROBERT_MARTINEZ_RECORD: FullMedicalRecord = {
  memberId: 'MEM-002',
  lastUpdated: '2026-01-22',
  
  vitalSigns: [
    {
      date: '2026-01-18',
      bloodPressure: '138/88',
      heartRate: 68,
      temperature: 98.2,
      weight: '195 lbs',
      height: '5\'10"',
      bmi: 28.0,
      oxygenSaturation: 96,
    },
    {
      date: '2025-12-05',
      bloodPressure: '142/90',
      heartRate: 72,
      temperature: 98.4,
      weight: '198 lbs',
      height: '5\'10"',
      bmi: 28.4,
      oxygenSaturation: 95,
    },
    {
      date: '2025-10-15',
      bloodPressure: '145/92',
      heartRate: 75,
      temperature: 98.6,
      weight: '200 lbs',
      height: '5\'10"',
      bmi: 28.7,
      oxygenSaturation: 96,
    },
  ],
  
  labResults: [
    {
      testName: 'Total Cholesterol',
      value: '215',
      unit: 'mg/dL',
      referenceRange: '< 200 mg/dL',
      status: 'high',
      date: '2025-12-05',
    },
    {
      testName: 'LDL Cholesterol',
      value: '135',
      unit: 'mg/dL',
      referenceRange: '< 100 mg/dL optimal',
      status: 'high',
      date: '2025-12-05',
    },
    {
      testName: 'HDL Cholesterol',
      value: '42',
      unit: 'mg/dL',
      referenceRange: '> 40 mg/dL for men',
      status: 'normal',
      date: '2025-12-05',
    },
    {
      testName: 'Triglycerides',
      value: '178',
      unit: 'mg/dL',
      referenceRange: '< 150 mg/dL',
      status: 'high',
      date: '2025-12-05',
    },
    {
      testName: 'BNP (B-type Natriuretic Peptide)',
      value: '85',
      unit: 'pg/mL',
      referenceRange: '< 100 pg/mL',
      status: 'normal',
      date: '2025-12-05',
    },
    {
      testName: 'INR',
      value: '2.3',
      unit: '',
      referenceRange: '2.0-3.0 (therapeutic)',
      status: 'normal',
      date: '2026-01-15',
    },
    {
      testName: 'Troponin I',
      value: '< 0.01',
      unit: 'ng/mL',
      referenceRange: '< 0.04 ng/mL',
      status: 'normal',
      date: '2025-12-05',
    },
    {
      testName: 'Creatinine',
      value: '1.1',
      unit: 'mg/dL',
      referenceRange: '0.7-1.3 mg/dL',
      status: 'normal',
      date: '2025-12-05',
    },
    {
      testName: 'Potassium',
      value: '4.2',
      unit: 'mEq/L',
      referenceRange: '3.5-5.0 mEq/L',
      status: 'normal',
      date: '2025-12-05',
    },
  ],
  
  immunizations: [
    {
      vaccine: 'Influenza (High-Dose Flu Shot)',
      date: '2025-10-01',
      provider: 'Dr. James Chen',
      lotNumber: 'FLU2025-HD789',
      nextDue: '2026-10-01',
    },
    {
      vaccine: 'COVID-19 Booster (Updated)',
      date: '2025-09-15',
      provider: "Acme Health Pharmacy",
      lotNumber: 'COV2025-X456',
      nextDue: '2026-09-01',
    },
    {
      vaccine: 'Pneumococcal (Prevnar 20)',
      date: '2024-03-20',
      provider: 'Dr. James Chen',
      lotNumber: 'PCV20-A123',
    },
    {
      vaccine: 'Shingrix (Shingles) - Series Complete',
      date: '2023-06-15',
      provider: 'Dr. James Chen',
      lotNumber: 'SHIN-B789',
    },
  ],
  
  visits: [
    {
      date: '2026-01-18',
      type: 'office',
      provider: 'Dr. James Chen',
      reason: 'Cardiology follow-up',
      diagnosis: ['I25.10 - Coronary artery disease', 'I48.91 - Atrial fibrillation'],
      notes: 'INR stable on Eliquis. Heart rhythm controlled with Metoprolol. Discussed importance of low-sodium diet. Echo scheduled for next month.',
      followUp: '3 months',
    },
    {
      date: '2025-12-05',
      type: 'lab',
      provider: "Acme Health Lab Services",
      reason: 'Lipid panel and cardiac markers',
      notes: 'Fasting labs drawn. Results reviewed - LDL still elevated, consider dose adjustment.',
    },
    {
      date: '2025-10-15',
      type: 'office',
      provider: 'Dr. James Chen',
      reason: 'Quarterly cardiology checkup',
      diagnosis: ['I25.10 - Coronary artery disease'],
      notes: 'Stable condition. Continue current regimen. Stress test results normal.',
    },
    {
      date: '2025-08-10',
      type: 'office',
      provider: 'Dr. James Chen',
      reason: 'Nuclear stress test',
      diagnosis: ['Z13.6 - Screening for cardiovascular disorders'],
      notes: 'Stress test completed. No significant ischemia. EF 55%. Continue current management.',
    },
  ],
  
  procedures: [
    {
      name: 'Coronary Angioplasty with Stent Placement',
      date: '2020-06-15',
      provider: 'Dr. James Chen',
      facility: "Acme Health Heart Center - Bethlehem",
      notes: 'Drug-eluting stent placed in LAD. Successful revascularization.',
    },
    {
      name: 'Echocardiogram',
      date: '2025-06-20',
      provider: 'Dr. James Chen',
      facility: "Acme Health Heart Center - Bethlehem",
      notes: 'LVEF 55%, mild LVH, no significant valvular disease.',
    },
    {
      name: 'Colonoscopy - Screening',
      date: '2024-05-10',
      provider: 'Dr. Michael Brown',
      facility: "Acme Health Endoscopy Center",
      notes: '2 small polyps removed (benign). Repeat in 5 years.',
    },
  ],
  
  familyHistory: [
    {
      relation: 'Father',
      condition: 'Myocardial Infarction (Heart Attack)',
      ageOfOnset: '58',
      notes: 'Fatal heart attack',
    },
    {
      relation: 'Brother',
      condition: 'Coronary Artery Disease',
      ageOfOnset: '55',
      notes: 'Had bypass surgery',
    },
    {
      relation: 'Mother',
      condition: 'Stroke',
      ageOfOnset: '75',
      notes: 'Recovered with mild deficits',
    },
  ],
  
  socialHistory: {
    smokingStatus: 'Former smoker - quit 10 years ago (20 pack-year history)',
    alcoholUse: 'None - quit after cardiac event',
    exerciseFrequency: '30 min walk daily, cardiac rehab completed',
    occupation: 'Retired - former construction manager',
    livingSituation: 'Lives with wife in single-story home',
  },
  
  carePlan: {
    goals: [
      'Maintain LDL cholesterol below 70 mg/dL',
      'Keep blood pressure under 130/80 mmHg',
      'Maintain INR in therapeutic range (2.0-3.0)',
      'Complete cardiac rehab maintenance program',
      'Lose 15-20 pounds',
    ],
    recommendations: [
      'Continue Atorvastatin 40mg, Eliquis 5mg, Metoprolol 50mg',
      'Low-sodium, heart-healthy diet (< 2000mg sodium/day)',
      'Daily walking program 30 minutes minimum',
      'Monitor blood pressure at home twice daily',
      'Carry nitroglycerin at all times',
      'Annual flu shot and pneumonia vaccine up to date',
    ],
    nextAppointments: [
      {
        date: '2026-02-15',
        type: 'Echocardiogram',
        provider: 'Dr. James Chen',
      },
      {
        date: '2026-02-20',
        type: 'Cardiology Follow-up',
        provider: 'Dr. James Chen',
      },
      {
        date: '2026-04-15',
        type: 'Lab Work',
        provider: "Acme Health Lab Services",
      },
    ],
  },
};

// =============================================================================
// EMILY CHEN (MEM-003) - Asthma & Anxiety
// =============================================================================
const EMILY_CHEN_RECORD: FullMedicalRecord = {
  memberId: 'MEM-003',
  lastUpdated: '2026-01-20',
  
  vitalSigns: [
    {
      date: '2026-01-12',
      bloodPressure: '118/75',
      heartRate: 78,
      temperature: 98.6,
      weight: '135 lbs',
      height: '5\'5"',
      bmi: 22.5,
      oxygenSaturation: 98,
    },
    {
      date: '2025-11-20',
      bloodPressure: '120/78',
      heartRate: 82,
      temperature: 98.4,
      weight: '134 lbs',
      height: '5\'5"',
      bmi: 22.3,
      oxygenSaturation: 97,
    },
    {
      date: '2025-09-15',
      bloodPressure: '116/74',
      heartRate: 76,
      temperature: 98.5,
      weight: '133 lbs',
      height: '5\'5"',
      bmi: 22.1,
      oxygenSaturation: 99,
    },
  ],
  
  labResults: [
    {
      testName: 'CBC - WBC',
      value: '7.2',
      unit: 'K/uL',
      referenceRange: '4.5-11.0 K/uL',
      status: 'normal',
      date: '2025-11-20',
    },
    {
      testName: 'CBC - Hemoglobin',
      value: '13.8',
      unit: 'g/dL',
      referenceRange: '12.0-16.0 g/dL',
      status: 'normal',
      date: '2025-11-20',
    },
    {
      testName: 'Vitamin D, 25-Hydroxy',
      value: '32',
      unit: 'ng/mL',
      referenceRange: '30-100 ng/mL',
      status: 'normal',
      date: '2025-11-20',
    },
    {
      testName: 'TSH',
      value: '2.5',
      unit: 'mIU/L',
      referenceRange: '0.4-4.0 mIU/L',
      status: 'normal',
      date: '2025-11-20',
    },
    {
      testName: 'IgE Total',
      value: '185',
      unit: 'IU/mL',
      referenceRange: '< 100 IU/mL',
      status: 'high',
      date: '2025-11-20',
    },
    {
      testName: 'Eosinophils',
      value: '6.2',
      unit: '%',
      referenceRange: '1-4%',
      status: 'high',
      date: '2025-11-20',
    },
  ],
  
  immunizations: [
    {
      vaccine: 'Influenza (Flu Shot)',
      date: '2025-10-10',
      provider: 'Dr. Jennifer Lee',
      lotNumber: 'FLU2025-C567',
      nextDue: '2026-10-01',
    },
    {
      vaccine: 'COVID-19 Booster (Updated)',
      date: '2025-09-25',
      provider: "Acme Health Pharmacy",
      lotNumber: 'COV2025-D890',
      nextDue: '2026-09-01',
    },
    {
      vaccine: 'Tdap (Tetanus, Diphtheria, Pertussis)',
      date: '2023-08-15',
      provider: 'Dr. Jennifer Lee',
      lotNumber: 'TDAP-E123',
      nextDue: '2033-08-15',
    },
    {
      vaccine: 'HPV (Gardasil 9) - Series Complete',
      date: '2015-06-20',
      provider: 'Pediatric Associates',
      lotNumber: 'Historical',
    },
  ],
  
  visits: [
    {
      date: '2026-01-12',
      type: 'office',
      provider: 'Dr. Jennifer Lee',
      reason: 'Asthma management follow-up',
      diagnosis: ['J45.30 - Moderate persistent asthma', 'J30.9 - Allergic rhinitis'],
      notes: 'Asthma well controlled on Symbicort. Peak flow readings stable. Discussed avoiding triggers during winter months.',
      followUp: '3 months',
    },
    {
      date: '2025-12-18',
      type: 'telehealth',
      provider: 'Dr. Amanda Foster',
      reason: 'Anxiety check-in',
      diagnosis: ['F41.1 - Generalized anxiety disorder'],
      notes: 'Patient reports Lexapro effective. Sleep improved. Continuing therapy weekly. No dose adjustment needed.',
      followUp: '2 months',
    },
    {
      date: '2025-11-20',
      type: 'office',
      provider: 'Dr. Jennifer Lee',
      reason: 'Asthma flare-up',
      diagnosis: ['J45.31 - Moderate persistent asthma with acute exacerbation'],
      notes: 'Triggered by cold weather and viral URI. Short course of prednisone prescribed. Increase Symbicort temporarily.',
      followUp: '2 weeks',
    },
    {
      date: '2025-09-15',
      type: 'office',
      provider: 'Dr. Jennifer Lee',
      reason: 'Annual wellness visit',
      diagnosis: ['Z00.00 - General adult medical examination'],
      notes: 'Comprehensive physical completed. All screenings up to date. Discussed stress management strategies.',
    },
  ],
  
  procedures: [
    {
      name: 'Pulmonary Function Test (PFT)',
      date: '2025-06-10',
      provider: 'Dr. Jennifer Lee',
      facility: "Acme Health Pulmonary Center - Seattle",
      notes: 'FEV1 82% predicted. Mild obstruction with good bronchodilator response.',
    },
    {
      name: 'Allergy Skin Testing',
      date: '2024-04-20',
      provider: 'Dr. Jennifer Lee',
      facility: "Acme Health Allergy Clinic",
      notes: 'Positive for dust mites, cat dander, grass pollen, ragweed. Negative for food allergens.',
    },
  ],
  
  familyHistory: [
    {
      relation: 'Mother',
      condition: 'Asthma',
      ageOfOnset: 'Childhood',
      notes: 'Well controlled',
    },
    {
      relation: 'Father',
      condition: 'Seasonal allergies',
      notes: 'Managed with OTC antihistamines',
    },
    {
      relation: 'Maternal aunt',
      condition: 'Depression',
      ageOfOnset: '30',
    },
  ],
  
  socialHistory: {
    smokingStatus: 'Never smoker',
    alcoholUse: 'Social - 2-3 drinks per week',
    exerciseFrequency: '4-5 times per week - running, swimming, yoga',
    occupation: 'Software Developer - work from home',
    livingSituation: 'Lives alone in apartment with HEPA air purifiers',
  },
  
  carePlan: {
    goals: [
      'Maintain asthma control with peak flow > 80% personal best',
      'Reduce rescue inhaler use to < 2 times per week',
      'Continue anxiety management with therapy and medication',
      'Avoid known allergen triggers',
    ],
    recommendations: [
      'Continue Symbicort 160/4.5mcg twice daily',
      'Use ProAir rescue inhaler as needed, track usage',
      'Continue Lexapro 10mg daily',
      'Zyrtec 10mg daily for allergies',
      'Weekly therapy sessions for anxiety management',
      'Keep rescue inhaler accessible at all times',
      'Use dust mite covers on bedding',
    ],
    nextAppointments: [
      {
        date: '2026-02-18',
        type: 'Psychiatry Follow-up',
        provider: 'Dr. Amanda Foster',
      },
      {
        date: '2026-04-12',
        type: 'Pulmonology Follow-up',
        provider: 'Dr. Jennifer Lee',
      },
      {
        date: '2026-06-10',
        type: 'Pulmonary Function Test',
        provider: 'Dr. Jennifer Lee',
      },
    ],
  },
};

// =============================================================================
// JAMES WILSON (MEM-004) - COPD & Arthritis
// =============================================================================
const JAMES_WILSON_RECORD: FullMedicalRecord = {
  memberId: 'MEM-004',
  lastUpdated: '2026-01-21',
  
  vitalSigns: [
    {
      date: '2026-01-15',
      bloodPressure: '142/85',
      heartRate: 82,
      temperature: 98.0,
      weight: '180 lbs',
      height: '5\'9"',
      bmi: 26.6,
      oxygenSaturation: 93,
    },
    {
      date: '2025-12-01',
      bloodPressure: '145/88',
      heartRate: 85,
      temperature: 98.2,
      weight: '182 lbs',
      height: '5\'9"',
      bmi: 26.9,
      oxygenSaturation: 92,
    },
    {
      date: '2025-10-10',
      bloodPressure: '140/84',
      heartRate: 80,
      temperature: 98.4,
      weight: '181 lbs',
      height: '5\'9"',
      bmi: 26.7,
      oxygenSaturation: 94,
    },
  ],
  
  labResults: [
    {
      testName: 'CBC - WBC',
      value: '8.5',
      unit: 'K/uL',
      referenceRange: '4.5-11.0 K/uL',
      status: 'normal',
      date: '2025-12-01',
    },
    {
      testName: 'CBC - Hemoglobin',
      value: '14.2',
      unit: 'g/dL',
      referenceRange: '13.5-17.5 g/dL',
      status: 'normal',
      date: '2025-12-01',
    },
    {
      testName: 'Alpha-1 Antitrypsin',
      value: '125',
      unit: 'mg/dL',
      referenceRange: '100-200 mg/dL',
      status: 'normal',
      date: '2024-03-15',
    },
    {
      testName: 'BNP',
      value: '78',
      unit: 'pg/mL',
      referenceRange: '< 100 pg/mL',
      status: 'normal',
      date: '2025-12-01',
    },
    {
      testName: 'CRP (C-Reactive Protein)',
      value: '4.2',
      unit: 'mg/L',
      referenceRange: '< 3.0 mg/L',
      status: 'high',
      date: '2025-12-01',
    },
    {
      testName: 'ESR (Sed Rate)',
      value: '28',
      unit: 'mm/hr',
      referenceRange: '0-22 mm/hr',
      status: 'high',
      date: '2025-12-01',
    },
    {
      testName: 'Uric Acid',
      value: '7.8',
      unit: 'mg/dL',
      referenceRange: '3.4-7.0 mg/dL',
      status: 'high',
      date: '2025-12-01',
    },
    {
      testName: 'PSA (Prostate Specific Antigen)',
      value: '2.1',
      unit: 'ng/mL',
      referenceRange: '< 4.0 ng/mL',
      status: 'normal',
      date: '2025-12-01',
    },
  ],
  
  immunizations: [
    {
      vaccine: 'Influenza (High-Dose Flu Shot)',
      date: '2025-09-20',
      provider: 'Dr. Michael Brown',
      lotNumber: 'FLU2025-HD456',
      nextDue: '2026-09-01',
    },
    {
      vaccine: 'COVID-19 Booster (Updated)',
      date: '2025-10-05',
      provider: "Acme Health Pharmacy",
      lotNumber: 'COV2025-F789',
      nextDue: '2026-10-01',
    },
    {
      vaccine: 'Pneumococcal (Prevnar 20)',
      date: '2023-09-15',
      provider: 'Dr. Michael Brown',
      lotNumber: 'PCV20-G012',
    },
    {
      vaccine: 'Pneumococcal (Pneumovax 23)',
      date: '2024-09-20',
      provider: 'Dr. Michael Brown',
      lotNumber: 'PPSV23-H345',
    },
    {
      vaccine: 'Shingrix (Shingles) - Series Complete',
      date: '2022-05-10',
      provider: 'Dr. Michael Brown',
      lotNumber: 'SHIN-J678',
    },
  ],
  
  visits: [
    {
      date: '2026-01-15',
      type: 'office',
      provider: 'Dr. Michael Brown',
      reason: 'COPD management',
      diagnosis: ['J44.1 - COPD with acute exacerbation'],
      notes: 'Recent respiratory infection triggered mild exacerbation. Prednisone burst prescribed. O2 sat stable at 93% on room air. Continue inhalers.',
      followUp: '4 weeks',
    },
    {
      date: '2025-12-15',
      type: 'office',
      provider: 'Dr. Susan Taylor',
      reason: 'Arthritis follow-up',
      diagnosis: ['M19.90 - Primary osteoarthritis', 'M79.3 - Panniculitis'],
      notes: 'Knee and hip pain managed with Tylenol Arthritis. Physical therapy recommended. Discussed joint replacement options if conservative treatment fails.',
      followUp: '3 months',
    },
    {
      date: '2025-12-01',
      type: 'lab',
      provider: "Acme Health Lab Services",
      reason: 'Annual labs and inflammatory markers',
      notes: 'CRP and ESR mildly elevated consistent with arthritis. Uric acid elevated - monitor for gout.',
    },
    {
      date: '2025-10-10',
      type: 'office',
      provider: 'Dr. Michael Brown',
      reason: 'COPD quarterly follow-up',
      diagnosis: ['J44.9 - COPD, unspecified'],
      notes: 'Stable on current regimen. Spiriva and Breo effective. Encouraged smoking cessation maintenance.',
    },
    {
      date: '2025-08-20',
      type: 'telehealth',
      provider: 'Dr. Robert Klein (Urology)',
      reason: 'BPH follow-up',
      diagnosis: ['N40.0 - Benign prostatic hyperplasia'],
      notes: 'Flomax effective for urinary symptoms. PSA stable. No changes needed.',
    },
  ],
  
  procedures: [
    {
      name: 'Pulmonary Function Test (PFT)',
      date: '2025-06-15',
      provider: 'Dr. Michael Brown',
      facility: "Acme Health Pulmonary Center - Phoenix",
      notes: 'FEV1 58% predicted. Moderate obstruction. GOLD Stage 2 COPD confirmed.',
    },
    {
      name: 'Chest CT - Low Dose',
      date: '2025-03-10',
      provider: 'Dr. Michael Brown',
      facility: "Acme Health Imaging Center - Phoenix",
      notes: 'Emphysematous changes bilateral. No nodules or masses. No acute findings.',
    },
    {
      name: 'Knee X-Ray (Bilateral)',
      date: '2025-09-05',
      provider: 'Dr. Susan Taylor',
      facility: "Acme Health Imaging Center - Phoenix",
      notes: 'Moderate degenerative changes bilateral knees. Joint space narrowing. No fractures.',
    },
    {
      name: 'Colonoscopy - Screening',
      date: '2023-04-15',
      provider: 'Dr. David Lee',
      facility: "Acme Health Endoscopy Center",
      notes: 'Normal colonoscopy. No polyps. Repeat in 10 years.',
    },
  ],
  
  familyHistory: [
    {
      relation: 'Father',
      condition: 'COPD/Emphysema',
      ageOfOnset: '65',
      notes: 'Heavy smoker, deceased at 78',
    },
    {
      relation: 'Mother',
      condition: 'Osteoarthritis',
      ageOfOnset: '60',
      notes: 'Had knee replacement surgery',
    },
    {
      relation: 'Brother',
      condition: 'Type 2 Diabetes',
      ageOfOnset: '55',
    },
  ],
  
  socialHistory: {
    smokingStatus: 'Former smoker - quit 5 years ago (40 pack-year history)',
    alcoholUse: 'Occasional - 1-2 beers on weekends',
    exerciseFrequency: 'Limited due to COPD and arthritis - gentle stretching, short walks',
    occupation: 'Retired - former truck driver',
    livingSituation: 'Lives with wife, uses home oxygen at night PRN',
  },
  
  carePlan: {
    goals: [
      'Maintain oxygen saturation > 90% on room air',
      'Prevent COPD exacerbations',
      'Manage arthritis pain effectively',
      'Maintain mobility and independence',
      'Continue smoking cessation',
    ],
    recommendations: [
      'Continue Spiriva Respimat and Breo Ellipta daily',
      'Pulmonary rehabilitation program',
      'Use supplemental oxygen if O2 sat drops below 88%',
      'Tylenol Arthritis for pain as needed',
      'Physical therapy for joint mobility',
      'Flomax for BPH symptoms',
      'Annual flu shot, pneumonia vaccines up to date',
      'Avoid respiratory irritants and cold air',
    ],
    nextAppointments: [
      {
        date: '2026-02-12',
        type: 'COPD Follow-up',
        provider: 'Dr. Michael Brown',
      },
      {
        date: '2026-03-15',
        type: 'Rheumatology Consult',
        provider: 'Dr. Susan Taylor',
      },
      {
        date: '2026-06-15',
        type: 'Pulmonary Function Test',
        provider: 'Dr. Michael Brown',
      },
    ],
  },
};

// All patient medical records
const MOCK_MEDICAL_RECORDS: Map<string, FullMedicalRecord> = new Map([
  ['MEM-001', SARAH_JOHNSON_RECORD],
  ['MEM-002', ROBERT_MARTINEZ_RECORD],
  ['MEM-003', EMILY_CHEN_RECORD],
  ['MEM-004', JAMES_WILSON_RECORD],
]);

// =============================================================================
// TOOL IMPLEMENTATION
// =============================================================================

export interface MedicalRecordsResult {
  found: boolean;
  record?: FullMedicalRecord;
  summary?: string;
  message?: string;
}

export const getFullMedicalRecordsTool = createTool<
  {
    memberId: string;
    section?: 'all' | 'vitals' | 'labs' | 'immunizations' | 'visits' | 'procedures' | 'family_history' | 'care_plan';
  },
  MedicalRecordsResult
>({
  name: 'get_full_medical_records',
  description: `Retrieve comprehensive medical records for a verified member.
  REQUIRES MFA VERIFICATION FIRST - only call this after verify_mfa_code returns success.
  
  Can retrieve full records or specific sections:
  - all: Complete medical record
  - vitals: Recent vital signs history
  - labs: Laboratory test results
  - immunizations: Vaccination history
  - visits: Office/telehealth visit history
  - procedures: Imaging, screenings, and procedures
  - family_history: Family medical history
  - care_plan: Current care plan and recommendations`,
  category: 'patient',
  parameters: {
    type: 'object',
    properties: {
      memberId: {
        type: 'string',
        description: 'The verified member ID',
      },
      section: {
        type: 'string',
        enum: ['all', 'vitals', 'labs', 'immunizations', 'visits', 'procedures', 'family_history', 'care_plan'],
        description: 'Which section of the medical record to retrieve. Defaults to "all".',
      },
    },
    required: ['memberId'],
  },
  handler: async (args, context): Promise<ToolResult<MedicalRecordsResult>> => {
    const { memberId, section = 'all' } = args;
    const sessionId = context?.sessionId || 'default';

    // =========================================================================
    // CRITICAL: CHECK MFA VERIFICATION BEFORE RETURNING ANY PII
    // =========================================================================
    const mfaStatus = sessionCache.get<{ verified: boolean; canProceed: boolean }>(
      sessionId, 
      'mfa', 
      CacheKeys.mfaStatus(memberId)
    );
    
    if (!mfaStatus || !mfaStatus.verified || !mfaStatus.canProceed) {
      return {
        success: false,
        error: 'MFA verification required. For security, medical records can only be accessed after MFA verification. Please call send_mfa_code first to receive a verification code, then call verify_mfa_code with the code. The demo code is 123456.',
      };
    }
    // =========================================================================

    const cacheKey = CacheKeys.medicalRecords(memberId, section);

    // Check cache first for instant response
    const cachedRecords = sessionCache.get<MedicalRecordsResult>(
      sessionId, 
      'medical_records', 
      cacheKey
    );
    if (cachedRecords && cachedRecords.found) {
      console.log(`[Cache] Medical records HIT for ${memberId}/${section}`);
      return { success: true, data: cachedRecords };
    }

    await new Promise(resolve => setTimeout(resolve, 500));

    const record = MOCK_MEDICAL_RECORDS.get(memberId);

    if (!record) {
      return {
        success: true,
        data: {
          found: false,
          message: `Medical records for member ${memberId} are not available. Available demo patients: Sarah Johnson (MEM-001), Robert Martinez (MEM-002), Emily Chen (MEM-003), James Wilson (MEM-004).`,
        },
      };
    }

    // Generate summary based on section
    let summary = '';
    let filteredRecord: any = record;

    switch (section) {
      case 'vitals':
        filteredRecord = { memberId: record.memberId, vitalSigns: record.vitalSigns };
        const latestVitals = record.vitalSigns[0];
        summary = `Latest vitals (${latestVitals.date}): BP ${latestVitals.bloodPressure}, HR ${latestVitals.heartRate}, Weight ${latestVitals.weight}, BMI ${latestVitals.bmi}`;
        break;
      case 'labs':
        filteredRecord = { memberId: record.memberId, labResults: record.labResults };
        const abnormalLabs = record.labResults.filter(l => l.status !== 'normal');
        summary = `${record.labResults.length} lab results on file. ${abnormalLabs.length} results outside normal range: ${abnormalLabs.map(l => l.testName).join(', ')}`;
        break;
      case 'immunizations':
        filteredRecord = { memberId: record.memberId, immunizations: record.immunizations };
        summary = `${record.immunizations.length} immunizations on record. Most recent: ${record.immunizations[0].vaccine} on ${record.immunizations[0].date}`;
        break;
      case 'visits':
        filteredRecord = { memberId: record.memberId, visits: record.visits };
        summary = `${record.visits.length} visits in the past year. Last visit: ${record.visits[0].date} - ${record.visits[0].reason}`;
        break;
      case 'procedures':
        filteredRecord = { memberId: record.memberId, procedures: record.procedures };
        summary = `${record.procedures.length} procedures on record. Most recent: ${record.procedures[0].name} on ${record.procedures[0].date}`;
        break;
      case 'family_history':
        filteredRecord = { memberId: record.memberId, familyHistory: record.familyHistory };
        summary = `Family history includes: ${record.familyHistory.map(f => `${f.relation}: ${f.condition}`).join('; ')}`;
        break;
      case 'care_plan':
        filteredRecord = { memberId: record.memberId, carePlan: record.carePlan };
        summary = `${record.carePlan.goals.length} health goals. Next appointment: ${record.carePlan.nextAppointments[0].date} - ${record.carePlan.nextAppointments[0].type}`;
        break;
      default:
        summary = `Complete medical record retrieved. Last updated: ${record.lastUpdated}. Includes vital signs, lab results, immunizations, visit history, procedures, family history, and care plan.`;
    }

    const result: MedicalRecordsResult = {
      found: true,
      record: filteredRecord,
      summary,
    };

    // Cache the result for fast subsequent access
    sessionCache.set(sessionId, 'medical_records', cacheKey, result);

    return { success: true, data: result };
  },
  isMocked: true,
  version: '1.0.0',
});

// =============================================================================
// SCHEDULE APPOINTMENT TOOL
// =============================================================================

export interface AppointmentResult {
  scheduled: boolean;
  appointmentId?: string;
  date?: string;
  time?: string;
  provider?: string;
  type?: string;
  confirmationMessage?: string;
  message?: string;
}

// =============================================================================
// GET APPOINTMENT SLOTS TOOL
// Returns multiple openings the caller can choose from. Use BEFORE
// schedule_appointment when the caller wants to pick a time.
// =============================================================================

export interface SlotOption {
  slotId: string;
  date: string;       // YYYY-MM-DD
  time: string;       // human-friendly e.g. "10:00 AM"
  provider: string;
  facility: string;
  modality: 'telehealth' | 'in-person';
  durationMinutes: number;
}

export interface AppointmentSlotsResult {
  found: boolean;
  slots?: SlotOption[];
  message?: string;
}

export const getAppointmentSlotsTool = createTool<
  {
    appointmentType: string;
    modality?: 'telehealth' | 'in-person' | 'either';
    preferredDate?: string;
    preferredTimeOfDay?: 'morning' | 'afternoon' | 'evening';
    provider?: string;
    limit?: number;
  },
  AppointmentSlotsResult
>({
  name: 'get_appointment_slots',
  description: `Return a list of available appointment slots so the caller can pick.
  ALWAYS use this BEFORE schedule_appointment when the caller asks "what times
  are available", "give me options", "pick a slot", or doesn't accept the first
  time offered. Returns up to 6 slots, sorted soonest first.`,
  category: 'patient',
  parameters: {
    type: 'object',
    properties: {
      appointmentType: {
        type: 'string',
        description: 'Type of appointment (e.g., "primary care", "telehealth", "urgent care", "specialist", "lab work")',
      },
      modality: {
        type: 'string',
        enum: ['telehealth', 'in-person', 'either'],
        description: 'Preferred visit modality. Defaults to "either".',
      },
      preferredDate: {
        type: 'string',
        description: 'Earliest acceptable date in YYYY-MM-DD format. Defaults to today.',
      },
      preferredTimeOfDay: {
        type: 'string',
        enum: ['morning', 'afternoon', 'evening'],
        description: 'Filter to a time band.',
      },
      provider: {
        type: 'string',
        description: 'Specific provider name to filter by, if requested.',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of slots to return (default: 6, max: 10).',
      },
    },
    required: ['appointmentType'],
  },
  handler: async (args, context): Promise<ToolResult<AppointmentSlotsResult>> => {
    await new Promise(resolve => setTimeout(resolve, 400));

    const {
      appointmentType,
      modality = 'either',
      preferredDate,
      preferredTimeOfDay,
      provider,
      limit = 6,
    } = args;

    const baseDate = preferredDate ? new Date(preferredDate) : new Date();
    if (isNaN(baseDate.getTime())) {
      baseDate.setTime(Date.now());
    }

    // Roster of mock providers/facilities to spread slots across.
    const roster = [
      { provider: 'Dr. Patricia Williams', facility: 'Acme Health — Chesterfield', modality: 'in-person' as const },
      { provider: 'Dr. Patricia Williams', facility: 'Acme Health Telehealth', modality: 'telehealth' as const },
      { provider: 'Dr. James Thompson', facility: 'Acme Health — Creve Coeur', modality: 'in-person' as const },
      { provider: 'Dr. Sarah Kim', facility: 'Acme Heart & Vascular Center', modality: 'in-person' as const },
      { provider: 'Dr. Amanda Foster', facility: 'Acme Health Telehealth', modality: 'telehealth' as const },
      { provider: 'Dr. Jennifer Lee', facility: 'Acme Health — The Woodlands', modality: 'in-person' as const },
      { provider: 'Urgent Care Team', facility: 'Acme Urgent Care — Stroudsburg', modality: 'in-person' as const },
      { provider: 'Telehealth On-Demand', facility: 'Acme Health Telehealth', modality: 'telehealth' as const },
    ];

    // Time templates by band.
    const timesByBand: Record<string, string[]> = {
      morning: ['8:30 AM', '9:15 AM', '10:00 AM', '11:00 AM', '11:45 AM'],
      afternoon: ['12:30 PM', '1:15 PM', '2:00 PM', '2:45 PM', '3:30 PM'],
      evening: ['4:15 PM', '5:00 PM', '5:45 PM', '6:30 PM'],
    };
    const allTimes = [
      ...timesByBand.morning,
      ...timesByBand.afternoon,
      ...timesByBand.evening,
    ];

    const wantTimes = preferredTimeOfDay ? timesByBand[preferredTimeOfDay] : allTimes;

    const isWeekday = (d: Date) => d.getDay() !== 0 && d.getDay() !== 6;

    const slots: SlotOption[] = [];
    const cursor = new Date(baseDate);

    // Walk forward day by day, emitting matching slots until we hit the limit.
    let dayCounter = 0;
    while (slots.length < limit && dayCounter < 14) {
      if (isWeekday(cursor)) {
        const dateStr = cursor.toISOString().split('T')[0]!;
        for (const time of wantTimes) {
          if (slots.length >= limit) break;
          const slotProvider = roster[(slots.length + dayCounter) % roster.length]!;
          // Apply modality filter
          if (modality !== 'either' && slotProvider.modality !== modality) continue;
          // Apply provider filter (loose substring match)
          if (provider && !slotProvider.provider.toLowerCase().includes(provider.toLowerCase())) continue;
          slots.push({
            slotId: `SLOT-${dateStr.replace(/-/g, '')}-${time.replace(/[: ]/g, '')}`,
            date: dateStr,
            time,
            provider: slotProvider.provider,
            facility: slotProvider.facility,
            modality: slotProvider.modality,
            durationMinutes: appointmentType.toLowerCase().includes('telehealth') ? 20 : 30,
          });
        }
      }
      cursor.setDate(cursor.getDate() + 1);
      dayCounter += 1;
    }

    if (slots.length === 0) {
      return {
        success: true,
        data: {
          found: false,
          message: 'No matching slots in the next two weeks. Try a different modality or remove the time-of-day filter.',
        },
      };
    }

    return {
      success: true,
      data: { found: true, slots },
    };
  },
  isMocked: true,
  version: '1.0.0',
});

export const scheduleAppointmentTool = createTool<
  {
    memberId: string;
    appointmentType: string;
    preferredDate?: string;
    preferredTime?: 'morning' | 'afternoon' | 'evening';
    provider?: string;
    reason: string;
  },
  AppointmentResult
>({
  name: 'schedule_appointment',
  description: `Schedule a medical appointment for a verified member.
  REQUIRES MFA VERIFICATION FIRST for new appointments.
  
  Can schedule various appointment types:
  - Primary care visit
  - Specialist referral
  - Lab work
  - Telehealth consultation
  - Follow-up appointment
  - Annual wellness visit`,
  category: 'patient',
  parameters: {
    type: 'object',
    properties: {
      memberId: {
        type: 'string',
        description: 'The verified member ID',
      },
      appointmentType: {
        type: 'string',
        description: 'Type of appointment (e.g., "primary care", "lab work", "telehealth", "specialist")',
      },
      preferredDate: {
        type: 'string',
        description: 'Preferred date in YYYY-MM-DD format',
      },
      preferredTime: {
        type: 'string',
        enum: ['morning', 'afternoon', 'evening'],
        description: 'Preferred time of day',
      },
      provider: {
        type: 'string',
        description: 'Specific provider if requested',
      },
      reason: {
        type: 'string',
        description: 'Reason for the appointment',
      },
    },
    required: ['memberId', 'appointmentType', 'reason'],
  },
  handler: async (args, context): Promise<ToolResult<AppointmentResult>> => {
    await new Promise(resolve => setTimeout(resolve, 800));

    const { memberId, appointmentType, preferredDate, preferredTime, provider, reason } = args;

    // Generate mock appointment
    const appointmentId = `APT-${Date.now().toString().slice(-8)}`;
    
    // Calculate appointment date (next available based on preference)
    const today = new Date();
    let aptDate = preferredDate ? new Date(preferredDate) : new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    // Ensure it's a weekday
    while (aptDate.getDay() === 0 || aptDate.getDay() === 6) {
      aptDate.setDate(aptDate.getDate() + 1);
    }
    
    const dateStr = aptDate.toISOString().split('T')[0];
    
    // Set time based on preference
    let timeStr = '10:00 AM';
    if (preferredTime === 'afternoon') timeStr = '2:00 PM';
    if (preferredTime === 'evening') timeStr = '4:30 PM';

    const assignedProvider = provider || 'Dr. Patricia Williams';

    return {
      success: true,
      data: {
        scheduled: true,
        appointmentId,
        date: dateStr,
        time: timeStr,
        provider: assignedProvider,
        type: appointmentType,
        confirmationMessage: `Appointment scheduled successfully! 
        
📅 Appointment Details:
- Confirmation #: ${appointmentId}
- Date: ${dateStr}
- Time: ${timeStr}
- Provider: ${assignedProvider}
- Type: ${appointmentType}
- Reason: ${reason}

A confirmation has been sent to the phone number on file. Please arrive 15 minutes early and bring your insurance card and photo ID.`,
      },
    };
  },
  isMocked: true,
  version: '1.0.0',
});
