function getBearerHeaders(authMode) {
  const headers = {
    "Content-Type": "application/json",
  };

  if (authMode !== "none") {
    headers.Authorization = "Bearer {{state.token}}";
  }

  return headers;
}

function buildAuthConfig({ authMode, accountSource, accountFields }) {
  if (authMode === "none") {
    return null;
  }

  if (authMode === "account_token") {
    return {
      type: "account_token",
      tokenField: "token",
      notes: [
        "`data/tokens.txt` 每行放一个 Bearer Token。",
        "如果不是 Bearer Token，而是其他票据，请自己改任务 headers。",
      ],
    };
  }

  if (authMode === "request") {
    const body = {};

    if (accountSource === "accounts") {
      accountFields.forEach((field) => {
        body[field] = `{{account.${field}}}`;
      });
    } else if (accountSource === "privateKeys") {
      body.address = "{{account.address}}";
    }

    return {
      type: "request",
      notes: [
        "把 `request.url` 改成真实登录接口。",
        "把 `extractTokenPath` 改成 token 在响应体里的实际路径。",
      ],
      request: {
        method: "POST",
        url: "https://example.com/api/login",
        headers: {
          "Content-Type": "application/json",
        },
        body,
      },
      extractTokenPath: "data.token",
    };
  }

  if (authMode === "evm_sign") {
    return {
      type: "evm_sign",
      notes: [
        "很多站点是 `nonce -> signMessage -> login` 三段式，这个模板就是给这种站点准备的。",
        "把 `messagePath` 改成后端返回待签名文案的真实路径。",
      ],
      nonceRequest: {
        method: "POST",
        url: "https://example.com/api/auth/nonce",
        headers: {
          "Content-Type": "application/json",
        },
        body: {
          address: "{{account.address}}",
        },
      },
      messagePath: "data.message",
      loginRequest: {
        method: "POST",
        url: "https://example.com/api/auth/login",
        headers: {
          "Content-Type": "application/json",
        },
        body: {
          address: "{{account.address}}",
          message: "{{auth.message}}",
          signature: "{{auth.signature}}",
        },
      },
      extractTokenPath: "data.token",
    };
  }

  return null;
}

