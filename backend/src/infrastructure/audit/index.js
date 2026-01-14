/**
 * Audit Infrastructure - Public API for audit and logging.
 * @module infrastructure/audit
 */

'use strict';

const hallucinationLogger = require('./hallucination-logger');

module.exports = {
    HallucinationAudit: hallucinationLogger.HallucinationAudit,
    AuditLogger: hallucinationLogger.AuditLogger,
    MetricsCollector: hallucinationLogger.MetricsCollector,
    IncidentTracker: hallucinationLogger.IncidentTracker,
    getAuditInstance: hallucinationLogger.getAuditInstance,
    AUDIT_CONFIG: hallucinationLogger.AUDIT_CONFIG,
};
