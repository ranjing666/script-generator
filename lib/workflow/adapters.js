const {
  clone,
  createAccountModel,
  createAdapterModel,
  createAnalysisModel,
  createAuthModel,
  createBlankWorkflow,
  createReviewModel,
  createRuntimeModel,
  createWorkflowStep,
  normalizeWorkflow,
  slugify,
} = require("./model");

function unique(list) {
  return [...new Set((list || []).filter(Boolean))];
}

function toProjectName(urlInfo) {
  const host = String(urlInfo && urlInfo.host || "").replace(/^www\./, "");
  return slugify(host || "url-workflow") || "url-workflow";
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function sliceList(list, count = 6) {
  return Array.isArray(list) ? list.filter(Boolean).slice(0, count) : [];
}

function createBaseUrlWorkflow(context, adapterInfo, options = {}) {
  const workflow = createBlankWorkflow({
    projectName: options.projectName || toProjectName(context.urlInfo),
    sourceKind: "url",
  });

  workflow.meta.sourceMaterial = {
    kind: "url",
    sourceUrl: context.sourceUrl,
    title: context.artifact.title,
    fetchMode: context.artifact.fetchMode,
    fetchedAt: context.artifact.fetchedAt,
    warnings: clone(context.analysis.warnings || []),
    confidence: clone(context.analysis.confidence || {}),
  };
  workflow.analysis = createAnalysisModel({
    ...context.analysis,
    sourceType: "url",
    sourceUrl: context.sourceUrl,
    title: context.artifact.title,
    fetchMode: context.artifact.fetchMode,
    fetchedAt: context.artifact.fetchedAt,
  });
  workflow.runtime = createRuntimeModel({
    identityPriority: context.signals.hasWallet || context.signals.hasSolana
      ? ["browserSession", "localAccount"]
      : ["localAccount", "browserSession"],
    browser: {
      reuseSession: true,
      preferredProfile: context.settings.browser.preferredProfile,
      automationMode: context.settings.browser.automationMode,
    },
    captcha: {
      provider: context.settings.captcha.provider,
      allowManualFallback: true,
    },
  });
  workflow.review = createReviewModel({
    status: context.analysis.confidence.score >= 75 ? "approved" : "needs_review",
    requiresHumanReview:
      context.analysis.confidence.score < 75
      || context.signals.hasCaptcha
      || context.signals.hasDynamicEncryption,
    reasons: unique([
      ...(context.signals.hasCaptcha ? ["站点检测到验证码，建议先人工确认或配置验证码服务。"] : []),
      ...(context.signals.hasDynamicEncryption ? ["页面疑似使用前端加密或动态签名参数，需要人工复核。"] : []),
      ...(context.analysis.confidence.score < 75 ? ["自动识别置信度不足，建议先检查步骤和来源材料。"] : []),
    ]),
  });
  workflow.adapter = createAdapterModel(adapterInfo);
  workflow.artifacts = {
    ...workflow.artifacts,
    htmlSnapshotPath: context.artifact.htmlSnapshotPath || "",
    networkLogPath: context.artifact.networkLogPath || "",
    tracePath: context.artifact.tracePath || "",
  };

  return workflow;
}

function makeRequestPlaceholder(url, name, note) {
  return {
    type: "request",
    name,
    method: "POST",
    url,
    headers: {
      "Content-Type": "application/json",
    },
    body: {},
    notes: note ? [note] : [],
  };
}

function makeBrowserOpenStep(url, title, source = "import") {
  return createWorkflowStep({
    type: "browserAction",
    title: title || "打开任务页面",
    source,
    config: {
      type: "browserAction",
      name: "browser_open_task_page",
      url,
      action: "open",
      selector: "",
      inputValue: "",
      waitFor: "networkidle",
      captureNetwork: true,
      notes: ["应用内运行会优先复用浏览器会话。"],
    },
  });
}

function makeBrowserExtractStep(url, selectors, notes) {
  return createWorkflowStep({
    type: "browserExtract",
    title: "提取页面上下文",
    source: "import",
    config: {
      type: "browserExtract",
      name: "extract_page_context",
      url,
      selectors: selectors && selectors.length > 0 ? selectors : ["button", "form", "input"],
      saveToState: {
        "browser.pageTitle": "page.title",
      },
      extractNetwork: true,
      extractStorage: true,
      notes: Array.isArray(notes) ? notes : [],
    },
  });
}

function makeCaptchaStep(url) {
  return createWorkflowStep({
    type: "captchaSolve",
    title: "验证码处理",
    source: "import",
    config: {
      type: "captchaSolve",
      name: "solve_site_captcha",
      provider: "capsolver",
      captchaType: "auto",
      siteKey: "",
      pageUrl: url,
      timeoutMs: 120000,
      manualFallback: true,
      notes: ["优先调用验证码服务，失败后暂停等待人工处理。"],
    },
  });
}

function makeWalletStep(url, chain, provider) {
  return createWorkflowStep({
    type: "walletConnect",
    title: chain === "solana" ? "连接 Solana 钱包" : "连接 EVM 钱包",
    source: "import",
    config: {
      type: "walletConnect",
      name: chain === "solana" ? "connect_solana_wallet" : "connect_evm_wallet",
      chain,
      walletType: "browser_extension",
      provider,
      pageUrl: url,
      strategy: "browserSessionFirst",
      notes: ["优先复用浏览器扩展会话，失败时再回退到工具内账号。"],
    },
  });
}

function makeSolanaSignStep(url, provider) {
  return createWorkflowStep({
    type: "solanaSign",
    title: "Solana 消息签名",
    source: "import",
    config: {
      type: "solanaSign",
      name: "solana_sign_in",
      pageUrl: url,
      walletProvider: provider || "phantom",
      message: "Sign in to continue",
      saveSignatureTo: "state.solana.signature",
      notes: ["这是自动草案，生成后请检查真实签名消息。"],
    },
  });
}

function makeContentUploadStep(url, contentType) {
  return createWorkflowStep({
    type: "contentUpload",
    title: "上传内容任务",
    source: "import",
    config: {
      type: "contentUpload",
      name: "upload_project_content",
      pageUrl: url,
      contentType: contentType || "dataset_url",
      sourceField: "contentUrl",
      targetSelector: "",
      payload: {
        url: "{{account.contentUrl}}",
      },
      notes: ["适合 HuggingFace 链接、内容链接、模型/数据集提交通道。"],
    },
  });
}

function buildSignalsContext(context) {
  return {
    url: context.sourceUrl,
    title: context.artifact.title,
    buttons: context.artifact.buttons,
    forms: context.artifact.forms,
    headings: context.artifact.headings,
    signals: context.signals,
    warnings: context.analysis.warnings,
    confidence: context.analysis.confidence,
  };
}

function genericWebAdapter() {
  return {
    id: "generic-web",
    label: "通用网页适配器",
    match(context) {
      return context.signals.hasAnyInteractive ? 58 : 40;
    },
    analyze(context) {
      return buildSignalsContext(context);
    },
    compile(context) {
      const workflow = createBaseUrlWorkflow(context, {
        id: "generic-web",
        label: "通用网页适配器",
        confidence: 58,
        matchReason: "站点至少包含可识别的按钮、表单或任务入口。",
      });

      workflow.account = createAccountModel("accounts", ["email", "password"]);
      workflow.auth = createAuthModel({
        accountSource: "accounts",
        accountFields: ["email", "password"],
        mode: "none",
        source: "url-analysis",
      });
      workflow.steps = [
        makeBrowserOpenStep(context.sourceUrl, "打开官网任务页", "import"),
        makeBrowserExtractStep(
          context.sourceUrl,
          unique([...(context.artifact.forms || []), ...(context.artifact.buttons || [])]).slice(0, 4),
          ["先采集页面/表单/按钮线索，再决定是否补成 API 或链上任务。"]
        ),
      ];

      if (context.signals.hasCaptcha) {
        workflow.steps.push(makeCaptchaStep(context.sourceUrl));
      }

      return normalizeWorkflow(workflow);
    },
    diagnose(context) {
      return context.analysis.confidence.score < 60
        ? ["当前站点只命中了通用网页适配器，建议人工检查步骤是否足够。"]
        : [];
    },
  };
}

function genericEvmAdapter() {
  return {
    id: "generic-evm",
    label: "通用 EVM 适配器",
    match(context) {
      let score = 30;
      if (context.signals.hasWallet) {
        score += 25;
      }
      if (context.signals.hasClaim) {
        score += 8;
      }
      if (context.signals.hasFaucet) {
        score += 10;
      }
      return score;
    },
    analyze(context) {
      return buildSignalsContext(context);
    },
    compile(context) {
      const workflow = createBaseUrlWorkflow(context, {
        id: "generic-evm",
        label: "通用 EVM 适配器",
        confidence: 82,
        matchReason: "识别到 connect wallet / MetaMask / claim / faucet 等 EVM 站点特征。",
      });

      workflow.account = createAccountModel("privateKeys");
      workflow.auth = createAuthModel({
        accountSource: "privateKeys",
        mode: "none",
        source: "url-analysis",
      });
      workflow.steps = [
        makeBrowserOpenStep(context.sourceUrl, "打开 EVM 任务页", "import"),
        makeWalletStep(context.sourceUrl, "evm", context.settings.wallet.evmProvider || "metamask"),
        makeBrowserExtractStep(context.sourceUrl, sliceList(context.artifact.buttons, 4), [
          "提取前端动态参数、页面按钮和网络请求线索。",
        ]),
      ];

      if (context.signals.hasFaucet) {
        workflow.steps.push(
          createWorkflowStep({
            type: "request",
            title: "水龙头接口草案",
            source: "import",
            config: {
              ...makeRequestPlaceholder(context.sourceUrl, "claim_faucet_placeholder", "请把 URL 改成真实 faucet API，再补充 body。"),
              body: {
                wallet: "{{account.address}}",
              },
            },
          })
        );
      }

      if (context.signals.hasClaim) {
        workflow.steps.push(
          createWorkflowStep({
            type: "contractWrite",
            title: "链上 Claim 草案",
            source: "import",
            config: {
              type: "contractWrite",
              name: "claim_or_mint_placeholder",
              contractAddress: "0x0000000000000000000000000000000000000000",
              abi: ["function claim() external"],
              method: "claim",
              args: [],
              gasLimit: "300000",
              notes: ["自动识别到钱包任务，但未识别到真实合约地址，请手工补齐。"],
            },
          })
        );
      }

      if (context.signals.hasCaptcha) {
        workflow.steps.push(makeCaptchaStep(context.sourceUrl));
      }

      return normalizeWorkflow(workflow);
    },
    diagnose(context) {
      return unique([
        ...(context.signals.hasDynamicEncryption ? ["页面疑似存在前端签名参数，建议抓一次网络请求辅助校准。"] : []),
        ...(context.signals.hasCaptcha ? ["EVM 站点包含验证码步骤，建议先配置验证码服务。"] : []),
      ]);
    },
  };
}

function genericSolanaAdapter() {
  return {
    id: "generic-solana",
    label: "通用 Solana 适配器",
    match(context) {
      let score = context.signals.hasSolana ? 70 : 20;
      if (context.signals.hasWallet) {
        score += 8;
      }
      return score;
    },
    analyze(context) {
      return buildSignalsContext(context);
    },
    compile(context) {
      const workflow = createBaseUrlWorkflow(context, {
        id: "generic-solana",
        label: "通用 Solana 适配器",
        confidence: 78,
        matchReason: "识别到 Solana / Phantom / wallet-adapter 等关键词。",
      });

      workflow.account = createAccountModel("privateKeys");
      workflow.steps = [
        makeBrowserOpenStep(context.sourceUrl, "打开 Solana 任务页", "import"),
        makeWalletStep(context.sourceUrl, "solana", context.settings.wallet.solanaProvider || "phantom"),
        makeSolanaSignStep(context.sourceUrl, context.settings.wallet.solanaProvider || "phantom"),
      ];

      return normalizeWorkflow(workflow);
    },
    diagnose(context) {
      return context.signals.hasCaptcha ? ["Solana 站点同时包含验证码，建议保留人工兜底。"] : [];
    },
  };
}

function contentUploadAdapter() {
  return {
    id: "content-upload",
    label: "内容上传适配器",
    match(context) {
      let score = context.signals.hasUpload ? 72 : 18;
      if (context.signals.hasLogin) {
        score += 6;
      }
      return score;
    },
    analyze(context) {
      return buildSignalsContext(context);
    },
    compile(context) {
      const workflow = createBaseUrlWorkflow(context, {
        id: "content-upload",
        label: "内容上传适配器",
        confidence: 80,
        matchReason: "识别到 upload/model/dataset/HuggingFace 等内容提交线索。",
      });

      workflow.account = createAccountModel("accounts", ["email", "password", "contentUrl"]);
      workflow.steps = [
        makeBrowserOpenStep(context.sourceUrl, "打开上传任务页", "import"),
        makeContentUploadStep(context.sourceUrl, "dataset_url"),
      ];

      if (context.signals.hasCaptcha) {
        workflow.steps.push(makeCaptchaStep(context.sourceUrl));
      }

      return normalizeWorkflow(workflow);
    },
    diagnose(context) {
      return context.analysis.confidence.score < 75
        ? ["内容上传站点识别不够完整，建议先检查字段名和登录方式。"] : [];
    },
  };
}

function claimCenterAdapter() {
  return {
    id: "claim-center",
    label: "奖励中心适配器",
    match(context) {
      let score = context.signals.hasClaim ? 74 : 22;
      if (context.signals.hasQuestWords) {
        score += 6;
      }
      return score;
    },
    analyze(context) {
      return buildSignalsContext(context);
    },
    compile(context) {
      const workflow = createBaseUrlWorkflow(context, {
        id: "claim-center",
        label: "奖励中心适配器",
        confidence: 76,
        matchReason: "识别到 claim/reward/quest/mission 等任务中心线索。",
      });

      workflow.steps = [
        makeBrowserOpenStep(context.sourceUrl, "打开奖励中心", "import"),
        makeBrowserExtractStep(context.sourceUrl, sliceList(context.artifact.buttons, 6), [
          "先提取任务列表，再决定是否切成 claimList 或 request。",
        ]),
        createWorkflowStep({
          type: "claimList",
          title: "列表领取草案",
          source: "import",
          config: {
            type: "claimList",
            name: "claim_rewards_placeholder",
            listRequest: {
              method: "GET",
              url: "https://example.com/api/tasks",
              headers: {},
            },
            itemsPath: "data.items",
            filter: {
              field: "claimed",
              equals: false,
            },
            claimRequest: {
              method: "POST",
              url: "https://example.com/api/tasks/{{item.id}}/claim",
              headers: {},
              body: {},
            },
            notes: ["当前是奖励中心草案，请结合浏览器提取结果补成真实接口。"],
          },
        }),
      ];

      return normalizeWorkflow(workflow);
    },
    diagnose() {
      return ["列表领取草案默认只提供骨架，生成后请把 itemsPath 和 claim URL 改成真实值。"];
    },
  };
}

function faucetAdapter() {
  return {
    id: "faucet",
    label: "水龙头适配器",
    match(context) {
      return context.signals.hasFaucet ? 86 : 20;
    },
    analyze(context) {
      return buildSignalsContext(context);
    },
    compile(context) {
      const useWallet = context.signals.hasWallet || context.signals.hasAddressField;
      const workflow = createBaseUrlWorkflow(context, {
        id: "faucet",
        label: "水龙头适配器",
        confidence: 86,
        matchReason: "识别到 faucet / test token / wallet address 等水龙头线索。",
      });

      workflow.account = useWallet
        ? createAccountModel("privateKeys")
        : createAccountModel("accounts", ["email", "wallet"]);
      workflow.steps = [
        makeBrowserOpenStep(context.sourceUrl, "打开水龙头页面", "import"),
        createWorkflowStep({
          type: "request",
          title: "水龙头领取草案",
          source: "import",
          config: {
            type: "request",
            name: "claim_faucet",
            method: "POST",
            url: "https://example.com/api/faucet",
            headers: {
              "Content-Type": "application/json",
            },
            body: {
              wallet: useWallet ? "{{account.address}}" : "{{account.wallet}}",
              captchaToken: "{{env.CAPTCHA_TOKEN}}",
            },
            notes: ["自动识别为 faucet 任务，请把 URL 和验证码字段补成真实值。"],
          },
        }),
      ];

      if (context.signals.hasCaptcha) {
        workflow.steps.push(makeCaptchaStep(context.sourceUrl));
      }

      return normalizeWorkflow(workflow);
    },
    diagnose(context) {
      return context.signals.hasCaptcha ? ["水龙头站点带验证码，建议先配置 CAPTCHA_TOKEN。"] : [];
    },
  };
}

function browserAuthAdapter() {
  return {
    id: "browser-auth",
    label: "浏览器登录适配器",
    match(context) {
      return context.signals.hasLogin ? 73 : 18;
    },
    analyze(context) {
      return buildSignalsContext(context);
    },
    compile(context) {
      const workflow = createBaseUrlWorkflow(context, {
        id: "browser-auth",
        label: "浏览器登录适配器",
        confidence: 73,
        matchReason: "识别到 login/sign in/email/password 表单结构。",
      });

      workflow.account = createAccountModel("accounts", ["email", "password"]);
      workflow.steps = [
        makeBrowserOpenStep(context.sourceUrl, "打开登录页面", "import"),
        createWorkflowStep({
          type: "browserAction",
          title: "浏览器登录草案",
          source: "import",
          config: {
            type: "browserAction",
            name: "fill_login_form",
            url: context.sourceUrl,
            action: "fill_and_submit",
            selector: context.artifact.forms[0] || "form",
            inputValue: "{{account.email}} / {{account.password}}",
            waitFor: "networkidle",
            captureNetwork: true,
            notes: ["应用内运行会优先尝试复用浏览器登录态，必要时再人工补登录。"],
          },
        }),
        makeBrowserExtractStep(context.sourceUrl, ["form", "button", "input"], [
          "登录后提取 token/cookie/本地存储，再回填到后续步骤。",
        ]),
      ];

      if (context.signals.hasCaptcha) {
        workflow.steps.push(makeCaptchaStep(context.sourceUrl));
      }

      return normalizeWorkflow(workflow);
    },
    diagnose(context) {
      return context.signals.hasDynamicEncryption
        ? ["登录页可能带前端加密参数，请在生成后结合网络面板复核。"] : [];
    },
  };
}

const ADAPTERS = [
  genericWebAdapter(),
  genericEvmAdapter(),
  genericSolanaAdapter(),
  contentUploadAdapter(),
  claimCenterAdapter(),
  faucetAdapter(),
  browserAuthAdapter(),
];

function listAdapters() {
  return ADAPTERS.map((adapter) => ({
    id: adapter.id,
    label: adapter.label,
  }));
}

function scoreAdapters(context) {
  return ADAPTERS
    .map((adapter) => ({
      id: adapter.id,
      label: adapter.label,
      score: Number(adapter.match(context) || 0),
      adapter,
    }))
    .sort((left, right) => right.score - left.score);
}

function selectAdapter(context) {
  const ranked = scoreAdapters(context);
  const picked = ranked[0] || null;

  return {
    picked,
    ranked: ranked.map(({ adapter, ...rest }) => rest),
  };
}

module.exports = {
  ADAPTERS,
  listAdapters,
  scoreAdapters,
  selectAdapter,
};