const TASK_PRESETS = [
  {
    id: "api_checkin",
    label: "API 签到",
    summary: "适合常见的 daily check-in、claim reward、签到按钮接口。",
    requiresPrivateKey: false,
    build({ authMode }) {
      return {
        type: "request",
        name: "daily_checkin",
        notes: [
          "改成真实签到接口。",
          "如果站点是 GET 签到，就把 method 改成 GET。",
        ],
        method: "POST",
        url: "https://example.com/api/checkin",
        headers: getBearerHeaders(authMode),
        body: {},
      };
    },
  },
  {
    id: "api_heartbeat",
    label: "API 心跳",
    summary: "适合保活、ping、refresh-points、extension heartbeat 这类任务。",
    requiresPrivateKey: false,
    build({ authMode }) {
      return {
        type: "request",
        name: "heartbeat",
        notes: [
          "适合 3DOS 这类定时 ping/refresh 的项目。",
          "如果心跳需要额外头部，在 headers 里补上。",
        ],
        method: "POST",
        url: "https://example.com/api/heartbeat",
        headers: getBearerHeaders(authMode),
        body: {},
      };
    },
  },
  {
    id: "api_faucet",
    label: "API 水龙头",
    summary: "适合网页 faucet、claim token、领取测试币接口。",
    requiresPrivateKey: false,
    build({ authMode, accountSource }) {
      return {
        type: "request",
        name: "claim_faucet",
        notes: [
          "如果 faucet 有验证码，先在 `.env` 填 `CAPTCHA_TOKEN` 或后面自己接验证码平台。",
          "如果地址字段名不叫 wallet，请自己调整 body。",
        ],
        method: "POST",
        url: "https://example.com/api/faucet",
        headers: getBearerHeaders(authMode),
        body: {
          wallet:
            accountSource === "privateKeys"
              ? "{{account.address}}"
              : "{{account.wallet}}",
          captchaToken: "{{env.CAPTCHA_TOKEN}}",
        },
      };
    },
  },
  {
    id: "api_request",
    label: "通用 API 请求",
    summary: "适合任意 GET/POST 表单、任务提交、绑定邀请码、普通站点动作。",
    requiresPrivateKey: false,
    build({ authMode }) {
      return {
        type: "request",
        name: "custom_api_action",
        notes: [
          "这是最通用的接口积木，适合你已经知道要调哪个 API 的场景。",
          "把 method、url、headers、body 改成目标网站真实值。",
        ],
        method: "POST",
        url: "https://example.com/api/action",
        headers: getBearerHeaders(authMode),
        body: {
          action: "replace_me",
        },
      };
    },
  },
  {
    id: "api_batch_submit",
    label: "批量提交行数据",
    summary: "从文本文件逐行读参数，适合 quiz、答题、内容链接、任务 ID 批量提交。",
    requiresPrivateKey: false,
    build({ authMode }) {
      return {
        type: "requestFromFile",
        name: "submit_rows_from_file",
        notes: [
          "适合批量提交任务答案、链接、邀请码、任务 ID。",
          "把 `fields`、`dataFile` 和 `request.body` 改成真实项目需要的字段。",
        ],
        dataFile: "data/requestRows.txt",
        delimiter: "|",
        fields: ["taskId", "answer"],
        stopOnError: false,
        delayAfterEachMs: 1500,
        request: {
          method: "POST",
          url: "https://example.com/api/tasks/submit",
          headers: getBearerHeaders(authMode),
          body: {
            taskId: "{{row.taskId}}",
            answer: "{{row.answer}}",
          },
        },
      };
    },
  },
  {
    id: "api_claim_list",
    label: "列表奖励领取",
    summary: "先拉任务列表，再批量 claim 未领取项目。",
    requiresPrivateKey: false,
    build({ authMode }) {
      return {
        type: "claimList",
        name: "claim_unclaimed_items",
        notes: [
          "适合 UNICH 社交奖励、任务列表 claim、活动奖励领取。",
          "把 `itemsPath`、`filter.field`、`claimRequest.url` 改成真实值。",
        ],
        listRequest: {
          method: "GET",
          url: "https://example.com/api/tasks",
          headers: getBearerHeaders(authMode),
        },
        itemsPath: "data.items",
        filter: {
          field: "claimed",
          equals: false,
        },
        claimRequest: {
          method: "POST",
          url: "https://example.com/api/tasks/{{item.id}}/claim",
          headers: getBearerHeaders(authMode),
          body: {},
        },
      };
    },
  },
  {
    id: "contract_call",
    label: "通用合约写入",
    summary: "适合 GM、Claim、Mint、Domain、approve、router 操作。",
    requiresPrivateKey: true,
    build() {
      return {
        type: "contractWrite",
        name: "contract_action",
        notes: [
          "把合约地址、ABI 和方法名改成真实项目值。",
          "如果方法要付原生币，可设置 `value` 和 `valueUnit`。",
        ],
        contractAddress: "0x0000000000000000000000000000000000000000",
        abi: [
          "function claim() external",
        ],
        method: "claim",
        args: [],
        gasLimit: "300000",
      };
    },
  },
  {
    id: "native_transfer",
    label: "原生币转账",
    summary: "适合链上发送原生币、模拟交易、活跃地址。",
    requiresPrivateKey: true,
    build() {
      return {
        type: "nativeTransfer",
        name: "send_native_token",
        notes: [
          "适合 PushChain 的模拟交易或给新钱包打 gas。",
          "金额默认按 ether 单位解释。",
        ],
        to: "0x000000000000000000000000000000000000dEaD",
        amount: "0.001",
        amountUnit: "ether",
      };
    },
  },
  {
    id: "erc20_transfer",
    label: "ERC20 代币转账",
    summary: "适合发送测试稳定币、平台积分币、空投代币。",
    requiresPrivateKey: true,
    build() {
      return {
        type: "contractWrite",
        name: "transfer_erc20_token",
        notes: [
          "把 token 合约地址、接收地址、数量改掉。",
          "如果代币不是 18 位精度，请直接填最小单位字符串。",
        ],
        contractAddress: "0x0000000000000000000000000000000000000000",
        abi: [
          "function transfer(address to, uint256 amount) external returns (bool)",
        ],
        method: "transfer",
        args: [
          "0x000000000000000000000000000000000000dEaD",
          "1000000000000000000",
        ],
        gasLimit: "150000",
      };
    },
  },
  {
    id: "deploy_contract",
    label: "部署合约",
    summary: "适合测试网部署 Hello 合约、刷 deploy 任务。",
    requiresPrivateKey: true,
    build() {
      return {
        type: "deployContract",
        name: "deploy_hello_contract",
        notes: [
          "这是 Tempo 风格的部署模板。",
          "如果项目要求固定源码或构造参数，直接改 `sourceCode` 和 `constructorArgs`。",
        ],
        contractName: "HelloTask",
        sourceCode:
          'pragma solidity ^0.8.20; contract HelloTask { string public message = "hello"; function setMessage(string calldata nextMessage) external { message = nextMessage; } }',
        constructorArgs: [],
        gasLimit: "2500000",
      };
    },
  },
  {
    id: "wait_step",
    label: "等待步骤",
    summary: "适合任务之间强制停顿，模拟人工节奏。",
    requiresPrivateKey: false,
    build() {
      return {
        type: "wait",
        name: "wait_between_actions",
        notes: [
          "如果某些接口要求间隔几秒再操作，可保留这个步骤。",
        ],
        delayMs: 5000,
      };
    },
  },
];

function getAvailablePresets({ accountSource }) {
  if (accountSource !== "privateKeys") {
    return TASK_PRESETS.filter((preset) => !preset.requiresPrivateKey);
  }

  return TASK_PRESETS;
}

module.exports = {
  TASK_PRESETS,
  getAvailablePresets,
  buildAuthConfig,
};
