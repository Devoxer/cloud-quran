const { withXcodeProject } = require("expo/config-plugins");

module.exports = function withAutoSigning(config) {
  return withXcodeProject(config, (config) => {
    const project = config.modResults;
    const targetId = project.getFirstTarget().uuid;

    project.addTargetAttribute("ProvisioningStyle", "Automatic", targetId);
    project.addTargetAttribute("DevelopmentTeam", "MA2HBUUNVP", targetId);

    return config;
  });
};
