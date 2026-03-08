const { getAvailablePresets, buildAuthConfig } = require("../presets");
const {
  clone,
  createAccountModel,
  createAuthModel,
  createBlankWorkflow,
  createWorkflowStep,
  normalizeWorkflow,
} = require("./model");

const WORKFLOW_TEMPLATES = [
  {
    id: "easy_api_accounts",
    label: "账号密码签到（最稳）",
    summary: "邮箱密码登录 + 签到 + 心跳，适合大多数新手首跑。",
    fitFor: "大部分网页测试网、积分站、签到站",
    difficulty: "low",
    projectName: "easy-api-checkin",
    accountSource: "accounts",
    accountFields: ["email", "password"],
    authMode: "request",
    concurrency: 1,
    useProxy: false,
    repeat: false,
    intervalMinutes: 60,
    presetIds: ["api_checkin", "api_heartbeat"],
  },
  {
    id: "easy_token_keepalive",
    label: "Token 保活（最省事）",
    summary: "已有 token 直接跑任务，最少配置。",
    fitFor: "扩展插件保活、挂机积分、已拿到 token 的项目",
    difficulty: "low",
    projectName: "easy-token-keepalive",
    accountSource: "tokens",
    accountFields: [],
    authMode: "account_token",
    concurrency: 1,
    useProxy: false,
    repeat: false,
    intervalMinutes: 60,
    presetIds: ["api_heartbeat", "api_checkin"],
  },
  {
    id: "easy_evm_daily",
    label: "EVM 钱包日常任务",
    summary: "私钥模式，适合测试网签到、领水、链上交互。",
    fitFor: "钱包签名登录、链上交互、领水、合约调用",
    difficulty: "medium",
    projectName: "easy-evm-daily",
    accountSource: "privateKeys",
    accountFields: [],
    authMode: "evm_sign",
    concurrency: 1,
    useProxy: false,
    repeat: false,
    intervalMinutes: 60,
    presetIds: ["api_checkin", "api_faucet", "contract_call", "wait_step"],
  },
  {
    id: "easy_claim_rewards",
    label: "列表奖励领取",
    summary: "先拉任务列表，再自动领取未 claim 项。",
    fitFor: "任务中心、reward 页面、待领取积分/徽章/奖励",
    difficulty: "low",
    projectName: "easy-claim-rewards",
    accountSource: "tokens",
    accountFields: [],
    authMode: "account_token",
    concurrency: 1,
    useProxy: false,
    repeat: false,
    intervalMinutes: 60,
    presetIds: ["api_claim_list", "api_heartbeat"],
  },
  {
    id: "easy_batch_submit",
    label: "批量任务提交",
    summary: "任务参数写进文本文件，脚本逐行提交。",
    fitFor: "quiz、答题、内容链接、邀请码、任务 ID 批量上报",
    difficulty: "medium",
    projectName: "easy-batch-submit",
    accountSource: "accounts",
    accountFields: ["email", "password"],
    authMode: "request",
    concurrency: 1,
    useProxy: false,
    repeat: false,
    intervalMinutes: 60,
    presetIds: ["api_request", "api_batch_submit", "wait_step"],
  },
  {
    id: "easy_chain_combo",
    label: "链上综合日常",
    summary: "领水 + 合约调用 + 原生转账，适合大多数 EVM 测试网日常。",
    fitFor: "领水、mint、claim、转账活跃、链上交互",
    difficulty: "medium",
    projectName: "easy-chain-combo",
    accountSource: "privateKeys",
    accountFields: [],
    authMode: "none",
    concurrency: 1,
    useProxy: false,
    repeat: false,
    intervalMinutes: 60,
    presetIds: ["api_faucet", "contract_call", "native_transfer", "wait_step"],
  },
];

function listWorkflowTemplates() {
  return WORKFLOW_TEMPLATES.map((template) => ({
    id: template.id,
    label: template.label,
    summary: template.summary,
    fitFor: template.fitFor,
    difficulty: template.difficulty,
    projectName: template.projectName,
    accountSource: template.accountSource,
    authMode: template.authMode,
    presetIds: clone(template.presetIds),
  }));
}

function getTemplateById(templateId) {
  return WORKFLOW_TEMPLATES.find((template) => template.id === templateId) || null;
}

function createWorkflowFromTemplate(templateId, overrides = {}) {
  const template = getTemplateById(templateId);
  if (!template) {
    throw new Error(`找不到模板: ${templateId}`);
  }

  const projectName = String(overrides.projectName || template.projectName || template.label);
  const workflow = createBlankWorkflow({
    projectName,
    sourceKind: "template",
  });
  const accountFields = template.accountFields || [];
  const accountSource = template.accountSource || "accounts";
  const authMode = template.authMode || "none";

  workflow.meta.sourceMaterial = {
    kind: "template",
    templateId: template.id,
    templateLabel: template.label,
    summary: template.summary,
  };
  workflow.project = {
    ...workflow.project,
    name: projectName,
    concurrency: Number(template.concurrency || 1),
    useProxy: Boolean(template.useProxy),
    repeat: Boolean(template.repeat),
    intervalMinutes: Number(template.intervalMinutes || 60),
  };
  workflow.account = createAccountModel(accountSource, accountFields);
  workflow.auth = createAuthModel({
    accountSource,
    accountFields,
    mode: authMode,
    source: "template",
    config:
      authMode === "none"
        ? null
        : buildAuthConfig({
            authMode,
            accountSource,
            accountFields,
          }),
  });

  const availablePresets = getAvailablePresets({ accountSource });
  const selectedPresets = availablePresets.filter((preset) => template.presetIds.includes(preset.id));
  workflow.steps = selectedPresets.map((preset) => {
    const task = preset.build({
      authMode,
      accountSource,
      accountFields,
    });

    return createWorkflowStep({
      type: task.type,
      title: preset.label,
      source: "template",
      config: task,
      metadata: {
        presetId: preset.id,
        presetLabel: preset.label,
        presetSummary: preset.summary,
      },
    });
  });

  return normalizeWorkflow(workflow);
}

module.exports = {
  WORKFLOW_TEMPLATES,
  listWorkflowTemplates,
  getTemplateById,
  createWorkflowFromTemplate,
};
