/**
 * Acme Health - Tool Index
 * 
 * Exports all tools and registers them with the tool registry.
 */

import { toolRegistry } from './registry.js';
import { verifyMemberIdentityTool } from './verify-member-identity.js';
import { lookupPrescriptionsTool } from './lookup-prescriptions.js';
import { calculateMedicationPriceTool } from './calculate-medication-price.js';
import { findInNetworkProvidersTool } from './find-in-network-providers.js';
import { transferPrescriptionTool } from './transfer-prescription.js';
import { requestRefillTool } from './request-refill.js';
import { retrievePatientContextTool } from './retrieve-patient-context.js';
import { logActionAuditEventTool } from './log-action-audit-event.js';
import { sendMFACodeTool, verifyMFACodeTool } from './send-mfa-verification.js';
import { getFullMedicalRecordsTool, scheduleAppointmentTool, getAppointmentSlotsTool } from './medical-records.js';
import { searchAcmeKnowledgeTool } from './search-acme-knowledge.js';
import { logger } from '../utils/logger.js';

// Export individual tools
export {
  verifyMemberIdentityTool,
  lookupPrescriptionsTool,
  calculateMedicationPriceTool,
  findInNetworkProvidersTool,
  transferPrescriptionTool,
  requestRefillTool,
  retrievePatientContextTool,
  logActionAuditEventTool,
  sendMFACodeTool,
  verifyMFACodeTool,
  getFullMedicalRecordsTool,
  scheduleAppointmentTool,
  getAppointmentSlotsTool,
  searchAcmeKnowledgeTool,
};

// Export registry
export { toolRegistry, createTool } from './registry.js';

/**
 * Register all tools with the registry
 * Call this during application startup
 */
export function registerAllTools(): void {
  const tools = [
    verifyMemberIdentityTool,
    lookupPrescriptionsTool,
    calculateMedicationPriceTool,
    findInNetworkProvidersTool,
    transferPrescriptionTool,
    requestRefillTool,
    retrievePatientContextTool,
    logActionAuditEventTool,
    sendMFACodeTool,
    verifyMFACodeTool,
    getFullMedicalRecordsTool,
    scheduleAppointmentTool,
    getAppointmentSlotsTool,
    searchAcmeKnowledgeTool,
  ];

  for (const tool of tools) {
    toolRegistry.register(tool);
  }

  logger.info(`Registered ${tools.length} tools with the registry`, {
    tools: tools.map(t => t.definition.name),
  });
}

/**
 * Get tool definitions formatted for OpenAI Realtime API
 * Note: Realtime API uses a flat structure with type and name/description/parameters at root level
 */
export function getOpenAIToolDefinitions(): Array<{
  type: 'function';
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}> {
  return toolRegistry.getEnabledDefinitions().map(def => ({
    type: 'function' as const,
    name: def.name,
    description: def.description,
    parameters: def.parameters,
  }));
}
