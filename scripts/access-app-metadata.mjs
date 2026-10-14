import app from '../access-app.config.json' with { type: 'json' };

export function accessAppMetadata(config) {
  const origin = new URL(config.publicAppUrl).origin;
  return { schema: app.schema, name: app.name, protocol: app.protocol,
    origin, rpId: new URL(origin).hostname, manifestUrl: `${origin}${app.manifestPath}`,
    deviceApiUrl: `${origin}${app.deviceApiPath}`, proofHeader: app.proofHeader,
    challengeLifetimeSeconds: app.challengeLifetimeSeconds, userVerification: app.userVerification,
    credentialPolicy: app.credentialPolicy, approvalAuthority: app.approvalAuthority,
    bodyBinding: app.bodyBinding, implementation: app.implementation,
    operatorJudgeCompatibility: app.operatorJudgeCompatibility };
}
